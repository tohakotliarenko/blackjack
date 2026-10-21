import { describe, expect, it } from 'vitest';
import type { CardValue } from '../src/card.js';
import {
  calculateScores,
  checkBlackjack,
  createResult,
  dealerTurn,
  drawCard,
  getCardScore,
  initialDraw,
  isBlackjack,
  playerTurn,
  playGame,
  type GameResult,
} from '../src/game.js';

type Card = Parameters<typeof playGame>[0][number];
type ExpectedHand = { cards: string; score: number };
type ExpectedGame = {
  winner: GameResult['winner'];
  player: ExpectedHand;
  dealer: ExpectedHand;
};
type GameCase = ExpectedGame & { name: string; deck: string };

const suits = {
  H: 'HEARTS',
  C: 'CLUBS',
  D: 'DIAMONDS',
  S: 'SPADES',
} as const;

// Card shorthand keeps ordered fixtures readable; expected scores stay literal.
function cards(hand: string): Card[] {
  if (!hand) return [];

  return hand.split(',').map(card => ({
    suit: suits[card[0] as keyof typeof suits],
    value: card.slice(1) as CardValue,
  }));
}

function expectedResult({ winner, player, dealer }: ExpectedGame): GameResult {
  return {
    winner,
    player: { cards: cards(player.cards), score: player.score },
    dealer: { cards: cards(dealer.cards), score: dealer.score },
  };
}

const naturalCases: GameCase[] = [
  {
    name: 'Player natural wins before Dealer can draw',
    deck: 'HA,S10,D9,C7',
    winner: 'player',
    player: { cards: 'HA,S10', score: 21 },
    dealer: { cards: 'D9,C7', score: 16 },
  },
  {
    name: 'Dealer natural wins before Player can draw',
    deck: 'H10,C6,DA,SK',
    winner: 'dealer',
    player: { cards: 'H10,C6', score: 16 },
    dealer: { cards: 'DA,SK', score: 21 },
  },
  {
    name: 'both naturals give Dealer the win (fixture C)',
    deck: 'HA,S10,DA,CK',
    winner: 'dealer',
    player: { cards: 'HA,S10', score: 21 },
    dealer: { cards: 'DA,CK', score: 21 },
  },
];

const threeCard21: GameCase = {
  name: 'three-card 21 lets Dealer draw, tie and bust (fixture D)',
  deck: 'H10,C6,D10,S7,H5,C4,D2',
  winner: 'player',
  player: { cards: 'H10,C6,H5', score: 21 },
  dealer: { cards: 'D10,S7,C4,D2', score: 23 },
};

const gameCases: GameCase[] = [
  ...naturalCases,
  {
    name: 'Player bust ends the round without Dealer drawing (fixture A)',
    deck: 'H10,C6,D8,S7,HJ',
    winner: 'dealer',
    player: { cards: 'H10,C6,HJ', score: 26 },
    dealer: { cards: 'D8,S7', score: 15 },
  },
  {
    name: 'Dealer draws on an initial tie and busts (fixture B)',
    deck: 'H10,C7,S9,D8,CJ',
    winner: 'player',
    player: { cards: 'H10,C7', score: 17 },
    dealer: { cards: 'S9,D8,CJ', score: 27 },
  },
  threeCard21,
  {
    name: 'Dealer already ahead wins without drawing',
    deck: 'H10,C7,S10,D8',
    winner: 'dealer',
    player: { cards: 'H10,C7', score: 17 },
    dealer: { cards: 'S10,D8', score: 18 },
  },
  {
    name: 'Dealer draws until strictly ahead, including a tie after a hit',
    deck: 'H10,C8,S10,D6,H2,C2',
    winner: 'dealer',
    player: { cards: 'H10,C8', score: 18 },
    dealer: { cards: 'S10,D6,H2,C2', score: 20 },
  },
  {
    name: 'Player takes multiple hits to reach exactly 17; duplicates are valid',
    deck: 'H2,C3,D10,S8,H2,H10',
    winner: 'dealer',
    player: { cards: 'H2,C3,H2,H10', score: 17 },
    dealer: { cards: 'D10,S8', score: 18 },
  },
  {
    name: 'both initially bust and Player loses',
    deck: 'HA,CA,DA,SA',
    winner: 'dealer',
    player: { cards: 'HA,CA', score: 22 },
    dealer: { cards: 'DA,SA', score: 22 },
  },
  {
    name: 'Player must finish its turn before winning against a busted Dealer',
    deck: 'H10,C6,DA,SA,H2',
    winner: 'player',
    player: { cards: 'H10,C6,H2', score: 18 },
    dealer: { cards: 'DA,SA', score: 22 },
  },
  {
    name: 'Player bust takes precedence over an initial dealer bust',
    deck: 'H10,C6,DA,SA,HA',
    winner: 'dealer',
    player: { cards: 'H10,C6,HA', score: 27 },
    dealer: { cards: 'DA,SA', score: 22 },
  },
];

