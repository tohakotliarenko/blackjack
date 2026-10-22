import { CARD_SUITS, CARD_VALUES, type Card } from './card.js';

const MIN_GAME_CARDS = 4;

function isCard(card: unknown): card is Card {
  return (
    typeof card === 'object' &&
    card !== null &&
    'suit' in card &&
    CARD_SUITS.some(suit => suit === card.suit) &&
    'value' in card &&
    CARD_VALUES.some(value => value === card.value)
  );
}

export async function fetchDeck(url: string): Promise<Card[]> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid deck URL: ${url}`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error('Deck URL must use HTTP or HTTPS.');
  }

  const signal = AbortSignal.timeout(10_000);
  let deck: unknown;
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    deck = await response.json();
  } catch (error) {
    if (signal.aborted) {
      throw new Error('Deck request timed out after 10 seconds.', { cause: error });
    }
    if (error instanceof SyntaxError) {
      throw new Error('Deck response is not valid JSON.', { cause: error });
    }
    throw new Error(
      `Failed to load deck: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (!Array.isArray(deck) || !deck.every(isCard)) {
    throw new Error('Deck response must be an array of valid cards.');
  }

  if (deck.length < MIN_GAME_CARDS) {
    throw new Error('Not enough cards in the deck to start the game.');
  }

  return deck;
}
