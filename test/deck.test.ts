import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../src/card.js';
import { fetchDeck } from '../src/deck.js';

const defaultUrl = 'https://sandbox.getunleash.io/blackjack/shuffle';
const customUrl = 'https://example.com/deck';
const card: Card = { suit: 'HEARTS', value: '5' };
const deck: Card[] = [
  { suit: 'HEARTS', value: '2' },
  { suit: 'SPADES', value: '3' },
  { suit: 'CLUBS', value: '4' },
  { suit: 'DIAMONDS', value: '5' },
  { suit: 'HEARTS', value: '6' },
  { suit: 'SPADES', value: '7' },
  { suit: 'CLUBS', value: '8' },
  { suit: 'DIAMONDS', value: '9' },
  { suit: 'HEARTS', value: '10' },
  { suit: 'SPADES', value: 'J' },
  { suit: 'CLUBS', value: 'Q' },
  { suit: 'DIAMONDS', value: 'K' },
  { suit: 'HEARTS', value: 'A' },
];
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fetchDeck', () => {
  it.each([
    { name: 'omitted URL', args: [], expectedUrl: defaultUrl },
    { name: 'undefined URL', args: [undefined], expectedUrl: defaultUrl },
    { name: 'custom HTTPS URL', args: [customUrl], expectedUrl: customUrl },
    {
      name: 'custom HTTP URL',
      args: ['http://localhost/deck'],
      expectedUrl: 'http://localhost/deck',
    },
  ] satisfies { name: string; args: [string?]; expectedUrl: string }[])(
    'makes one GET for $name and preserves all suits, ranks and card order',
    async ({ args, expectedUrl }) => {
      fetchMock.mockResolvedValue(Response.json(deck));

      expect(await fetchDeck(...args)).toEqual(deck);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      );
      expect(fetchMock.mock.calls[0][1]?.method ?? 'GET').toBe('GET');
    },
  );

  it.each([
    { name: 'four-card deck', data: deck.slice(0, 4) },
    { name: 'duplicate cards', data: [card, card, card, card] },
    {
      name: 'extra card fields',
      data: [...deck.slice(0, 3), { ...card, label: 'five of hearts' }],
    },
  ])('accepts $name', async ({ data }) => {
    fetchMock.mockResolvedValue(Response.json(data));

    expect(await fetchDeck(customUrl)).toEqual(data);
  });

  it.each([0, 1, 2, 3])('rejects an initial deck of %i cards', async length => {
    const initialDeck: Card[] = [
      { suit: 'HEARTS', value: 'A' },
      { suit: 'SPADES', value: '10' },
      { suit: 'DIAMONDS', value: '9' },
    ];
    fetchMock.mockResolvedValue(Response.json(initialDeck.slice(0, length)));

    await expect(fetchDeck(customUrl)).rejects.toThrow(
      'Not enough cards in the deck to start the game.',
    );
  });

  it.each(['', 'not a URL', '/deck'])('rejects malformed URL %j before fetching', async url => {
    await expect(fetchDeck(url)).rejects.toThrow(`Invalid deck URL: ${url}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['ftp://example.com/deck', 'file:///deck.json'])(
    'rejects unsupported protocol in %j before fetching',
    async url => {
      await expect(fetchDeck(url)).rejects.toThrow('Deck URL must use HTTP or HTTPS.');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([404, 429, 500, 503])(
    'rejects HTTP %i without reading JSON or retrying',
    async status => {
      const response = new Response('not JSON', { status });
      const readBody = vi.spyOn(response, 'json');
      fetchMock.mockResolvedValue(response);

      await expect(fetchDeck(customUrl)).rejects.toThrow(`HTTP ${status}`);
      expect(readBody).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { name: 'DNS failure', code: 'ENOTFOUND' },
    { name: 'refused connection', code: 'ECONNREFUSED' },
    { name: 'disconnection', code: 'ECONNRESET' },
  ])('preserves the cause of a $name without retrying or falling back', async ({ code }) => {
    const cause = Object.assign(new Error(code), { code });
    const error = new TypeError('fetch failed', { cause });
    fetchMock.mockRejectedValue(error);

    await expect(fetchDeck(customUrl)).rejects.toMatchObject({
      message: 'Failed to load deck: fetch failed',
      cause: error,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(customUrl, expect.anything());
  });

  it('reports a body disconnection as a transport failure', async () => {
    const error = new TypeError('terminated');
    const response = new Response();
    vi.spyOn(response, 'json').mockRejectedValue(error);
    fetchMock.mockResolvedValue(response);

    await expect(fetchDeck(customUrl)).rejects.toMatchObject({
      message: 'Failed to load deck: terminated',
      cause: error,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['before headers', 'while reading the body'])(
    'times out after 10 seconds %s',
    async stage => {
      const controller = new AbortController();
      const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
      const waitForAbort = () =>
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => reject(controller.signal.reason), {
            once: true,
          });
        });
      const readBody = vi.fn(waitForAbort);
      fetchMock.mockImplementation((_url, options) => {
        expect(options?.signal).toBe(controller.signal);
        if (stage === 'before headers') return waitForAbort();
        const response = new Response();
        vi.spyOn(response, 'json').mockImplementation(readBody);
        return Promise.resolve(response);
      });

      const pending = fetchDeck(customUrl);
      const rejection = expect(pending).rejects.toMatchObject({
        message: 'Deck request timed out after 10 seconds.',
        cause: expect.any(DOMException),
      });
      // Let the resolved headers reach the body reader before triggering its abort.
      await Promise.resolve();
      controller.abort(new DOMException('Timed out', 'TimeoutError'));

      await rejection;
      expect(timeout).toHaveBeenCalledWith(10_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(readBody).toHaveBeenCalledTimes(stage === 'before headers' ? 0 : 1);
    },
  );

  it.each(['{', ''])('rejects malformed JSON %j', async body => {
    fetchMock.mockResolvedValue(new Response(body));

    await expect(fetchDeck(customUrl)).rejects.toMatchObject({
      message: 'Deck response is not valid JSON.',
      cause: expect.any(SyntaxError),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: 'object root', data: {} },
    { name: 'null root', data: null },
    { name: 'string root', data: 'deck' },
    { name: 'numeric root', data: 5 },
    { name: 'null card', data: [null] },
    { name: 'primitive card', data: ['H5'] },
    { name: 'array card', data: [[]] },
    { name: 'missing suit', data: [{ value: '5' }] },
    { name: 'missing value', data: [{ suit: 'HEARTS' }] },
    { name: 'unknown suit', data: [{ ...card, suit: 'STARS' }] },
    { name: 'lowercase suit', data: [{ ...card, suit: 'hearts' }] },
    { name: 'numeric suit', data: [{ ...card, suit: 5 }] },
    { name: 'unsupported rank', data: [{ ...card, value: '11' }] },
    { name: 'lowercase rank', data: [{ ...card, value: 'j' }] },
    { name: 'numeric rank', data: [{ ...card, value: 5 }] },
    { name: 'null rank', data: [{ ...card, value: null }] },
    { name: 'invalid later card', data: [card, { ...card, value: '1' }] },
  ])('rejects a deck with $name', async ({ data }) => {
    fetchMock.mockResolvedValue(Response.json(data));

    await expect(fetchDeck(customUrl)).rejects.toThrow(
      'Deck response must be an array of valid cards.',
    );
  });
});
