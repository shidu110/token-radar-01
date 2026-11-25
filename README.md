# Pre-Token Radar

[![make.fun bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/shidu110/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/shidu110/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Entry for the make.fun bounty [token-radar-01](https://make.fun/bounty/token-radar-01): build the best token launch radar.

The radar reads one sealed snapshot of 758 protocols and ranks the ones with no token recorded yet by a modelled implied value, then presents the ranking as a research desk: a sortable, filterable board, a per-protocol dossier with the full valuation breakdown and a concrete farm plan, and a methodology page that shows the maths.

## The model

Every figure is derived from the snapshot itself at run time; nothing is hardcoded per protocol.

- For tokenized protocols with a usable reported market cap, take the ratio mcap / TVL. Winsorize at unweighted nearest-rank global p25/p75, then take each category's TVL-weighted median: sort clipped ratios ascending and select the smallest ratio whose cumulative peer TVL reaches at least 50% of total peer TVL.
- Shrink each category multiple toward the TVL-weighted global median over all usable peers: `(n * weighted category median + 8 * weighted global median) / (n + 8)`, where `n` is peer count, not TVL. Categories without usable peers use the weighted global median.
- Adjust per protocol: momentum from 7-day TVL change (clamped), seasoning from how long the protocol has been listed, and a small reach factor for multi-chain protocols.
- `implied_value_usd = TVL * category multiple * momentum * seasoning * reach`, rounded to whole dollars.

The board carries all 40 watchlist protocols plus every other pre-token protocol that passes the snapshot's observable eligibility rules — 198 rows on this snapshot. Each row ships five to eight farm steps, generated from a per-category playbook keyed to the protocol's own product type and branched by its own record — multi-chain protocols gain a bridge step, fast growers a crowding step, protocols with heavy 7-day outflows an investigation step first, old protocols a TGE-timing step. Every step names the protocol and one of its own chains. Gas costs follow the protocol's primary chain (Ethereum mainnet is priced like Ethereum mainnet, Solana like Solana), position sizes follow its TVL tier, every step carries a dollar cost and a time commitment, and each plan closes with an eligibility-snapshot and claim-procedure step for that protocol. The model is validated inside the run: a leave-one-out backtest over the snapshot's tokenized protocols (A/B/C scored; approved variant C shipped) produces the residual range behind each protocol's Bear / Base / Bull interval, and every detail view lists tokenized comparables from its category. The board header carries a KPI strip (protocols ranked, watchlist coverage, median and total implied value, snapshot date) and category pills showing each category's tokenization rate in the snapshot; every dossier opens with a Signals block (tracking age, chain count, TVL against its category's unweighted TVL median, 7-day momentum, watchlist status); and the methodology page ends with a Top-10 ranking audit table exposing the exact TVL, category multiple and momentum factor behind each leading row.

## Calibration evidence

The same full-snapshot leave-one-out protocol holds out each of 128 usable tokenized protocols, recomputes every statistic from the other 127, and scores unrounded predictions. MdAPE is median absolute percentage error. Size cohorts use the original phase-5 TVL-ranked memberships and each variant's full-population LOO residuals; fits are never restricted to those cohorts.

| Variant | Overall MdAPE | Top-half MdAPE (64) | Top-10 MdAPE |
| --- | ---: | ---: | ---: |
| A — unweighted medians, raw p25/p75 winsorization | 93.05% | 157.6% | 520.8% |
| B — log-space p5/p95 winsorization | 94.21% | — | — |
| C — TVL-weighted medians, A's clipping; selected | 89.24% | 87.4% | 79.9% |

Unweighted medians let many small protocols set the multiple applied to the largest ones; weighting peers by TVL removes most of that size bias on this snapshot. C is selected by the same leave-one-out protocol; this is not out-of-sample validation.

All other constants (momentum clamp 0.7–1.5, seasoning horizon 720d, reach +0.02/chain capped 1.10) were checked in an 18-cell leave-one-out grid on A; the shipped values sit within 0.5pp of the best cell in every dimension.

Bear / Bull multipliers are now **0.107x / 1.875x** (full precision 0.10681491670936x / 1.8753840044828036x), from C's nearest-rank LOO log-residual p25/p75, −2.236657692645632 / 0.6288134408440561, exponentiated and applied to Base. These are scenario ranges, not confidence or reward forecasts.

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
