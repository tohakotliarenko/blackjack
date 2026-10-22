import { parseArgs } from 'node:util';
import { fetchDeck } from './deck.js';
import { formatGameResult } from './formatter.js';
import { playGame } from './game.js';

const USAGE = `Usage: node dist/cli.js [deck-url] [--name <player-name>]
       npm --silent start -- [deck-url] [--name <player-name>]

deck-url       HTTP(S) endpoint returning a JSON deck.
               Default: https://sandbox.getunleash.io/blackjack/shuffle
--name <name>  Player's display name. Default: Player
-h, --help     Show this help and exit.

Plays one round automatically, without interactive input.`;

const DEFAULT_DECK_URL = 'https://sandbox.getunleash.io/blackjack/shuffle';
const DEFAULT_PLAYER_NAME = 'Player';

export async function runCli(args: string[]): Promise<number> {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: {
        name: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: true,
    });

    if (values.help) {
      process.stdout.write(`${USAGE}\n`);
      return 0;
    }
    if (positionals.length > 1) {
      throw new Error('Expected at most one deck URL. Use --name to set the player name.');
    }

    const name = values.name;
    if (name !== undefined && /[\p{Cc}\p{Zl}\p{Zp}|]/u.test(name)) {
      throw new Error('Player name must not contain control characters, line breaks or "|".');
    }
    const playerName = name?.trim() ?? DEFAULT_PLAYER_NAME;
    if (playerName === '') throw new Error('Player name must not be empty.');

    const deckUrl = positionals[0] ?? DEFAULT_DECK_URL;
    const deck = await fetchDeck(deckUrl);
    const result = playGame(deck);
    process.stdout.write(`${formatGameResult(result, playerName)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await runCli(process.argv.slice(2));
}
