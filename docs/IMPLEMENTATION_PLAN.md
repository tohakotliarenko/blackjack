# Blackjack — Implementation Plan

Build a fully autonomous TypeScript CLI following [REQUIREMENTS.md](REQUIREMENTS.md).
Unleash confirmed there are no interactive hit/stand decisions. This plan records
implementation choices; the original requirements remain unchanged.

## Architecture and technical choices

The CLI coordinates three independent modules:

```text
fetchDeck(url?) -> playGame(deck) -> formatGameResult(result, playerName) -> stdout
```

- `src/cli.ts`: arguments, names, orchestration, stdout/stderr and exit codes.
- `src/deck.ts`: HTTP GET, URL handling and JSON validation.
- `src/game.ts`: synchronous, deterministic gameplay and internal scoring.
- `src/formatter.ts`: pure result serialization; no scoring or winner decisions.
- Keep matching unit test files and `test/integration.test.ts` under `test/`.
- Use plain types and local execution state. No factory, persistent Game/User
  models, dependency injection framework or explicit phase state machine.
- No web interface, application server, database, authentication or multiplayer.

Use Node.js 24 LTS, strict TypeScript with ESM/NodeNext, native fetch and npm.
Use Vitest with `@vitest/coverage-v8`, ESLint with typescript-eslint flat config,
`tsc` for checking/building and `tsx` for development. No production dependencies.

Configuration:

- `tsconfig.json` checks source, tests and TypeScript configuration files.
- `tsconfig.build.json` extends it, includes only `src/`, sets `rootDir: src`
  and `outDir: dist`, and excludes tests, tooling configuration and generated files.
- Compiled imports must run directly in Node. Commit `package-lock.json` for
  reproducible installs; ignore `node_modules/`, `dist/` and `coverage/` in Git.

## npm scripts

| Script | Command |
|---|---|
| `dev` | `tsx src/cli.ts` |
| `build` | `tsc -p tsconfig.build.json` |
| `start` | `node dist/cli.js` |
| `typecheck` | `tsc --noEmit -p tsconfig.json` |
| `lint` | `eslint .` |
| `lint:fix` | `eslint . --fix` |
| `test` | `npm run build && vitest run` |
| `test:watch` | `vitest --exclude test/integration.test.ts` |
| `test:coverage` | `npm run build && vitest run --coverage` |
| `check` | `npm run typecheck && npm run lint && npm test` |

Full test and coverage runs build first, even without an existing `dist/`.
`check` runs typecheck -> lint -> build -> tests, with one build. Watch mode
covers unit tests only, avoiding stale compiled CLI output in integration tests.

## Game API and rules

Cards use suits `HEARTS | CLUBS | SPADES | DIAMONDS` and string values
`2,3,4,5,6,7,8,9,10,J,Q,K,A`.

```ts
type HandResult = {
  readonly cards: readonly Card[];
  readonly score: number;
};

type GameResult = {
  readonly winner: 'player' | 'dealer';
  readonly player: HandResult;
  readonly dealer: HandResult;
};

// Public execution API; Card is a plain type with the suit/value above.
function playGame(deck: readonly Card[]): GameResult;
```

Each call owns its cursor and hands. Preserve input order and do not mutate the
deck or card objects. Calls are independent, including after a failed call;
identical decks give identical results. Importing game logic has no side effects.
Game logic has no HTTP, console, process or environment access.

Keep drawing, scoring, dealing, turns and winner resolution internal to the game
module. Use one `calculateScore(cards)` helper for decisions and returned scores:
numbers use their numeric value, J/Q/K are 10, and A is always 11, never 1.
The formatter receives final scores and never recalculates them. Display names
are absent from GameResult; winner values always identify lowercase roles.

Execute one round in this order:

1. Deal two cards to Player, then two to Dealer, without shuffling.
2. Check natural Blackjack after the complete initial deal: exactly two cards
   totaling 21. Both naturals -> Dealer wins; otherwise the sole natural wins.
3. Without a natural, Player draws while below 17 and stops at 17 or higher.
   Above 21 means an immediate loss; Dealer takes no further cards.
4. If Player survives, Dealer draws while its score is at most Player's and it
   has not busted. Ties require another draw, including ties reached after a hit.
   Dealer stops immediately when strictly ahead and non-bust.
5. Dealer bust -> Player wins; otherwise Dealer wins. Return both final hands
   and their actual scores immediately whenever the winner is resolved.

Important edges:

- Three-or-more-card 21 is an ordinary score, not natural Blackjack.
- Two Aces total 22. Player bust takes precedence even when Dealer is also bust.
- Resolve an initial dealer bust only after Player's turn; Player can still bust
  and lose. Dealer being initially ahead does not skip Player's turn.
- An already-ahead, non-bust Dealer takes no additional cards after Player's turn.
- Exhaustion during the initial deal or either turn throws a descriptive error;
  never invent a winner, reshuffle or draw after termination.

## Deck retrieval

API: `fetchDeck(url?): Promise<Card[]>`.

Default endpoint: `https://sandbox.getunleash.io/blackjack/shuffle`.

