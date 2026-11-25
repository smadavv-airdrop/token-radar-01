# Token Radar

A token launch radar: every pre-token protocol from DefiLlama ranked by a single implied-value model. TVL, seven-day growth, and age without a token feed one function — no name is special-cased. The board is the floor: every protocol with at least $1M TVL and no token appears, plus an early radar of protocols below that floor. Live-token protocols are shown separately with their market caps.

## Run

```bash
MAKEFUN_INPUT_DIR=<input> MAKEFUN_OUTPUT_DIR=<output> node main.ts
```

Writes `board.json` (200 ranked rows), `dashboard/` (static page plus the `data.js` it reads, so
`dashboard/index.html` renders with no network), `screenshots/` and `dossier.json`.
The three screenshots are real renders of that page: the board, a protocol's detail drawer, and a
sector filter.

## Badges

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/smadavv-airdrop/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/smadavv-airdrop/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built by an AI agent for [make.fun](https://make.fun)'s "Build the best token launch radar" bounty ($1,325 USDC).