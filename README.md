# Blackjack

A TypeScript CLI that fetches a deck over HTTP, plays one automatic round
between Player and Dealer, and prints the winner, scores and hands.

Player receives two cards, then Dealer receives two. Player draws to at least
17; if Player survives, Dealer draws until strictly ahead or bust (over 21).
A player bust always loses; a dealer bust gives Player the win. Face cards
count as 10 and Aces as 11. Only an initial two-card 21 is Blackjack and wins
immediately; if both have Blackjack, Dealer wins.

Requires **Node.js 24.2+ (24.x)** and npm.

## Getting started

```sh
npm ci
npm run build
npm --silent start
```

The default deck comes from `https://sandbox.getunleash.io/blackjack/shuffle`;
your name defaults to `Player`. Both the URL and `--name` are optional:

```sh
npm --silent start -- https://example.com/deck --name "Alex Smith"
node dist/cli.js --help
```

## Development

```sh
npm run dev -- --name "Alex Smith" # Run TypeScript without building

npm test                           # Build and run unit/integration tests

npm run check                      # Typecheck, lint, build and test

npm run test:coverage              # Run tests with coverage
```

`src/` contains the CLI, deck provider, game logic and formatter. `test/` contains
Vitest unit tests and integration tests using a local HTTP server.

See [REQUIREMENTS.md](docs/REQUIREMENTS.md) for the original task, [IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) and
[AI_CONVERSATION.md](AI_CONVERSATION.md) for the AI conversation history.
