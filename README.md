# Token Launch Radar — Analyst Dossier

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dian566/token-radar-v2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dian566/token-radar-v2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: 200 pre-token protocols ranked by an implied value computed from the sealed DefiLlama snapshot — TVL × a sector multiple calibrated from live-token comparables × 7-day growth × maturity — with an analyst dossier for every protocol (model breakdown, live-token comps, risk flags, and a three-phase farm playbook with costs and times).

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Node 22.18+ required, standard library only. Writes `board.json`, `data.js`, `dashboard/`, `screenshots/` and `dossier.json` into the output directory. Open `out/dashboard/index.html` in a browser (no network needed).

## Model

`implied = TVL × sector multiple × growth multiplier × maturity multiplier`, where the sector multiple is the median mcap/TVL of live-token protocols in the same category (global median when a category has fewer than 3 live comparables), the growth multiplier follows the 7-day TVL change clamped to [-60, +120]%, and maturity rises with days listed without a token. No protocol name is special-cased. Live-token protocols are comparables only — never board rows.

Entered on [make.fun](https://make.fun/bounty/token-radar-01).
