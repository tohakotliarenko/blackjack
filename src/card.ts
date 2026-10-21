export const CARD_VALUES = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'
] as const;

export type CardValue = typeof CARD_VALUES[number];

export const CARD_SUITS = ['SPADES', 'HEARTS', 'DIAMONDS', 'CLUBS'] as const;

export interface Card {
    readonly suit: typeof CARD_SUITS[number];
    readonly value: CardValue;
}
