import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Card, CardValue } from '../src/card.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const suits = { H: 'HEARTS', S: 'SPADES', C: 'CLUBS', D: 'DIAMONDS' } as const;
function cards(deck: string): Card[] {
  return deck.split(',').map(card => ({
    suit: suits[card[0] as keyof typeof suits],
    value: card.slice(1) as CardValue,
  }));
}

const fixtures = [
  {
    id: 'A', name: 'Player bust', deck: 'H10,C6,D8,S7,HJ',
    output: 'Winner: Dealer\nDealer | 15 | D8,S7\nPlayer | 26 | H10,C6,HJ\n',
  },
  {
    id: 'B', name: 'Dealer bust', deck: 'H10,C7,S9,D8,CJ',
    output: 'Winner: Player\nDealer | 27 | S9,D8,CJ\nPlayer | 17 | H10,C7\n',
  },
  {
    id: 'C', name: 'both natural Blackjacks', deck: 'HA,S10,DA,CK',
    output: 'Winner: Dealer\nDealer | 21 | DA,CK\nPlayer | 21 | HA,S10\n',
  },
  {
    id: 'D', name: 'three-card 21 and dealer tie', deck: 'H10,C6,D10,S7,H5,C4,D2',
    output: 'Winner: Player\nDealer | 23 | D10,S7,C4,D2\nPlayer | 21 | H10,C6,H5\n',
  },
];
const routes: Record<string, { status?: number; body: string }> = {
  ...Object.fromEntries(fixtures.map(({ id, deck }) => [`/${id}`, { body: JSON.stringify(cards(deck)) }])),
  '/http-error': { status: 500, body: 'unavailable' },
  '/invalid-json': { body: '{' },
  '/invalid-cards': { body: JSON.stringify([{ suit: 'HEARTS', value: 5 }, ...cards('C6,D8,S7')]) },
  '/short-deck': { body: '[]' },
  '/exhausted': { body: JSON.stringify(cards('H8,C8,D8,S8')) },
};
let baseUrl: string;
let requests: string[];
const server = createServer((request, response) => {
  requests.push(`${request.method} ${request.url}`);
  const route = routes[request.url ?? ''];
  response.writeHead(route?.status ?? (route ? 200 : 404), { 'content-type': 'application/json' });
  response.end(route?.body);
});

beforeAll(async () => {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => { requests = []; });

afterAll(async () => {
  if (!server.listening) return;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  });
});

function run(args: string[], command = process.execPath) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 4_000 });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (signal) reject(new Error(`CLI terminated by ${signal}.`));
      else resolve({ stdout, stderr, code });
    });
  });
}

describe('compiled CLI', () => {
  it.each(fixtures)('plays fixture $id: $name', async ({ id, output }) => {
    expect(await run(['dist/cli.js', `${baseUrl}/${id}`])).toEqual({
      stdout: output, stderr: '', code: 0,
    });
    expect(requests).toEqual([`GET /${id}`]);
  });

  it.each([
    {
      id: 'A', position: 'before',
      output: 'Winner: Dealer\nDealer | 15 | D8,S7\nZoë 王 | 26 | H10,C6,HJ\n',
    },
    {
      id: 'D', position: 'after',
      output: 'Winner: Zoë 王\nDealer | 23 | D10,S7,C4,D2\nZoë 王 | 21 | H10,C6,H5\n',
    },
  ])('uses a trimmed Unicode name $position the URL for fixture $id', async ({ id, position, output }) => {
    const url = `${baseUrl}/${id}`;
    const name = ['--name', '  Zoë 王  '];
    const args = position === 'before' ? [...name, url] : [url, ...name];

    expect(await run(['dist/cli.js', ...args])).toEqual({ stdout: output, stderr: '', code: 0 });
    expect(requests).toEqual([`GET /${id}`]);
  });

  it.each(['-h', '--help'])('prints %s without requesting a deck', async flag => {
    const result = await run(['dist/cli.js', `${baseUrl}/A`, flag]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('Usage: node dist/cli.js');
    expect(result.stdout).toContain('--name');
    expect(result.stdout).toContain('without interactive input');
    expect(requests).toEqual([]);
  });

  it.each([
    { name: 'unknown option', args: ['--unknown'], error: /unknown option/i },
    { name: 'invalid player name', args: ['--name', 'Alex|Smith'], error: /Player name/ },
    { name: 'malformed URL', args: ['not a URL'], error: /Invalid deck URL: not a URL/ },
    { name: 'unsupported protocol', args: ['ftp://example.com/deck'], error: /HTTP or HTTPS/ },
  ])('rejects $name without HTTP', async ({ args, error }) => {
    const result = await run(['dist/cli.js', ...args]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(error);
    expect(requests).toEqual([]);
  });

  it.each([
    { name: 'HTTP failure', path: '/http-error', error: /HTTP 500/ },
    { name: 'invalid JSON', path: '/invalid-json', error: /not valid JSON/ },
    { name: 'invalid cards', path: '/invalid-cards', error: /array of valid cards/ },
    { name: 'undersized deck', path: '/short-deck', error: /Not enough cards/ },
    { name: 'gameplay exhaustion', path: '/exhausted', error: /Deck exhausted/ },
  ])('reports $name without partial output', async ({ path, error }) => {
    const result = await run(['dist/cli.js', `${baseUrl}${path}`]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(error);
    expect(requests).toEqual([`GET ${path}`]);
  });

  it('returns identical output in separate processes for the same deck', async () => {
    const args = ['dist/cli.js', `${baseUrl}/D`];
    const first = await run(args);
    const second = await run(args);

    expect(first).toEqual({ stdout: fixtures[3].output, stderr: '', code: 0 });
    expect(second).toEqual(first);
    expect(requests).toEqual(['GET /D', 'GET /D']);
  });

  it('runs through npm --silent start with a custom name', async () => {
    const result = await run(['--silent', 'start', '--', `${baseUrl}/D`, '--name', 'Alex Smith'], 'npm');

    expect(result).toEqual({
      stdout: 'Winner: Alex Smith\nDealer | 23 | D10,S7,C4,D2\nAlex Smith | 21 | H10,C6,H5\n',
      stderr: '', code: 0,
    });
    expect(requests).toEqual(['GET /D']);
  });
});
