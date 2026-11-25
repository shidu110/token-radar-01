# Pre-Token Radar

[![make.fun bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/shidu110/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/shidu110/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Entry for the make.fun bounty [token-radar-01](https://make.fun/bounty/token-radar-01): build the best token launch radar.

The radar reads one sealed snapshot of 758 protocols and ranks the ones with no token recorded yet by a modelled implied value, then presents the ranking as a research desk: a sortable, filterable board, a per-protocol dossier with the full valuation breakdown and a concrete farm plan, and a methodology page that shows the maths.

## The model

Every figure is derived from the snapshot itself at run time; nothing is hardcoded per protocol.

- For tokenized protocols with a usable reported market cap, take the ratio mcap / TVL. Clip extreme ratios to the middle half of all ratios (the global 25th–75th percentile), then take each category's median.
- Shrink each category multiple toward the global median: `(n * category median + 8 * global median) / (n + 8)`, so a category with one observation cannot dominate.
- Adjust per protocol: momentum from 7-day TVL change (clamped), seasoning from how long the protocol has been listed, and a small reach factor for multi-chain protocols.
- `implied_value_usd = TVL * category multiple * momentum * seasoning * reach`, rounded to whole dollars.

The board carries all 40 watchlist protocols plus every other pre-token protocol that passes the snapshot's observable eligibility rules — 198 rows on this snapshot. Each row ships five to eight farm steps, generated from a per-category playbook keyed to the protocol's own product type and branched by its own record — multi-chain protocols gain a bridge step, fast growers a crowding step, protocols with heavy 7-day outflows an investigation step first, old protocols a TGE-timing step. Every step names the protocol and one of its own chains. Gas costs follow the protocol's primary chain (Ethereum mainnet is priced like Ethereum mainnet, Solana like Solana), position sizes follow its TVL tier, every step carries a dollar cost and a time commitment, and each plan closes with an eligibility-snapshot and claim-procedure step for that protocol. The model is validated inside the run: a leave-one-out backtest over the snapshot's tokenized protocols (both winsorize variants scored, the better one shipped) produces the residual range behind each protocol's Bear / Base / Bull interval, and every detail view lists the tokenized comparables its category multiple was derived from. The board header carries a KPI strip (protocols ranked, watchlist coverage, median and total implied value, snapshot date) and category pills showing each category's tokenization rate in the snapshot; every dossier opens with a Signals block (tracking age, chain count, TVL against its category median, 7-day momentum, watchlist status); and the methodology page ends with a Top-10 ranking audit table exposing the exact TVL, category multiple and momentum factor behind each leading row.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node 22, standard library only. The run writes `board.json`, `data.js`, the `dashboard/` and `screenshots/` copies and `dossier.json` into the output directory, byte-identical on repeat runs.

## Layout

- `main.ts` — the harness: reads the snapshot, writes the outputs.
- `lib/` — the valuation model, board selection and farm-plan generation.
- `dashboard/` — the offline dashboard (board, protocol dossier, methodology). No external assets; renders from the generated `data.js`.
- `screenshots/` — the board, one protocol dossier, one filtered view and the methodology page.
- `vendor/` — the kit's dossier builder, unchanged.

MIT licensed; see `LICENSE`.
