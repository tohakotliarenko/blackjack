import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../src/card.js';
import { runCli } from '../src/cli.js';
import { fetchDeck } from '../src/deck.js';
import { formatGameResult } from '../src/formatter.js';
import { playGame, type GameResult } from '../src/game.js';

vi.mock('../src/deck.js');
vi.mock('../src/formatter.js');
vi.mock('../src/game.js');

const url = 'https://example.com/deck';
const deck: Card[] = [
  { suit: 'HEARTS', value: 'A' },
  { suit: 'SPADES', value: '10' },
  { suit: 'DIAMONDS', value: '9' },
  { suit: 'CLUBS', value: '7' },
];
const result: GameResult = {
  winner: 'player',
  player: { cards: deck.slice(0, 2), score: 21 },
  dealer: { cards: deck.slice(2), score: 16 },
};
let stdout: string;
let stderr: string;

beforeEach(() => {
  vi.resetAllMocks();
  stdout = '';
  stderr = '';
  vi.spyOn(process.stdout, 'write').mockImplementation(chunk => {
    stdout += String(chunk);
    return true;
  });
  vi.spyOn(process.stderr, 'write').mockImplementation(chunk => {
    stderr += String(chunk);
    return true;
  });
  vi.mocked(fetchDeck).mockResolvedValue(deck);
  vi.mocked(playGame).mockReturnValue(result);
  vi.mocked(formatGameResult).mockReturnValue('formatted result');
});

afterEach(() => vi.restoreAllMocks());

describe('runCli', () => {
  it.each([
    { name: 'defaults', args: [], expectedUrl: undefined, playerName: undefined },
    { name: 'custom URL', args: [url], expectedUrl: url, playerName: undefined },
    {
      name: 'name with default URL',
      args: ['--name', 'Alex Smith'],
      expectedUrl: undefined,
      playerName: 'Alex Smith',
    },
    {
      name: 'name before URL',
      args: ['--name', 'Zoë 王', url],
      expectedUrl: url,
      playerName: 'Zoë 王',
    },
    {
      name: 'trimmed name after URL',
      args: [url, '--name', '  Zoë 王  '],
      expectedUrl: url,
      playerName: 'Zoë 王',
    },
  ])('runs the pipeline with $name', async ({ args, expectedUrl, playerName }) => {
    expect(await runCli(args)).toBe(0);
    expect(fetchDeck).toHaveBeenCalledExactlyOnceWith(expectedUrl);
    expect(playGame).toHaveBeenCalledExactlyOnceWith(deck);
    expect(formatGameResult).toHaveBeenCalledExactlyOnceWith(result, playerName);
    expect(stdout).toBe('formatted result\n');
    expect(stderr).toBe('');
  });

  it.each(['-h', '--help'])('prints help for %s without starting a game', async flag => {
    expect(await runCli([url, flag])).toBe(0);
    expect(stdout).toContain('Usage: node dist/cli.js [deck-url] [--name <player-name>]');
    expect(stdout).toContain('https://sandbox.getunleash.io/blackjack/shuffle');
    expect(stdout).toContain('Default: Player');
    expect(stdout).toContain('-h, --help');
    expect(stdout).toContain('without interactive input');
    expect(stderr).toBe('');
    expect(fetchDeck).not.toHaveBeenCalled();
    expect(playGame).not.toHaveBeenCalled();
    expect(formatGameResult).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'unknown option', args: ['--unknown'], error: /unknown option/i },
    { name: 'multiple URLs', args: [url, url], error: /at most one deck URL/ },
    { name: 'missing name value', args: ['--name'], error: /argument missing/i },
    { name: 'empty name', args: ['--name', ''], error: /name must not be empty/ },
    { name: 'whitespace-only name', args: ['--name', '   '], error: /name must not be empty/ },
    { name: 'pipe in name', args: ['--name', 'Alex|Smith'], error: /control characters/ },
    { name: 'newline in name', args: ['--name', 'Alex\nSmith'], error: /control characters/ },
    { name: 'surrounding tabs', args: ['--name', '\tAlex\t'], error: /control characters/ },
    { name: 'DEL in name', args: ['--name', 'Alex\u007f'], error: /control characters/ },
    { name: 'Unicode line separator', args: ['--name', 'Alex\u2028Smith'], error: /line breaks/ },
  ])('rejects $name before fetching', async ({ args, error }) => {
    expect(await runCli(args)).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toMatch(error);
    expect(fetchDeck).not.toHaveBeenCalled();
    expect(playGame).not.toHaveBeenCalled();
    expect(formatGameResult).not.toHaveBeenCalled();
  });

  it.each(['fetching', 'gameplay'])(
    'reports a failure during %s without partial output',
    async stage => {
      const error = new Error('Something went wrong.');
      if (stage === 'fetching') vi.mocked(fetchDeck).mockRejectedValue(error);
      else
        vi.mocked(playGame).mockImplementation(() => {
          throw error;
        });

      expect(await runCli([url])).toBe(1);
      expect(stdout).toBe('');
      expect(stderr).toBe('Error: Something went wrong.\n');
      expect(fetchDeck).toHaveBeenCalledExactlyOnceWith(url);
      if (stage === 'fetching') expect(playGame).not.toHaveBeenCalled();
      expect(formatGameResult).not.toHaveBeenCalled();
    },
  );
});
