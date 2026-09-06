Exploratory only. Median of each independent process run’s percentiles; spread and regressions are retained in comparison.json.

| Scenario | Rows | p50 before → after (ms) | p95 before → after (ms) | SELECTs | JSON bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| matching.500-equal-amount-rows | 10000 | 17.39 → 0.28 | 17.39 → 0.28 | 0 → 0 | 20026 → 20026 |
| matching.1000-equal-amount-rows | 10000 | 67.18 → 0.40 | 67.18 → 0.40 | 0 → 0 | 40026 → 40026 |
| matching.2000-equal-amount-rows | 10000 | 272.18 → 0.56 | 272.18 → 0.56 | 0 → 0 | 80026 → 80026 |
| transactions.activityDate.page-0 | 10000 | 13.72 → 6.66 | 13.72 → 6.66 | 3 → 2 | 50213 → 50313 |
| transactions.activityDate.page-18 | 10000 | 6.50 → 9.73 | 6.50 → 9.73 | 3 → 2 | 50265 → 50365 |
| transactions.amount.page-0 | 10000 | Baseline failed; corrected | — | — | — |
| transactions.amount.page-18 | 10000 | Baseline failed; corrected | — | — | — |
| transactions.merchantName.page-0 | 10000 | 7.53 → 5.02 | 7.53 → 5.02 | 3 → 2 | 50265 → 50365 |
| transactions.merchantName.page-18 | 10000 | 11.08 → 5.74 | 11.08 → 5.74 | 3 → 2 | 50263 → 50363 |
| transactions.pending.page-0 | 10000 | 6.56 → 5.00 | 6.56 → 5.00 | 3 → 2 | 50207 → 50307 |
| transactions.pending.page-18 | 10000 | 7.88 → 6.17 | 7.88 → 6.17 | 3 → 2 | 50270 → 50370 |
| transactions.date-filter | 10000 | 6.71 → 3.26 | 6.71 → 3.26 | 3 → 2 | 50419 → 50519 |
| transactions.search | 10000 | 36.68 → 5.47 | 36.68 → 5.47 | 1 → 2 | 7956 → 7996 |
| mcp-transactions.fx-1-dates-1-currencies | 10000 | 4.48 → 4.56 | 4.48 → 4.56 | 5 → 2 | 62777 → 63203 |
| mcp-transactions.fx-1-dates-3-currencies | 10000 | 5.84 → 3.84 | 5.84 → 3.84 | 11 → 2 | 62934 → 63599 |
| mcp-transactions.fx-10-dates-1-currencies | 10000 | 10.61 → 3.89 | 10.61 → 3.89 | 32 → 2 | 63326 → 64829 |
| mcp-transactions.fx-10-dates-3-currencies | 10000 | 20.91 → 3.68 | 20.91 → 3.68 | 92 → 2 | 64599 → 68468 |
| mcp-transactions.fx-100-dates-1-currencies | 10000 | 49.56 → 4.64 | 49.56 → 4.64 | 302 → 2 | 68816 → 81173 |
| mcp-transactions.fx-100-dates-3-currencies | 10000 | 48.23 → 4.91 | 48.23 → 4.91 | 302 → 2 | 68915 → 81173 |
| holdings.1-accounts-100-positions | 10000 | 56.38 → 2.91 | 56.38 → 2.91 | 5 → 3 | 53476 → 53790 |
| holdings.20-accounts-100-positions | 10000 | 135.67 → 33.35 | 135.67 → 33.35 | 62 → 3 | 1069613 → 1075627 |
| holdings.100-accounts-100-positions | 10000 | 551.11 → 156.83 | 551.11 → 156.83 | 302 → 3 | 5351553 → 5381567 |
| history.month.20-accounts.daily | 10000 | 6.90 → 4.63 | 6.90 → 4.63 | 5 → 5 | 10892 → 11093 |
| history.year.20-accounts.daily | 10000 | 10.41 → 8.37 | 10.41 → 8.37 | 5 → 5 | 28547 → 29420 |
| history.ten-years.20-accounts.daily | 10000 | 65.71 → 52.52 | 65.71 → 52.52 | 5 → 5 | 201682 → 209127 |
| cashflow.month.summary-audit | 10000 | 29.46 → 13.05 | 29.46 → 13.05 | 10 → 4 | 550 → 564 |
| cashflow.year.summary-audit | 10000 | 76.71 → 29.17 | 76.71 → 29.17 | 10 → 4 | 555 → 569 |
| transactions.filter.category | 10000 | 4.27 → 3.11 | 4.27 → 3.11 | 3 → 2 | 64505 → 64605 |
| transactions.filter.uncategorized | 10000 | 5.79 → 3.12 | 5.79 → 3.12 | 3 → 2 | 50420 → 50520 |
| transactions.filter.date-account-category | 10000 | 2.16 → 2.33 | 2.16 → 2.33 | 2 → 2 | 6467 → 6477 |
| auth-settings.pat.recent-use | 10000 | 2.03 → 1.57 | 2.03 → 1.57 | 2 → 1 | 46 → 46 |
| auth-settings.pat.usage-due | 10000 | 1.97 → 1.55 | 1.97 → 1.55 | 2 → 1 | 46 → 46 |
| auth-settings.settings.parallel-disjoint | 10000 | 2.87 → 3.99 | 2.87 → 3.99 | 5 → 3 | 356 → 349 |
| auth-settings.settings.parallel-nested | 10000 | 2.63 → 3.06 | 2.63 → 3.06 | 5 → 3 | 358 → 352 |
