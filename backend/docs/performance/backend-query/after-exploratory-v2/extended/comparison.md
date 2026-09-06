Exploratory only. Median of each independent process run’s percentiles; spread and regressions are retained in comparison.json.

| Scenario | Rows | p50 before → after (ms) | p95 before → after (ms) | SELECTs | JSON bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| extended.holdings.1-accounts.0-positions | 10000 | 64.78 → 1.81 | 64.78 → 1.81 | 3 → 3 | 93 → 205 |
| extended.holdings.20-accounts.0-positions | 10000 | 70.77 → 1.89 | 70.77 → 1.89 | 22 → 3 | 834 → 2808 |
| extended.holdings.100-accounts.0-positions | 10000 | 87.04 → 3.17 | 87.04 → 3.17 | 102 → 3 | 3954 → 13768 |
| extended.holdings.1-accounts.10-positions | 10000 | 56.55 → 1.91 | 56.55 → 1.91 | 5 → 3 | 5430 → 5563 |
| extended.holdings.20-accounts.10-positions | 10000 | 101.02 → 5.82 | 101.02 → 5.82 | 62 → 3 | 107703 → 110097 |
| extended.holdings.100-accounts.10-positions | 10000 | 178.35 → 20.90 | 178.35 → 20.90 | 302 → 3 | 538673 → 550587 |
| extended.portfolio.1-accounts.100-positions | 10000 | 56.07 → 5.71 | 56.07 → 5.71 | 5 → 3 | 51619 → 52221 |
| extended.portfolio.20-accounts.100-positions | 10000 | 156.36 → 40.20 | 156.36 → 40.20 | 62 → 3 | 536261 → 544463 |
| extended.portfolio.100-accounts.100-positions | 10000 | 481.89 → 189.20 | 481.89 → 189.20 | 302 → 3 | 2579682 → 2619884 |
| extended.transactions.no-match-amount | 10000 | 42.74 → 16.35 | 42.74 → 16.35 | 8 → 1 | 21805 → 56482 |
| extended.transactions.rare-match-amount | 10000 | 42.38 → 18.09 | 42.38 → 18.09 | 8 → 1 | 21815 → 56494 |
| extended.history.ten-years.20-accounts.compact | 10000 | 67.40 → 56.93 | 67.40 → 56.93 | 5 → 5 | 201682 → 12748 |
| extended.history.ten-years.100-accounts.compact | 10000 | 309.94 → 188.93 | 309.94 → 188.93 | 5 → 5 | 241896 → 49533 |