describe('playGame', () => {
  it.each(gameCases)('$name', scenario => {
    const deck = cards(scenario.deck);
    deck.forEach(card => Object.freeze(card));
    Object.freeze(deck);

    expect(playGame(deck)).toEqual(expectedResult(scenario));
    expect(deck).toEqual(cards(scenario.deck));
  });

  it.each([
    { turn: 'player', deck: 'H8,C8,D8,S8' },
    { turn: 'dealer', deck: 'H10,C7,D10,S7' },
  ])('reports exhaustion during the $turn turn without changing input', scenario => {
    const deck = cards(scenario.deck);
    Object.freeze(deck);

    expect(() => playGame(deck)).toThrow(/deck exhausted/i);
    expect(deck).toEqual(cards(scenario.deck));
  });

  it('gives the same result when reusing a deck across independent games', () => {
    const deck = cards(threeCard21.deck);
    const expected = expectedResult(threeCard21);

    expect(playGame(deck)).toEqual(expected);
    expect(playGame(cards(naturalCases[0].deck))).toEqual(expectedResult(naturalCases[0]));
    expect(playGame(deck)).toEqual(expected);
  });

  it('can play a valid round after a previous round exhausted its deck', () => {
    expect(() => playGame(cards('H8,C8,D8,S8'))).toThrow(/deck exhausted/i);
    expect(playGame(cards(threeCard21.deck))).toEqual(expectedResult(threeCard21));
  });

  it('leaves unused trailing cards out of the result', () => {
    const deck = cards(`${threeCard21.deck},H3`);

    expect(playGame(deck)).toEqual(expectedResult(threeCard21));
  });
});

describe('getCardScore', () => {
  it.each<[CardValue, number]>([
    ['2', 2],
    ['3', 3],
    ['4', 4],
    ['5', 5],
    ['6', 6],
    ['7', 7],
    ['8', 8],
    ['9', 9],
    ['10', 10],
    ['J', 10],
    ['Q', 10],
    ['K', 10],
    ['A', 11],
  ])('%s is worth %i points', (value, score) => {
    expect(getCardScore(value)).toBe(score);
  });
});

describe('calculateScores', () => {
  it.each([
    { hand: 'S7,S10,CJ', score: 27 },
    { hand: 'HA,CA', score: 22 },
    { hand: 'H10,C6,H5', score: 21 },
  ])('$hand totals $score without mutating input', ({ hand, score }) => {
    const input = cards(hand);
    input.forEach(card => Object.freeze(card));
    Object.freeze(input);

    expect(calculateScores(input)).toBe(score);
    expect(input).toEqual(cards(hand));
  });
});

describe('drawCard', () => {
  it('consumes cards from the front and reports exhaustion once empty', () => {
    const deck = cards('H2,C3');

    expect(drawCard(deck)).toEqual(cards('H2')[0]);
    expect(deck).toEqual(cards('C3'));
    expect(drawCard(deck)).toEqual(cards('C3')[0]);
    expect(deck).toEqual([]);
    expect(() => drawCard(deck)).toThrow(/deck exhausted/i);
  });
});

describe('initialDraw', () => {
  it('deals two to Player, then two to Dealer, preserving the rest', () => {
    const deck = cards('H10,C6,D8,S7,HJ');

    expect(initialDraw(deck)).toEqual({
      player: { cards: cards('H10,C6') },
      dealer: { cards: cards('D8,S7') },
    });
    expect(deck).toEqual(cards('HJ'));
  });
});

describe('isBlackjack', () => {
  // This score-only predicate assumes an initial two-card hand.
  it.each([
    { score: 20, expected: false },
    { score: 21, expected: true },
    { score: 22, expected: false },
  ])('classifies initial two-card score $score as $expected', ({ score, expected }) => {
    expect(isBlackjack(score)).toBe(expected);
  });
});

describe('checkBlackjack', () => {
  // Natural Blackjack outcomes are covered by playGame tests via naturalCases.

  it('leaves the round unresolved when neither initial hand has Blackjack', () => {
    const player = { cards: cards('H10,C7') };
    const dealer = { cards: cards('S10,D8') };

    expect(checkBlackjack(player, dealer)).toBeUndefined();
  });
});