- DeckProvider owns default URL selection and URL validation. Accept HTTP/HTTPS;
  reject malformed URLs and unsupported protocols before networking.
- Make one GET. Explicit endpoint failures never trigger a default fallback.
  Do not retry: a retry could fetch a different shuffled deck.
- Use a 10-second timeout covering the request and response body consumption.
- Handle DNS failures, refused connections, disconnections, timeout before headers
  or during body reading, HTTP 4xx/5xx, malformed JSON and invalid card data.
- Require an array of non-null card objects with valid suit and string value.
  Reject missing fields, unknown/lowercase suits, unsupported values and numbers
  supplied instead of strings.
- Preserve order and values. Do not enforce 52 cards, uniqueness, suit/value
  distribution or any particular ordering. Short and duplicate-card decks are
  valid; an empty array is structurally valid and later exhausts in playGame.
- No shuffling or console output in DeckProvider.

## CLI and output

Parse arguments with Node's built-in `parseArgs` from `node:util`, with strict
options and positional arguments allowed. Accept at most one positional URL.

```text
node dist/cli.js [deck-url] [--name <player-name>]
npm --silent start -- [deck-url] [--name <player-name>]
```

- Omitted URL -> pass undefined to DeckProvider to use the default endpoint.
- `--name <player-name>` changes only Player's display name; default is `Player`.
  Dealer's display name stays `Dealer`, with no dealer-name option or prompt.
- Support the name option before/after the URL, with default or custom endpoint.
  Trim surrounding whitespace; allow internal spaces and Unicode. Reject missing,
  empty or whitespace-only names, control characters and the pipe character.
- `-h` and `--help` print usage, arguments, defaults and automatic-game behavior,
  then exit 0 without networking. Unknown options and multiple URLs are errors.
- Validate arguments/names before fetching; invalid URLs fail before HTTP.

Build separately before running. Use direct Node or `npm --silent start` for
exact stdout: plain `npm start` adds npm banners. Do not add a prestart build
that writes to game stdout. Examples:

```sh
npm ci
npm run build
node dist/cli.js
node dist/cli.js https://example.com/deck --name "Alex Smith"
npm --silent start -- https://example.com/deck --name "Alex Smith"
npm --silent start -- --help
```

Formatter API: `formatGameResult(result: GameResult, playerName: string): string`.
The CLI passes the validated name, defaulting to Player. Map winner role 'player'
to that name and 'dealer' to Dealer; never identify roles by comparing names.

Successful game output is exactly:

```text
Winner: <winning display name>
Dealer | <score> | <comma-separated cards>
<player name> | <score> | <comma-separated cards>
```

Use `HEARTS -> H`, `SPADES -> S`, `CLUBS -> C`, `DIAMONDS -> D` and preserve
original rank strings, including `10`, J, Q, K and A. Preserve card order, use
literal ` | ` separators and no spaces between cards. Print supplied scores,
including bust totals. No extra headings, blank lines, spaces, prompts or logs.
Formatter joins three lines with `\n` and no trailing newline; CLI adds one.

Success: result only on stdout, empty stderr, exit 0. Failure: diagnostic on
stderr, empty stdout, nonzero exit. Never print a partial result.

## Testing

Use shared fixtures and parameterized tests with named, independently reported
cases. Consolidate setup and assertions, not distinct inputs or outcomes.
Aim for 100% game branch and formatter coverage; cover all CLI paths and deck
success/failure paths. Prioritize behavior over line counts.

### Game unit scenarios

- Player-only, dealer-only and both natural Blackjacks; assert winner, initial
  two-then-two deal, scores and immediate termination.
- Normal continuation: Player starts at 16 and draws; stands at 17, 18, 19 or 20;
  reaches exactly 17 after drawing; needs multiple draws to reach the threshold.
- Player bust after a hit, player two-Ace initial bust, bust while Dealer is low,
  dealer two-Ace initial bust while Player survives, and both players bust.
- Dealer already ahead after Player's turn, initially tied, becoming strictly
  ahead after drawing, busting while drawing, and needing several draws.
- Fixture D: Player completes its turn despite Dealer initially being ahead;
  both reach three-card 21, Dealer draws again on the tie and busts.
- Parameterize every rank (2-10, J, Q, K, A) through returned scores. An opposing
  natural can keep the hand being scored unchanged without exposing the helper.
- Accept duplicate cards. Test exhaustion during initial deal (0-3 cards),
  Player's turn and Dealer's turn.
- Repeated identical/different-deck calls and a valid call after failure share
  no state. Assert deterministic results, legal winner roles, unchanged input
  arrays/card objects, sequential consumption and scores equal to card sums.
- Assert exact hands and no extra draws at every termination path. Include
  decks ending on the final required card and variants with unused trailing cards.

### Deck, CLI and formatter unit scenarios

- Deck: default/custom endpoint, HTTP 200, exactly one GET and preserved order;
  HTTP 404/429/500/503; DNS failure, refused connection and disconnection;
  malformed URL/protocol/JSON; no retries or fallback after explicit failure.
