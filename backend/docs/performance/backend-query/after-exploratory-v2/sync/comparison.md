Exploratory only. Median of each independent process run’s percentiles; spread and regressions are retained in comparison.json.

| Scenario | Rows | p50 before → after (ms) | p95 before → after (ms) | SELECTs | JSON bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| sync.banking.50.rules-off | 10000 | 48.54 → 12.54 | 48.54 → 12.54 | 100 → 3 | 99 → 99 |
| sync.banking.50.rules-on | 10000 | 48.68 → 12.07 | 48.68 → 12.07 | 100 → 3 | 99 → 99 |
| sync.banking.500.rules-off | 10000 | 360.91 → 78.27 | 360.91 → 78.27 | 1000 → 4 | 99 → 99 |
| sync.banking.500.rules-on | 10000 | 368.55 → 67.36 | 368.55 → 67.36 | 1000 → 4 | 99 → 99 |
| sync.banking.5000.rules-off | 10000 | Baseline failed; corrected | — | — | — |
| sync.banking.5000.rules-on | 10000 | Baseline failed; corrected | — | — | — |
| sync.banking-modified.50.rules-off | 10000 | 106.08 → 10.68 | 106.08 → 10.68 | 250 → 3 | 99 → 99 |
| sync.banking-modified.50.rules-on | 10000 | 97.54 → 11.21 | 97.54 → 11.21 | 250 → 3 | 99 → 99 |
| sync.banking-modified.500.rules-off | 10000 | 964.79 → 66.86 | 964.79 → 66.86 | 2500 → 4 | 99 → 99 |
| sync.banking-modified.500.rules-on | 10000 | 986.21 → 85.73 | 986.21 → 85.73 | 2500 → 4 | 99 → 99 |
| sync.banking-modified.5000.rules-off | 10000 | 16118.14 → 796.59 | 16118.14 → 796.59 | 25000 → 22 | 99 → 99 |
| sync.banking-modified.5000.rules-on | 10000 | 21802.37 → 746.73 | 21802.37 → 746.73 | 25000 → 22 | 99 → 99 |
| sync.investment-transactions.50 | 10000 | 86.11 → 9.37 | 86.11 → 9.37 | 100 → 4 | 73 → 73 |
| sync.investment-transactions.500 | 10000 | 1007.50 → 50.77 | 1007.50 → 50.77 | 1000 → 5 | 74 → 74 |
| sync.investment-transactions.5000 | 10000 | 15488.67 → 425.26 | 15488.67 → 425.26 | 10000 → 20 | 75 → 75 |
