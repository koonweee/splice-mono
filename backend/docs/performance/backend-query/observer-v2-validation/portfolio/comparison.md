Exploratory only. Median of each independent process run’s percentiles; spread and regressions are retained in comparison.json.

| Scenario | Rows | p50 before → after (ms) | p95 before → after (ms) | SELECTs | JSON bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| extended.portfolio.1-accounts.0-positions | 10000 | 64.80 → 1.63 | 64.80 → 1.63 | 3 → 3 | 189 → 191 |
| extended.portfolio.20-accounts.0-positions | 10000 | 77.38 → 1.69 | 77.38 → 1.69 | 22 → 3 | 930 → 932 |
| extended.portfolio.100-accounts.0-positions | 10000 | 86.60 → 2.87 | 86.60 → 2.87 | 102 → 3 | 4050 → 4052 |
| extended.portfolio.1-accounts.10-positions | 10000 | 55.11 → 2.13 | 55.11 → 2.13 | 5 → 3 | 5382 → 5444 |
| extended.portfolio.20-accounts.10-positions | 10000 | 103.94 → 6.67 | 103.94 → 6.67 | 62 → 3 | 54514 → 55336 |
| extended.portfolio.100-accounts.10-positions | 10000 | 212.64 → 24.82 | 212.64 → 24.82 | 302 → 3 | 261665 → 265687 |
| extended.portfolio.1-accounts.100-positions | 10000 | 56.32 → 3.21 | 56.32 → 3.21 | 5 → 3 | 51619 → 52221 |
| extended.portfolio.20-accounts.100-positions | 10000 | 153.69 → 38.20 | 153.69 → 38.20 | 62 → 3 | 536261 → 544463 |
| extended.portfolio.100-accounts.100-positions | 10000 | 614.58 → 180.94 | 614.58 → 180.94 | 302 → 3 | 2579682 → 2619884 |
| extended.portfolio.20-accounts.mixed-currency-dates | 10000 | 149.88 → 38.09 | 149.88 → 38.09 | 65 → 4 | 536261 → 544463 |