- Keep timeout-before-headers and timeout-during-body as distinct tests.
- Validate object/null root, null card, each missing field, invalid/lowercase suit,
  unsupported value and numeric value. Accept duplicate, short and empty arrays.
- CLI: URL forwarding/default delegation; both help flags without networking;
  unknown option, multiple URLs and invalid URL; deck-fetch and game failures.
- Names: defaults, custom name with each endpoint choice and option position,
  trimming, internal spaces and Unicode; reject missing/empty/whitespace-only
  names, control characters and pipe before any networking.
- Assert stdout, stderr and exit code together on every success/failure case,
  including no partial result and completion without interactive input.
- Formatter: exact strings for both winners and the both-natural result; all
  suits and rank symbols, ordered multi-card hands for both roles, supplied bust
  scores, separators, three lines and no trailing newline. Assert repeatability
  and no input mutation. Custom names must appear in the player hand and, only
  for a player victory, the winner line; include spaces and Unicode.

### Integration strategy and scenarios

Build first, then run the compiled CLI against a local HTTP fixture server.
Do not mock game/deck modules or use the live Unleash endpoint in automated tests.
Run the full suite directly through Node, capturing stdout/stderr/exit code and
providing no interactive input. Verify successful output byte-for-byte, including
one final newline; failure has empty stdout, diagnostic stderr and nonzero exit.

Keep named rows for all of these gameplay scenarios:

- Player-only, dealer-only and both natural Blackjacks.
- Player drawing multiple cards to reach 17; Player bust with no dealer draws.
- Dealer already ahead after Player's turn; dealer tie requiring another draw;
  Dealer bust trying to win.
- Aces/face-card scoring and Fixture D's three-card 21 followed by a dealer tie.

Also cover exhaustion with no fabricated winner, malformed JSON, HTTP 500,
a stalled endpoint, both help flags without fetching, and byte-identical results
on separate runs with the same deck. Shared exact-output checks apply to every
successful fixture.

Add exactly one npm smoke test, using Fixture D and:
`npm --silent start -- <local-url> --name "Alex Smith"`.
Expect `Winner: Alex Smith` and `Alex Smith | 21 | H10,C6,H5`, with the same
Dealer line as Fixture D, empty stderr, exit 0 and no npm banner or input prompt.
Do not repeat the integration suite through npm.

## Reference fixtures

Use all four fixtures in game and integration tests. Outputs below use default
names; CLI adds one final newline.

### A — Player bust

Deck: H10, C6, D8, S7, HJ

```text
Winner: Dealer
Dealer | 15 | D8,S7
Player | 26 | H10,C6,HJ
```

### B — Dealer bust

Deck: H10, C7, S9, D8, CJ

```text
Winner: Player
Dealer | 27 | S9,D8,CJ
Player | 17 | H10,C7
```

### C — Both natural Blackjack

Deck: HA, S10, DA, CK

```text
Winner: Dealer
Dealer | 21 | DA,CK
Player | 21 | HA,S10
```

### D — Three-card 21, dealer tie and bust

Deck: H10, C6, D10, S7, H5, C4, D2

```text
Winner: Player
Dealer | 23 | D10,S7,C4,D2
Player | 21 | H10,C6,H5
```

Player starts at 16, Dealer at 17. H5 gives Player 21; C4 ties Dealer at 21;
D2 then busts Dealer. Neither three-card 21 ends the game as natural Blackjack.

## Implementation steps

1. Bootstrap tooling, separate checking/build configurations, scripts and ignores.
2. Implement playGame, internal scoring and game unit tests.
3. Implement deck fetching, validation, timeout and unit tests.
4. Implement CLI parsing, help, names and error/exit behavior with unit tests.
5. Implement pure formatting and exact-output tests.
6. Add compiled-CLI integration scenarios, four fixtures and one npm silent smoke.
7. Verify the project, write README/AI history and prepare repository access.

Use meaningful incremental commits. README should cover Node version, install,
build/run/test commands, URL/name/help options, architecture, rules/assumptions
and error behavior. Keep future UI/interactive/multiplayer ideas to a brief note;
do not implement them. Preserve the full AI conversation in AI_CONVERSATION.md
and add subsequent AI-assisted interactions before submission.

## Final verification and submission

- [ ] From a clean checkout on Node 24, `npm ci`, `npm run check` and
  `npm run test:coverage` pass without pre-existing build output.
- [ ] Production output excludes tests; compiled imports run directly in Node;
  typechecking includes source/tests/config and lint/coverage checks pass.
- [ ] Unit and integration scenarios above pass, including all four fixtures,
  state/input invariants, exact output and the single npm silent smoke test.
- [ ] Manually verify the default endpoint, custom URL, names with both URL
  choices, and help without a network. Check success/error streams and exits.
- [ ] README commands work; source, tests, lockfile and build/run instructions
  are included. No secrets, node_modules/ or generated output are committed.
- [ ] AI_CONVERSATION.md contains the full conversation through submission.
- [ ] Git history is coherent; submit a GitHub/GitLab repository with access for
  every reviewer listed for that platform in REQUIREMENTS.md.
