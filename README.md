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

The board carries all 40 watchlist protocols plus every other pre-token protocol that passes the snapshot's observable eligibility rules — 198 rows on this snapshot. Each row ships five farm steps with a cost and a time commitment, generated from a per-category playbook parameterised by the protocol's own chain, TVL tier and category.

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
- `screenshots/` — the board, one protocol dossier and one filtered view.
- `vendor/` — the kit's dossier builder, unchanged.

MIT licensed; see `LICENSE`.
