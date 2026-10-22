import { describe, expect, it } from 'vitest';
import type { Card, CardValue } from '../src/card.js';
import { formatGameResult } from '../src/formatter.js';
import type { GameResult } from '../src/game.js';

const suits = { H: 'HEARTS', S: 'SPADES', C: 'CLUBS', D: 'DIAMONDS' } as const;

function hand(score: number, codes: string): GameResult['player'] {
  const cards: Card[] = codes.split(',').map(code => ({
    suit: suits[code[0] as keyof typeof suits],
    value: code.slice(1) as CardValue,
  }));
  return { score, cards };
}

const cases: { name: string; result: GameResult; expected: string }[] = [
  {
    name: 'dealer bust',
    result: {
      winner: 'player',
      dealer: hand(27, 'S7,S10,CJ'),
      player: hand(19, 'D2,H2,C6,H9'),
    },
    expected: `Winner: Player
Dealer | 27 | S7,S10,CJ
Player | 19 | D2,H2,C6,H9`,
  },
  {
    name: 'player bust',
    result: {
      winner: 'dealer',
      dealer: hand(15, 'D8,S7'),
      player: hand(26, 'H10,C6,HQ'),
    },
    expected: `Winner: Dealer
Dealer | 15 | D8,S7
Player | 26 | H10,C6,HQ`,
  },
  {
    name: 'the supplied dealer winner when both hands have Blackjack',
    result: {
      winner: 'dealer',
      dealer: hand(21, 'DA,CK'),
      player: hand(21, 'HA,S10'),
    },
    expected: `Winner: Dealer
Dealer | 21 | DA,CK
Player | 21 | HA,S10`,
  },
  {
    name: 'longer hands in their original order',
    result: {
      winner: 'player',
      dealer: hand(22, 'H5,C6,DA'),
      player: hand(17, 'H2,C3,D4,S8'),
    },
    expected: `Winner: Player
Dealer | 22 | H5,C6,DA
Player | 17 | H2,C3,D4,S8`,
  },
];

describe('formatGameResult', () => {
  // Together these fixtures cover every suit and rank. Exact strings also
  // check separators, line order and the absence of a trailing newline.
  it.each(cases)('formats $name', ({ result, expected }) => {
    expect(formatGameResult(result, 'Player')).toBe(expected);
  });

  it.each([
    {
      winner: 'player',
      result: cases[0].result,
      expected: `Winner: Zoë 王
Dealer | 27 | S7,S10,CJ
Zoë 王 | 19 | D2,H2,C6,H9`,
    },
    {
      winner: 'dealer',
      result: cases[1].result,
      expected: `Winner: Dealer
Dealer | 15 | D8,S7
Zoë 王 | 26 | H10,C6,HQ`,
    },
  ])('preserves a custom name when $winner wins', ({ result, expected }) => {
    expect(formatGameResult(result, 'Zoë 王')).toBe(expected);
  });

  it('prints supplied scores without recalculating them from the cards', () => {
    const result: GameResult = {
      ...cases[0].result,
      dealer: { ...cases[0].result.dealer, score: 28 },
      player: { ...cases[0].result.player, score: 20 },
    };

    expect(formatGameResult(result, 'Player')).toBe(`Winner: Player
Dealer | 28 | S7,S10,CJ
Player | 20 | D2,H2,C6,H9`);
  });

  it('is repeatable without mutating the result, hands or cards', () => {
    const result = structuredClone(cases[0].result);
    const original = structuredClone(result);
    for (const currentHand of [result.player, result.dealer]) {
      currentHand.cards.forEach(card => Object.freeze(card));
      Object.freeze(currentHand.cards);
      Object.freeze(currentHand);
    }
    Object.freeze(result);

    expect(formatGameResult(result, 'Player')).toBe(cases[0].expected);
    expect(formatGameResult(result, 'Player')).toBe(cases[0].expected);
    expect(result).toEqual(original);
  });
});
