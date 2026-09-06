Dataset scope: 10000 total transaction rows only; this is not full-matrix completion. Median of each independent process run’s percentiles; spread, policy and semantic validation are retained in comparison-10000.json. Bounded-continuation rows compare different per-call scan budgets, and compact rows compare explicit chart resolutions; neither is an equivalent full-output latency claim. Transport intervals include separately retained post-client JSON reserialization; client-completion percentiles are also in comparison-10000.json. Named original failures have verified final results and final timings, with no computed speedup.

| Scenario | Rows | p50 before → after (ms) | p95 before → after (ms) | SELECTs | JSON bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| matching.500-equal-amount-rows | 10000 | 15.98 → 0.14 | 16.64 → 0.16 | 0 → 0 | 20026 → 20026 |
| matching.1000-equal-amount-rows | 10000 | 64.70 → 0.22 | 67.18 → 0.26 | 0 → 0 | 40026 → 40026 |
| matching.2000-equal-amount-rows | 10000 | 260.14 → 0.40 | 279.82 → 0.45 | 0 → 0 | 80026 → 80026 |
| transactions.activityDate.page-0 | 10000 | 7.88 → 4.06 | 12.64 → 5.46 | 3 → 2 | 50213 → 50313 |
| transactions.activityDate.page-18 | 10000 | 7.58 → 5.45 | 11.00 → 7.45 | 3 → 2 | 50265 → 50365 |
| transactions.amount.page-0 | 10000 | Failed → 5.91 | — → 7.12 | — → 2 | See diagnostics |
| transactions.amount.page-18 | 10000 | Failed → 5.63 | — → 7.75 | — → 2 | See diagnostics |
| transactions.merchantName.page-0 | 10000 | 7.65 → 6.47 | 11.17 → 8.24 | 3 → 2 | 50265 → 50365 |
| transactions.merchantName.page-18 | 10000 | 8.27 → 5.38 | 11.49 → 7.35 | 3 → 2 | 50263 → 50363 |
| transactions.pending.page-0 | 10000 | 6.57 → 6.08 | 8.79 → 7.28 | 3 → 2 | 50207 → 50307 |
| transactions.pending.page-18 | 10000 | 8.68 → 6.09 | 14.74 → 7.89 | 3 → 2 | 50270 → 50370 |
| transactions.date-filter | 10000 | 7.46 → 3.86 | 16.45 → 5.15 | 3 → 2 | 50419 → 50519 |
| transactions.search | 10000 | 32.64 → 5.60 | 34.45 → 6.90 | 1 → 2 | 7956 → 7996 |
| mcp-transactions.fx-1-dates-1-currencies | 10000 | 5.36 → 4.73 | 10.15 → 8.12 | 5 → 2 | 62777 → 63203 |
| mcp-transactions.fx-1-dates-3-currencies | 10000 | 9.77 → 6.77 | 12.19 → 8.49 | 11 → 2 | 62934 → 63599 |
| mcp-transactions.fx-10-dates-1-currencies | 10000 | 9.02 → 8.73 | 9.80 → 9.74 | 32 → 2 | 63326 → 64829 |
| mcp-transactions.fx-10-dates-3-currencies | 10000 | 16.86 → 8.10 | 18.40 → 10.34 | 92 → 2 | 64599 → 68468 |
| mcp-transactions.fx-100-dates-1-currencies | 10000 | 45.30 → 10.80 | 47.50 → 13.50 | 302 → 2 | 68816 → 81173 |
| mcp-transactions.fx-100-dates-3-currencies | 10000 | 44.88 → 7.90 | 52.85 → 13.27 | 302 → 2 | 68915 → 81173 |
| holdings.1-accounts-100-positions | 10000 | 66.28 → 4.89 | 69.02 → 6.49 | 5 → 3 | 53476 → 53790 |
| holdings.20-accounts-100-positions | 10000 | 152.19 → 39.36 | 164.90 → 41.86 | 62 → 3 | 1069613 → 1075627 |
| holdings.100-accounts-100-positions | 10000 | 540.87 → 174.18 | 608.50 → 182.37 | 302 → 3 | 5351553 → 5381567 |
| history.month.20-accounts.daily | 10000 | 5.88 → 3.63 | 11.78 → 4.59 | 5 → 5 | 10892 → 11093 |
| history.month.100-accounts.daily | 10000 | 12.42 → 9.28 | 14.88 → 11.82 | 5 → 5 | 47486 → 47847 |
| history.year.20-accounts.daily | 10000 | 10.43 → 9.83 | 12.35 → 11.17 | 5 → 5 | 28547 → 29420 |
| history.year.100-accounts.daily | 10000 | 37.64 → 30.85 | 42.97 → 32.52 | 5 → 5 | 65476 → 66509 |
| history.ten-years.20-accounts.daily | 10000 | 67.50 → 54.76 | 82.31 → 57.04 | 5 → 5 | 201682 → 209127 |
| history.ten-years.100-accounts.daily | 10000 | 297.41 → 183.21 | 330.19 → 195.90 | 5 → 5 | 241896 → 249501 |
| cashflow.month.summary-audit | 10000 | 30.08 → 13.91 | 33.99 → 14.89 | 10 → 4 | 550 → 564 |
| cashflow.year.summary-audit | 10000 | 74.12 → 30.53 | 79.72 → 32.70 | 10 → 4 | 555 → 569 |
| http.transactions.convert | 10000 | 12.59 → 10.65 | 19.99 → 16.79 | 9 → 5 | 108654 → 109294 |
| mcp.transport.transactions.fx-100 | 10000 | 50.21 → 15.47 | 54.57 → 17.99 | 303 → 3 | 179028 → 213040 |
| mcp.transport.holdings-20 | 10000 | 170.75 → 61.05 | 189.45 → 67.17 | 63 → 4 | 2687633 → 2704652 |
| mcp.transport.cashflow-comparison | 10000 | 36.46 → 19.49 | 41.30 → 24.10 | 21 → 9 | 6812 → 6896 |
| mcp.transport.history-month | 10000 | 10.66 → 10.16 | 15.57 → 13.82 | 6 → 6 | 27998 → 28553 |

