import type { Card, CardValue } from './card.js';

interface Player {
  cards: Card[];
}

interface PlayerResult {
  readonly cards: readonly Card[];
  readonly score: number;
}

export interface GameResult {
  readonly winner: 'player' | 'dealer';
  readonly player: PlayerResult;
  readonly dealer: PlayerResult;
}

const MIN_PLAYER_SCORE = 17;
const MAX_PLAYER_SCORE = 21;

const CARD_SCORE_MAP: Partial<Record<CardValue, number>> = {
  J: 10,
  Q: 10,
  K: 10,
  A: 11,
};

export function playGame(deck: readonly Card[]) {
  const remainingDeck = [...deck];
  const { player, dealer } = initialDraw(remainingDeck);

  const blackjackResult = checkBlackjack(player, dealer);

  if (blackjackResult) return blackjackResult;

  const playerScore = playerTurn(remainingDeck, player);

  if (playerScore > MAX_PLAYER_SCORE) {
    return createResult('dealer', player, dealer, playerScore);
  }

  const dealerScore = dealerTurn(remainingDeck, dealer, playerScore);

  if (dealerScore > MAX_PLAYER_SCORE) {
    return createResult('player', player, dealer, playerScore, dealerScore);
  }

  return createResult('dealer', player, dealer, playerScore, dealerScore);
}

export function initialDraw(deck: Card[]): { player: Player; dealer: Player } {
  return {
    // The order is important - the player draws first
    player: { cards: [drawCard(deck), drawCard(deck)] },
    dealer: { cards: [drawCard(deck), drawCard(deck)] },
  };
}

export function drawCard(deck: Card[]): Card {
  const card = deck.shift();

  if (!card) {
    throw new Error('Deck exhausted: no cards left to draw.');
  }

  return card;
}

export function getCardScore(value: CardValue): number {
  return CARD_SCORE_MAP[value] ?? Number(value);
}

export function calculateScores(cards: readonly Card[]): number {
  return cards.reduce((total, card) => total + getCardScore(card.value), 0);
}

export function isBlackjack(score: number): boolean {
  return score === MAX_PLAYER_SCORE;
}

export function checkBlackjack(player: Player, dealer: Player): GameResult | void {
  const playerScore = calculateScores(player.cards);
  const dealerScore = calculateScores(dealer.cards);

  if (isBlackjack(dealerScore)) {
    return createResult('dealer', player, dealer, playerScore, dealerScore);
  }

  if (isBlackjack(playerScore)) {
    return createResult('player', player, dealer, playerScore, dealerScore);
  }
}

export function playerTurn(deck: Card[], player: Player): number {
  let score = calculateScores(player.cards);

  while (score < MIN_PLAYER_SCORE) {
    const card = drawCard(deck);
    player.cards.push(card);
    score += getCardScore(card.value);
  }

  return score;
}

export function dealerTurn(deck: Card[], dealer: Player, playerScore: number): number {
  let score = calculateScores(dealer.cards);

  while (score <= playerScore) {
    const card = drawCard(deck);
    dealer.cards.push(card);
    score += getCardScore(card.value);
  }

  return score;
}

export function createResult(
  winner: GameResult['winner'],
  player: Player,
  dealer: Player,
  playerScore?: number,
  dealerScore?: number,
): GameResult {
  return {
    winner,
    player: {
      cards: [...player.cards],
      score: playerScore ?? calculateScores(player.cards),
    },
    dealer: {
      cards: [...dealer.cards],
      score: dealerScore ?? calculateScores(dealer.cards),
    },
  };
}
