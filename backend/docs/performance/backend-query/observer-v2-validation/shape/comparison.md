Exploratory only. Median of each independent process run’s percentiles; spread and regressions are retained in comparison.json.

| Scenario | Rows | p50 before → after (ms) | p95 before → after (ms) | SELECTs | JSON bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| shape.cashflow.month.rules-on.lookaround-0 | 10000 | 36.74 → 15.65 | 36.74 → 15.65 | 10 → 4 | 550 → 564 |
| shape.cashflow.year.rules-on.lookaround-0 | 10000 | 81.79 → 30.84 | 81.79 → 30.84 | 10 → 4 | 555 → 569 |
| shape.cashflow.month.rules-on.lookaround-30 | 10000 | 31.53 → 15.44 | 31.53 → 15.44 | 10 → 4 | 551 → 565 |
| shape.cashflow.year.rules-on.lookaround-30 | 10000 | 79.80 → 29.66 | 79.80 → 29.66 | 10 → 4 | 556 → 570 |
| shape.history.year.20-accounts.dense.daily | 10000 | 46.93 → 43.96 | 46.93 → 43.96 | 5 → 5 | 28547 → 29420 |
| shape.history.year.20-accounts.sparse-prior-fx.daily | 10000 | 12.88 → 27.89 | 12.88 → 27.89 | 8 → 6 | 30367 → 31280 |
| shape.history.year.100-accounts.dense.daily | 10000 | 247.00 → 178.41 | 247.00 → 178.41 | 5 → 5 | 65476 → 66509 |
| shape.history.year.100-accounts.sparse-prior-fx.daily | 10000 | 45.62 → 72.57 | 45.62 → 72.57 | 8 → 6 | 78968 → 75809 |
