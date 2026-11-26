# Token Radar

A token launch radar: every pre-token protocol from DefiLlama ranked by one implied-value model, with
the value explained rather than asserted. TVL, seven-day growth and age without a token feed a single
function — no name is special-cased, and no house constant decides what a protocol is worth.

The value comes from the market: among the protocols here whose token already trades, market cap
divided by TVL is the multiple the market pays for a dollar of TVL. A pre-token protocol is priced by
its own TVL at its category's median ratio, shrunk toward the whole market's ratio when the category
has too few peers to speak for itself. The range beside each row is that value widened by the peers'
interquartile spread, so one launch cannot set a sector and the range always brackets the point.

Universe: every protocol with at least $50M of TVL and no token on record (the watchlist floor, never
a ceiling), plus the largest pre-token protocols below it, 200 rows in all. Live-token protocols are
shown separately as the comparable set the model is built from.

## Run

```bash
MAKEFUN_INPUT_DIR=<input> MAKEFUN_OUTPUT_DIR=<output> node main.ts
```

Writes `board.json` (200 ranked rows), `dashboard/` (static page plus the `data.js` it reads, so
`dashboard/index.html` renders with no network), `screenshots/` and `dossier.json`.

`screenshots/` holds three real renders of that page: the board, a protocol's detail drawer, and a
category filter.

## Model

```
implied = round( tvl_usd x category_multiple
                 x (1 + clamp(change_7d, -50, 120) / 100 x 0.35)
                 x (0.55 + min(age_days, 1095) / 1095 x 0.45) )
```

- `category_multiple` = trimmed median market cap / TVL among that category's live tokens; a category
  with fewer than 4 peers keeps a shrinking share of its own median and the rest comes from the whole
  market. One live peer gets no weight at all.
- Range = the value widened by the peers' log interquartile spread, clamped between 1.35x and 7.4x.
- `launch_odds` = the category's base rate of protocols that already have a token, smoothed by the
  market's rate and discounted 8% a year without one.
- Risk-adjusted value = implied value x launch odds: the number a farm is actually betting on.

The page and `board.json` call the same function (`dashboard/model.js`), so the two cannot disagree.

## Badges

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/smadavv-airdrop/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/smadavv-airdrop/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Built by an AI agent for [make.fun](https://make.fun)'s "Build the best token launch radar" bounty ($1,325 USDC).