Diagnostic p50 values below are medians of per-process medians. SQL elapsed can include connection acquisition: pool wait is not an additional disjoint cost. SELECT/CTE time excludes top-level writes; all-data SQL time is unavailable in earlier captures. CPU and serialization overlap the measured request, and are not additive stages.

| Scenario | Rows | CPU p50 ms | SELECT/CTE elapsed p50 ms | All data SQL elapsed p50 ms | Serialization p50 ms | Pool acquisition p50 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| matching.500-equal-amount-rows | 10000 | 16.01 → 0.14 | 0.00 → 0.00 | unavailable → 0.00 | 0.05 → 0.05 | 0.00 → 0.00 |
| matching.1000-equal-amount-rows | 10000 | 64.74 → 0.22 | 0.00 → 0.00 | unavailable → 0.00 | 0.10 → 0.09 | 0.00 → 0.00 |
| matching.2000-equal-amount-rows | 10000 | 260.32 → 0.40 | 0.00 → 0.00 | unavailable → 0.00 | 0.19 → 0.17 | 0.00 → 0.00 |
| transactions.activityDate.page-0 | 10000 | 3.27 → 1.89 | 6.51 → 5.53 | unavailable → 5.53 | 0.24 → 0.21 | 0.01 → 0.07 |
| transactions.activityDate.page-18 | 10000 | 2.82 → 1.86 | 6.30 → 6.57 | unavailable → 6.57 | 0.23 → 0.22 | 0.01 → 0.07 |
| transactions.amount.page-0 | 10000 | unavailable → 1.97 | unavailable → 6.68 | unavailable → 6.68 | unavailable → 0.25 | unavailable → 0.07 |
| transactions.amount.page-18 | 10000 | unavailable → 1.75 | unavailable → 6.50 | unavailable → 6.50 | unavailable → 0.24 | unavailable → 0.06 |
| transactions.merchantName.page-0 | 10000 | 2.80 → 2.11 | 6.56 → 7.48 | unavailable → 7.48 | 0.24 → 0.29 | 0.01 → 0.07 |
| transactions.merchantName.page-18 | 10000 | 2.82 → 1.59 | 7.08 → 6.35 | unavailable → 6.35 | 0.26 → 0.21 | 0.01 → 0.05 |
| transactions.pending.page-0 | 10000 | 2.42 → 2.02 | 5.47 → 6.77 | unavailable → 6.77 | 0.22 → 0.29 | 0.01 → 0.06 |
| transactions.pending.page-18 | 10000 | 2.98 → 1.62 | 7.24 → 6.62 | unavailable → 6.62 | 0.24 → 0.22 | 0.01 → 0.05 |
| transactions.date-filter | 10000 | 2.41 → 1.72 | 6.21 → 4.97 | unavailable → 4.97 | 0.26 → 0.24 | 0.01 → 0.06 |
| transactions.search | 10000 | 33.02 → 2.16 | 19.80 → 7.17 | unavailable → 7.17 | 0.03 → 0.06 | 0.01 → 0.13 |
| mcp-transactions.fx-1-dates-1-currencies | 10000 | 2.73 → 2.28 | 3.99 → 2.96 | unavailable → 2.96 | 0.12 → 0.14 | 0.01 → 0.00 |
| mcp-transactions.fx-1-dates-3-currencies | 10000 | 3.63 → 2.65 | 8.09 → 4.58 | unavailable → 4.58 | 0.16 → 0.18 | 0.02 → 0.00 |
| mcp-transactions.fx-10-dates-1-currencies | 10000 | 3.69 → 3.33 | 7.17 → 5.44 | unavailable → 5.44 | 0.12 → 0.25 | 0.05 → 0.00 |
| mcp-transactions.fx-10-dates-3-currencies | 10000 | 6.57 → 2.92 | 13.79 → 5.57 | unavailable → 5.57 | 0.14 → 0.22 | 0.15 → 0.00 |
| mcp-transactions.fx-100-dates-1-currencies | 10000 | 15.47 → 3.68 | 38.50 → 7.05 | unavailable → 7.05 | 0.15 → 0.31 | 0.38 → 0.00 |
| mcp-transactions.fx-100-dates-3-currencies | 10000 | 15.12 → 3.12 | 38.26 → 5.28 | unavailable → 5.28 | 0.16 → 0.24 | 0.37 → 0.00 |
| holdings.1-accounts-100-positions | 10000 | 65.44 → 2.03 | 40.28 → 3.12 | unavailable → 3.12 | 0.10 → 0.12 | 0.02 → 0.00 |
| holdings.20-accounts-100-positions | 10000 | 110.12 → 28.56 | 106.99 → 22.54 | unavailable → 22.54 | 2.38 → 2.39 | 0.09 → 0.01 |
| holdings.100-accounts-100-positions | 10000 | 342.00 → 142.07 | 394.57 → 97.95 | unavailable → 97.95 | 14.57 → 11.83 | 0.43 → 0.02 |
| history.month.20-accounts.daily | 10000 | 2.28 → 1.60 | 5.70 → 4.41 | unavailable → 4.41 | 0.05 → 0.03 | 0.06 → 0.00 |
| history.month.100-accounts.daily | 10000 | 5.26 → 4.12 | 9.97 → 11.72 | unavailable → 11.72 | 0.14 → 0.11 | 0.05 → 0.01 |
| history.year.20-accounts.daily | 10000 | 5.75 → 5.36 | 7.72 → 10.03 | unavailable → 10.03 | 0.10 → 0.11 | 0.03 → 0.00 |
| history.year.100-accounts.daily | 10000 | 25.68 → 21.69 | 23.28 → 32.57 | unavailable → 32.57 | 0.22 → 0.23 | 0.05 → 0.01 |
| history.ten-years.20-accounts.daily | 10000 | 84.52 → 49.00 | 16.46 → 42.61 | unavailable → 42.61 | 0.99 → 1.01 | 0.05 → 0.01 |
| history.ten-years.100-accounts.daily | 10000 | 430.05 → 180.79 | 43.63 → 152.51 | unavailable → 152.51 | 0.83 → 0.85 | 0.09 → 0.02 |
| cashflow.month.summary-audit | 10000 | 23.44 → 8.46 | 20.48 → 18.45 | unavailable → 18.45 | 0.01 → 0.00 | 0.02 → 0.00 |
| cashflow.year.summary-audit | 10000 | 75.58 → 24.23 | 47.20 → 40.16 | unavailable → 40.16 | 0.01 → 0.01 | 0.05 → 0.01 |
| http.transactions.convert | 10000 | 5.10 → 4.55 | 7.97 → 10.83 | unavailable → 10.83 | 0.25 → 0.27 | 0.03 → 0.02 |
| mcp.transport.transactions.fx-100 | 10000 | 21.99 → 7.53 | 38.84 → 8.84 | unavailable → 8.84 | 0.27 → 0.38 | 0.41 → 0.01 |
| mcp.transport.holdings-20 | 10000 | 128.23 → 45.28 | 108.95 → 29.24 | unavailable → 29.24 | 3.77 → 3.76 | 0.09 → 0.01 |
| mcp.transport.cashflow-comparison | 10000 | 32.62 → 16.12 | 107.94 → 41.55 | unavailable → 41.55 | 0.02 → 0.02 | 0.12 → 0.02 |
| mcp.transport.history-month | 10000 | 4.81 → 4.83 | 7.90 → 9.92 | unavailable → 9.92 | 0.06 → 0.06 | 0.04 → 0.01 |