describe('playerTurn', () => {
  it.each([
    {
      name: 'hits below 17 and stops above the threshold',
      initial: 'H10,C6',
      deck: 'H2,CJ',
      score: 18,
      final: 'H10,C6,H2',
      unused: 'CJ',
    },
    {
      name: 'takes multiple hits and stops at exactly 17',
      initial: 'H2,C3',
      deck: 'H2,H10,S4',
      score: 17,
      final: 'H2,C3,H2,H10',
      unused: 'S4',
    },
    {
      name: 'stops immediately after busting',
      initial: 'H10,C6',
      deck: 'HJ,S4',
      score: 26,
      final: 'H10,C6,HJ',
      unused: 'S4',
    },
    {
      name: 'does not draw when already bust with two Aces',
      initial: 'HA,CA',
      deck: 'S4',
      score: 22,
      final: 'HA,CA',
      unused: 'S4',
    },
  ])('$name', scenario => {
    const player = { cards: cards(scenario.initial) };
    const deck = cards(scenario.deck);

    expect(playerTurn(deck, player)).toBe(scenario.score);
    expect(player.cards).toEqual(cards(scenario.final));
    expect(deck).toEqual(cards(scenario.unused));
  });

  it.each([
    { hand: 'H10,C7', score: 17 },
    { hand: 'H10,C8', score: 18 },
    { hand: 'H10,C9', score: 19 },
    { hand: 'H10,CK', score: 20 },
  ])('stands at $score without drawing', ({ hand, score }) => {
    const player = { cards: cards(hand) };
    const deck = cards('H2,H3');

    expect(playerTurn(deck, player)).toBe(score);
    expect(player.cards).toEqual(cards(hand));
    expect(deck).toEqual(cards('H2,H3'));
  });
});

describe('dealerTurn', () => {
  it.each([
    {
      name: 'stands when already strictly ahead',
      playerScore: 17,
      initial: 'H10,C8',
      deck: 'H2',
      score: 18,
      final: 'H10,C8',
      unused: 'H2',
    },
    {
      name: 'draws on an initial tie and stops on bust',
      playerScore: 17,
      initial: 'S9,D8',
      deck: 'CJ,HA',
      score: 27,
      final: 'S9,D8,CJ',
      unused: 'HA',
    },
    {
      name: 'draws through a tie until strictly ahead',
      playerScore: 18,
      initial: 'S10,D6',
      deck: 'H2,C2,SA',
      score: 20,
      final: 'S10,D6,H2,C2',
      unused: 'SA',
    },
    {
      name: 'draws again after reaching a three-card tie at 21',
      playerScore: 21,
      initial: 'D10,S7',
      deck: 'C4,D2,H3',
      score: 23,
      final: 'D10,S7,C4,D2',
      unused: 'H3',
    },
    {
      name: 'does not draw when initially bust',
      playerScore: 18,
      initial: 'DA,SA',
      deck: 'H2',
      score: 22,
      final: 'DA,SA',
      unused: 'H2',
    },
  ])('$name', scenario => {
    const dealer = { cards: cards(scenario.initial) };
    const deck = cards(scenario.deck);

    expect(dealerTurn(deck, dealer, scenario.playerScore)).toBe(scenario.score);
    expect(dealer.cards).toEqual(cards(scenario.final));
    expect(deck).toEqual(cards(scenario.unused));
  });
});

describe('createResult', () => {
  const expected: ExpectedGame = {
    winner: 'dealer',
    player: { cards: 'H10,C6,HJ', score: 26 },
    dealer: { cards: 'D8,S7', score: 15 },
  };

  it.each([
    { name: 'neither score supplied', playerScore: undefined, dealerScore: undefined },
    { name: 'only Player score supplied', playerScore: 26, dealerScore: undefined },
    { name: 'only Dealer score supplied', playerScore: undefined, dealerScore: 15 },
    { name: 'both scores supplied', playerScore: 26, dealerScore: 15 },
  ])('returns correct totals with $name', ({ playerScore, dealerScore }) => {
    const player = { cards: cards(expected.player.cards) };
    const dealer = { cards: cards(expected.dealer.cards) };

    expect(createResult('dealer', player, dealer, playerScore, dealerScore)).toEqual(
      expectedResult(expected),
    );
  });

  it('keeps result hands independent of later changes to the working arrays', () => {
    const player = { cards: cards(expected.player.cards) };
    const dealer = { cards: cards(expected.dealer.cards) };
    const result = createResult('dealer', player, dealer);

    player.cards.pop();
    dealer.cards.push(...cards('H2'));

    expect(result).toEqual(expectedResult(expected));
  });
});
