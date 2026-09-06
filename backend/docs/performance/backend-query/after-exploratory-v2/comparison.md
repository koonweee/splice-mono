Exploratory only. Median of each independent process run’s percentiles; spread and regressions are retained in comparison.json.

| Scenario | Rows | p50 before → after (ms) | p95 before → after (ms) | SELECTs | JSON bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| matching.500-equal-amount-rows | 10000 | 17.80 → 0.30 | 17.80 → 0.30 | 0 → 0 | 20026 → 20026 |
| matching.1000-equal-amount-rows | 10000 | 67.24 → 0.41 | 67.24 → 0.41 | 0 → 0 | 40026 → 40026 |
| matching.2000-equal-amount-rows | 10000 | 266.49 → 0.70 | 266.49 → 0.70 | 0 → 0 | 80026 → 80026 |
| transactions.activityDate.page-0 | 10000 | 15.57 → 6.77 | 15.57 → 6.77 | 3 → 2 | 50213 → 50313 |
| transactions.activityDate.page-18 | 10000 | 10.02 → 10.15 | 10.02 → 10.15 | 3 → 2 | 50265 → 50365 |
| transactions.amount.page-0 | 10000 | Baseline failed; corrected | — | — | — |
| transactions.amount.page-18 | 10000 | Baseline failed; corrected | — | — | — |
| transactions.merchantName.page-0 | 10000 | 8.51 → 4.79 | 8.51 → 4.79 | 3 → 2 | 50265 → 50365 |
| transactions.merchantName.page-18 | 10000 | 10.03 → 4.64 | 10.03 → 4.64 | 3 → 2 | 50263 → 50363 |
| transactions.pending.page-0 | 10000 | 6.96 → 5.06 | 6.96 → 5.06 | 3 → 2 | 50207 → 50307 |
| transactions.pending.page-18 | 10000 | 7.28 → 5.02 | 7.28 → 5.02 | 3 → 2 | 50270 → 50370 |
| transactions.date-filter | 10000 | 6.98 → 2.57 | 6.98 → 2.57 | 3 → 2 | 50419 → 50519 |
| transactions.search | 10000 | 34.14 → 4.57 | 34.14 → 4.57 | 1 → 2 | 7956 → 7996 |
| mcp-transactions.fx-1-dates-1-currencies | 10000 | 5.15 → 2.94 | 5.15 → 2.94 | 5 → 1 | 62777 → 63203 |
| mcp-transactions.fx-1-dates-3-currencies | 10000 | 6.02 → 3.22 | 6.02 → 3.22 | 11 → 1 | 62934 → 63599 |
| mcp-transactions.fx-10-dates-1-currencies | 10000 | 11.60 → 2.91 | 11.60 → 2.91 | 32 → 1 | 63326 → 64829 |
| mcp-transactions.fx-10-dates-3-currencies | 10000 | 20.68 → 3.17 | 20.68 → 3.17 | 92 → 1 | 64599 → 68468 |
| mcp-transactions.fx-100-dates-1-currencies | 10000 | 49.27 → 3.68 | 49.27 → 3.68 | 302 → 1 | 68816 → 81173 |
| mcp-transactions.fx-100-dates-3-currencies | 10000 | 49.61 → 3.96 | 49.61 → 3.96 | 302 → 1 | 68915 → 81173 |
| holdings.1-accounts-100-positions | 10000 | 59.19 → 4.03 | 59.19 → 4.03 | 5 → 3 | 53476 → 53790 |
| holdings.20-accounts-100-positions | 10000 | 141.22 → 34.80 | 141.22 → 34.80 | 62 → 3 | 1069613 → 1075627 |
| holdings.100-accounts-100-positions | 10000 | 524.08 → 158.83 | 524.08 → 158.83 | 302 → 3 | 5351553 → 5381567 |
| history.month.20-accounts.daily | 10000 | 8.90 → 4.48 | 8.90 → 4.48 | 5 → 5 | 10892 → 11093 |
| history.month.100-accounts.daily | 10000 | 14.61 → 8.25 | 14.61 → 8.25 | 5 → 5 | 47486 → 47847 |
| history.year.20-accounts.daily | 10000 | 9.66 → 7.79 | 9.66 → 7.79 | 5 → 5 | 28547 → 29420 |
| history.year.100-accounts.daily | 10000 | 34.81 → 24.36 | 34.81 → 24.36 | 5 → 5 | 65476 → 66509 |
| history.ten-years.20-accounts.daily | 10000 | 62.83 → 52.94 | 62.83 → 52.94 | 5 → 5 | 201682 → 209127 |
| history.ten-years.100-accounts.daily | 10000 | 350.13 → 192.25 | 350.13 → 192.25 | 5 → 5 | 241896 → 249501 |
| cashflow.month.summary-audit | 10000 | 41.71 → 12.91 | 41.71 → 12.91 | 10 → 3 | 550 → 564 |
| cashflow.year.summary-audit | 10000 | 83.42 → 27.34 | 83.42 → 27.34 | 10 → 3 | 555 → 569 |
| http.transactions.convert | 10000 | 10.39 → 8.64 | 10.39 → 8.64 | 9 → 4 | 108654 → 109294 |
| mcp.transport.transactions.fx-100 | 10000 | 57.86 → 15.25 | 57.86 → 15.25 | 303 → 2 | 179028 → 213040 |
| mcp.transport.holdings-20 | 10000 | 125.70 → 50.90 | 125.70 → 50.90 | 63 → 4 | 2687633 → 2704652 |
| mcp.transport.cashflow-comparison | 10000 | 38.57 → 20.61 | 38.57 → 20.61 | 21 → 7 | 6812 → 6896 |
| mcp.transport.history-month | 10000 | 11.23 → 7.94 | 11.23 → 7.94 | 6 → 6 | 27998 → 28553 |