SQL bytes are serialized database-result bytes measured after the request interval. JSON/gzip are logical payloads, not wire captures. A data-modifying statement can update zero physical rows; use PAT tuple-transition validation for physical usage writes.

| Scenario | Rows | SELECT/CTE result rows p50 | SELECT/CTE serialized bytes p50 | Logical JSON bytes p50 | Logical gzip bytes p50 | Data-modifying statements p50 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| matching.500-equal-amount-rows | 10000 | 0 → 0 | 0 → 0 | 20026 → 20026 | 1256 → 1256 | unavailable → 0 |
| matching.1000-equal-amount-rows | 10000 | 0 → 0 | 0 → 0 | 40026 → 40026 | 2502 → 2502 | unavailable → 0 |
| matching.2000-equal-amount-rows | 10000 | 0 → 0 | 0 → 0 | 80026 → 80026 | 4949 → 4949 | unavailable → 0 |
| transactions.activityDate.page-0 | 10000 | 101 → 52 | 365808 → 122712 | 50213 → 50313 | 2628 → 2608 | unavailable → 0 |
| transactions.activityDate.page-18 | 10000 | 101 → 52 | 365860 → 122765 | 50265 → 50365 | 2714 → 2691 | unavailable → 0 |
| transactions.amount.page-0 | 10000 | unavailable → 52 | unavailable → 123642 | unavailable → 50372 | unavailable → 2791 | unavailable → 0 |
| transactions.amount.page-18 | 10000 | unavailable → 52 | unavailable → 123489 | unavailable → 50272 | unavailable → 2759 | unavailable → 0 |
| transactions.merchantName.page-0 | 10000 | 101 → 52 | 367910 → 124041 | 50265 → 50365 | 2716 → 2696 | unavailable → 0 |
| transactions.merchantName.page-18 | 10000 | 101 → 52 | 367908 → 124037 | 50263 → 50363 | 2748 → 2731 | unavailable → 0 |
| transactions.pending.page-0 | 10000 | 101 → 52 | 367152 → 123627 | 50207 → 50307 | 2708 → 2665 | unavailable → 0 |
| transactions.pending.page-18 | 10000 | 101 → 52 | 367265 → 123740 | 50270 → 50370 | 2721 → 2697 | unavailable → 0 |
| transactions.date-filter | 10000 | 101 → 52 | 160614 → 122923 | 50419 → 50519 | 2304 → 2314 | unavailable → 0 |
| transactions.search | 10000 | 1550 → 21 | 8574808 → 46326 | 7956 → 7996 | 980 → 974 | unavailable → 0 |
| mcp-transactions.fx-1-dates-1-currencies | 10000 | 201 → 101 | 350162 → 178990 | 62777 → 63203 | 3252 → 3209 | unavailable → 0 |
| mcp-transactions.fx-1-dates-3-currencies | 10000 | 203 → 103 | 350698 → 179182 | 62934 → 63599 | 3464 → 3435 | unavailable → 0 |
| mcp-transactions.fx-10-dates-1-currencies | 10000 | 216 → 110 | 354246 → 179954 | 63326 → 64829 | 3479 → 3449 | unavailable → 0 |
| mcp-transactions.fx-10-dates-3-currencies | 10000 | 248 → 130 | 362750 → 181874 | 64599 → 68468 | 3658 → 3680 | unavailable → 0 |
| mcp-transactions.fx-100-dates-1-currencies | 10000 | 399 → 200 | 402832 → 188694 | 68816 → 81173 | 4220 → 4329 | unavailable → 0 |
| mcp-transactions.fx-100-dates-3-currencies | 10000 | 399 → 200 | 402832 → 188694 | 68915 → 81173 | 4379 → 4550 | unavailable → 0 |
| holdings.1-accounts-100-positions | 10000 | 12312 → 102 | 9814145 → 175605 | 53476 → 53790 | 5861 → 5883 | unavailable → 0 |
| holdings.20-accounts-100-positions | 10000 | 14250 → 2040 | 14517055 → 3512054 | 1069613 → 1075627 | 101494 → 101638 | unavailable → 0 |
| holdings.100-accounts-100-positions | 10000 | 22410 → 10200 | 34322266 → 17560295 | 5351553 → 5381567 | 506795 → 507123 | unavailable → 0 |
| history.month.20-accounts.daily | 10000 | 81 → 81 | 72457 → 69124 | 10892 → 11093 | 779 → 831 | unavailable → 0 |
| history.month.100-accounts.daily | 10000 | 401 → 401 | 360458 → 345045 | 47486 → 47847 | 1795 → 1856 | unavailable → 0 |
| history.year.20-accounts.daily | 10000 | 301 → 301 | 243177 → 239844 | 28547 → 29420 | 2762 → 2833 | unavailable → 0 |
| history.year.100-accounts.daily | 10000 | 1501 → 1501 | 1214058 → 1198645 | 65476 → 66509 | 3877 → 3942 | unavailable → 0 |
| history.ten-years.20-accounts.daily | 10000 | 2461 → 2461 | 1919337 → 1916004 | 201682 → 209127 | 13275 → 13392 | unavailable → 0 |
| history.ten-years.100-accounts.daily | 10000 | 12301 → 12301 | 9594858 → 9579445 | 241896 → 249501 | 14506 → 14571 | unavailable → 0 |
| cashflow.month.summary-audit | 10000 | 1114 → 620 | 4013178 → 1291581 | 550 → 564 | 267 → 266 | unavailable → 0 |
| cashflow.year.summary-audit | 10000 | 3206 → 1781 | 17614168 → 3726624 | 555 → 569 | 265 → 269 | unavailable → 0 |
| http.transactions.convert | 10000 | 207 → 107 | 327682 → 243946 | 108654 → 109294 | 4260 → 4533 | unavailable → 0 |
| mcp.transport.transactions.fx-100 | 10000 | 400 → 201 | 403294 → 189156 | 179028 → 213040 | 8937 → 9355 | unavailable → 0 |
| mcp.transport.holdings-20 | 10000 | 14251 → 2041 | 14517517 → 3512516 | 2687633 → 2704652 | 213586 → 214028 | unavailable → 0 |
| mcp.transport.cashflow-comparison | 10000 | 1434 → 829 | 5691018 → 1656556 | 6812 → 6896 | 1168 → 1168 | unavailable → 0 |
| mcp.transport.history-month | 10000 | 82 → 82 | 72919 → 69586 | 27998 → 28553 | 1665 → 1765 | unavailable → 0 |

