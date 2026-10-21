import type { GameResult } from './game.js';
import type { Card } from './card.js';

function formatCards(cards: readonly Card[]): string {
    return cards.map(card => `${card.suit[0]}${card.value}`).join(',');
}

export function formatGameResult(
    result: GameResult,
    playerName = 'Player'
): string {
    const winnerName =
        result.winner === 'player' ? playerName : 'Dealer';

    return [
        `Winner: ${winnerName}`,
        `Dealer | ${result.dealer.score} | ${formatCards(result.dealer.cards)}`,
        `${playerName} | ${result.player.score} | ${formatCards(result.player.cards)}`
    ].join('\n');
}