Completion RSS and heap changes are descriptive and can reflect prior workloads and the common observer. Only the explicitly isolated memory suite measures a per-scenario sampled peak; its observer/worker overhead is included. Negative heap changes reflect collection, not negative allocation.

| Scenario | Rows | Heap change p50 bytes | Completion RSS p50 bytes | Isolated sampled peak RSS bytes |
| --- | ---: | ---: | ---: | ---: |
| matching.500-equal-amount-rows | 10000 | 12309400 → 149176 | 356466688 → 271089664 | unavailable → unavailable |
| matching.1000-equal-amount-rows | 10000 | -18168296 → 257768 | 358481920 → 311115776 | unavailable → unavailable |
| matching.2000-equal-amount-rows | 10000 | -5745992 → 519896 | 376160256 → 362201088 | unavailable → unavailable |
| transactions.activityDate.page-0 | 10000 | 3119888 → 2744736 | 412467200 → 376668160 | unavailable → unavailable |
| transactions.activityDate.page-18 | 10000 | 3067072 → 2669208 | 430063616 → 389791744 | unavailable → unavailable |
| transactions.amount.page-0 | 10000 | unavailable → 2720016 | unavailable → 405569536 | unavailable → unavailable |
| transactions.amount.page-18 | 10000 | unavailable → 2681472 | unavailable → 421347328 | unavailable → unavailable |
| transactions.merchantName.page-0 | 10000 | 3041872 → 2670352 | 431161344 → 434716672 | unavailable → unavailable |
| transactions.merchantName.page-18 | 10000 | 3030536 → 2666400 | 464781312 → 450445312 | unavailable → unavailable |
| transactions.pending.page-0 | 10000 | 3024648 → 2663808 | 507904000 → 463880192 | unavailable → unavailable |
| transactions.pending.page-18 | 10000 | 3018496 → 2663744 | 548110336 → 479444992 | unavailable → unavailable |
| transactions.date-filter | 10000 | 2575432 → 2624888 | 583680000 → 495386624 | unavailable → unavailable |
| transactions.search | 10000 | 15757504 → 1653376 | 746635264 → 505872384 | unavailable → unavailable |
| mcp-transactions.fx-1-dates-1-currencies | 10000 | 5619400 → 3675384 | 749420544 → 520404992 | unavailable → unavailable |
| mcp-transactions.fx-1-dates-3-currencies | 10000 | 5940088 → 3668008 | 749617152 → 542097408 | unavailable → unavailable |
| mcp-transactions.fx-10-dates-1-currencies | 10000 | 7094800 → 3700928 | 750010368 → 555237376 | unavailable → unavailable |
| mcp-transactions.fx-10-dates-3-currencies | 10000 | 10105704 → 3802792 | 768294912 → 555286528 | unavailable → unavailable |
| mcp-transactions.fx-100-dates-1-currencies | 10000 | 20626240 → 4218904 | 770031616 → 555548672 | unavailable → unavailable |
| mcp-transactions.fx-100-dates-3-currencies | 10000 | 20628936 → 4179360 | 771063808 → 556285952 | unavailable → unavailable |
| holdings.1-accounts-100-positions | 10000 | 21369976 → 2455520 | 773062656 → 556531712 | unavailable → unavailable |
| holdings.20-accounts-100-positions | 10000 | -3116176 → -14762936 | 773734400 → 619495424 | unavailable → unavailable |
| holdings.100-accounts-100-positions | 10000 | 41166832 → 51307160 | 811679744 → 887144448 | unavailable → unavailable |
| history.month.20-accounts.daily | 10000 | 1704048 → 2008312 | 833667072 → 902381568 | unavailable → unavailable |
| history.month.100-accounts.daily | 10000 | 6087976 → 6405560 | 833830912 → 902938624 | unavailable → unavailable |
| history.year.20-accounts.daily | 10000 | 9386152 → 10376680 | 833912832 → 856653824 | unavailable → unavailable |
| history.year.100-accounts.daily | 10000 | -12782632 → -15009960 | 827293696 → 856653824 | unavailable → unavailable |
| history.ten-years.20-accounts.daily | 10000 | 24300448 → -20574512 | 914800640 → 862191616 | unavailable → unavailable |
| history.ten-years.100-accounts.daily | 10000 | 128885568 → -7123944 | 1349419008 → 863027200 | unavailable → unavailable |
| cashflow.month.summary-audit | 10000 | -5065504 → 17377536 | 1347289088 → 858472448 | unavailable → unavailable |
| cashflow.year.summary-audit | 10000 | -3559832 → -1178632 | 1350107136 → 857784320 | unavailable → unavailable |
| http.transactions.convert | 10000 | 5573912 → 4919224 | 1322483712 → 866287616 | unavailable → unavailable |
| mcp.transport.transactions.fx-100 | 10000 | -20456072 → 8593336 | 1327185920 → 881967104 | unavailable → unavailable |
| mcp.transport.holdings-20 | 10000 | 16875000 → 3059168 | 1429798912 → 981499904 | unavailable → unavailable |
| mcp.transport.cashflow-comparison | 10000 | 2306072 → -22868520 | 1391706112 → 966115328 | unavailable → unavailable |
| mcp.transport.history-month | 10000 | 4583240 → 4886992 | 1293582336 → 968753152 | unavailable → unavailable |
