# Focused backend benchmark evidence

The user shortened the original full matrix. The retained [10k result](../comparison-10000.md) remains the strong repeated-run p50/p95 evidence. This report adds diagnostic scale and shape checks, with strict financial/source/query gates. All new normal cases use one warmup and three measured calls in one process per variant; scale checks reuse completed original 100-call captures. Do not interpret these three-call medians or stored raw p95 fields as a stable speedup/tail estimate.

| Suite / scenario | Rows | Observed median before → after (ms) | SELECTs before → after | Validation |
| --- | ---: | ---: | ---: | --- |
| scale-100000: matching.500-equal-amount-rows | 100000 | 15.70 → 0.23 | 0 → 0 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: matching.1000-equal-amount-rows | 100000 | 62.92 → 0.29 | 0 → 0 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: matching.2000-equal-amount-rows | 100000 | 255.39 → 0.53 | 0 → 0 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: transactions.activityDate.page-0 | 100000 | 25.03 → 11.86 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: transactions.activityDate.page-198 | 100000 | 25.71 → 21.70 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: transactions.amount.page-0 | 100000 | failed/unavailable → 15.16 | — → 2 | Named original failure corrected |
| scale-100000: transactions.amount.page-198 | 100000 | failed/unavailable → 25.61 | — → 2 | Named original failure corrected |
| scale-100000: transactions.merchantName.page-0 | 100000 | 28.75 → 19.36 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: transactions.merchantName.page-198 | 100000 | 29.30 → 31.41 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: transactions.pending.page-0 | 100000 | 26.72 → 19.97 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: transactions.pending.page-198 | 100000 | 27.11 → 31.74 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: transactions.date-filter | 100000 | 22.08 → 7.14 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: transactions.search | 100000 | 272.67 → 25.37 | 1 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: mcp-transactions.fx-1-dates-1-currencies | 100000 | 9.31 → 3.92 | 5 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: mcp-transactions.fx-1-dates-3-currencies | 100000 | 8.87 → 3.55 | 11 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: mcp-transactions.fx-10-dates-1-currencies | 100000 | 9.40 → 3.67 | 32 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: mcp-transactions.fx-10-dates-3-currencies | 100000 | 17.12 → 4.23 | 92 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: mcp-transactions.fx-100-dates-1-currencies | 100000 | 45.73 → 4.78 | 302 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: mcp-transactions.fx-100-dates-3-currencies | 100000 | 45.58 → 4.84 | 302 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: holdings.1-accounts-100-positions | 100000 | 65.69 → 3.41 | 5 → 3 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: holdings.20-accounts-100-positions | 100000 | 152.28 → 31.48 | 62 → 3 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: holdings.100-accounts-100-positions | 100000 | 539.46 → 175.72 | 302 → 3 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: history.month.20-accounts.daily | 100000 | 6.23 → 4.35 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: history.month.100-accounts.daily | 100000 | 11.18 → 12.01 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: history.year.20-accounts.daily | 100000 | 10.58 → 7.60 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: history.year.100-accounts.daily | 100000 | 37.69 → 33.94 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: history.ten-years.20-accounts.daily | 100000 | 66.65 → 51.30 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: history.ten-years.100-accounts.daily | 100000 | 306.49 → 184.63 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: cashflow.month.summary-audit | 100000 | 81.30 → 22.47 | 10 → 4 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: cashflow.year.summary-audit | 100000 | 557.58 → 145.15 | 10 → 4 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: http.transactions.convert | 100000 | 32.00 → 19.26 | 9 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: mcp.transport.transactions.fx-100 | 100000 | 51.67 → 9.99 | 303 → 3 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: mcp.transport.holdings-20 | 100000 | 172.35 → 58.42 | 63 → 4 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: mcp.transport.cashflow-comparison | 100000 | 99.15 → 35.69 | 21 → 9 | exact economic/selection parity after documented representation and metadata changes |
| scale-100000: mcp.transport.history-month | 100000 | 11.61 → 6.85 | 6 → 6 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: matching.500-equal-amount-rows | 1000000 | 16.09 → 0.22 | 0 → 0 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: matching.1000-equal-amount-rows | 1000000 | 63.80 → 0.30 | 0 → 0 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: matching.2000-equal-amount-rows | 1000000 | 256.90 → 0.52 | 0 → 0 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: transactions.activityDate.page-0 | 1000000 | 111.84 → 60.16 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: transactions.activityDate.page-1998 | 1000000 | 121.82 → 157.29 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: transactions.amount.page-0 | 1000000 | failed/unavailable → 64.90 | — → 2 | Named original failure corrected |
| scale-1000000: transactions.amount.page-1998 | 1000000 | failed/unavailable → 159.92 | — → 2 | Named original failure corrected |
| scale-1000000: transactions.merchantName.page-0 | 1000000 | 126.10 → 122.50 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: transactions.merchantName.page-1998 | 1000000 | 138.14 → 183.20 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: transactions.pending.page-0 | 1000000 | 118.75 → 127.81 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: transactions.pending.page-1998 | 1000000 | 129.67 → 195.71 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: transactions.date-filter | 1000000 | 117.60 → 36.54 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: transactions.search | 1000000 | 2338.30 → 106.91 | 1 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: mcp-transactions.fx-1-dates-1-currencies | 1000000 | 4.88 → 4.99 | 5 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: mcp-transactions.fx-1-dates-3-currencies | 1000000 | 9.13 → 3.67 | 11 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: mcp-transactions.fx-10-dates-1-currencies | 1000000 | 9.63 → 3.81 | 32 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: mcp-transactions.fx-10-dates-3-currencies | 1000000 | 17.36 → 4.40 | 92 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: mcp-transactions.fx-100-dates-1-currencies | 1000000 | 45.72 → 4.90 | 302 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: mcp-transactions.fx-100-dates-3-currencies | 1000000 | 45.31 → 4.54 | 302 → 2 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: holdings.1-accounts-100-positions | 1000000 | 66.21 → 3.02 | 5 → 3 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: holdings.20-accounts-100-positions | 1000000 | 153.74 → 33.53 | 62 → 3 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: holdings.100-accounts-100-positions | 1000000 | 556.12 → 176.83 | 302 → 3 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: history.month.20-accounts.daily | 1000000 | 6.65 → 4.47 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: history.month.100-accounts.daily | 1000000 | 11.92 → 12.20 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: history.year.20-accounts.daily | 1000000 | 9.95 → 8.99 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: history.year.100-accounts.daily | 1000000 | 37.94 → 24.94 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: history.ten-years.20-accounts.daily | 1000000 | 66.16 → 55.31 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: history.ten-years.100-accounts.daily | 1000000 | 300.02 → 189.02 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: cashflow.month.summary-audit | 1000000 | 595.95 → 124.46 | 10 → 4 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: cashflow.year.summary-audit | 1000000 | 5126.27 → 1237.71 | 10 → 4 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: http.transactions.convert | 1000000 | 139.62 → 68.85 | 9 → 5 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: mcp.transport.transactions.fx-100 | 1000000 | 50.70 → 11.93 | 303 → 3 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: mcp.transport.holdings-20 | 1000000 | 172.38 → 49.47 | 63 → 4 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: mcp.transport.cashflow-comparison | 1000000 | 786.41 → 224.70 | 21 → 9 | exact economic/selection parity after documented representation and metadata changes |
| scale-1000000: mcp.transport.history-month | 1000000 | 6.80 → 7.52 | 6 → 6 | exact economic/selection parity after documented representation and metadata changes |
| shape: shape.cashflow.month.rules-on.lookaround-0 | 10000 | 31.99 → 19.45 | 10 → 4 | exact economic/selection parity after documented representation and metadata changes |
| shape: shape.cashflow.year.rules-on.lookaround-0 | 10000 | 81.22 → 29.43 | 10 → 4 | exact economic/selection parity after documented representation and metadata changes |
| shape: shape.cashflow.month.rules-on.lookaround-30 | 10000 | 30.94 → 13.89 | 10 → 4 | exact economic/selection parity after documented representation and metadata changes |
| shape: shape.cashflow.year.rules-on.lookaround-30 | 10000 | 80.87 → 28.33 | 10 → 4 | exact economic/selection parity after documented representation and metadata changes |
| shape: shape.history.year.20-accounts.dense.daily | 10000 | 45.97 → 45.45 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| shape: shape.history.year.20-accounts.sparse-prior-fx.daily | 10000 | 12.04 → 19.10 | 8 → 6 | exact economic/selection parity after documented representation and metadata changes |
| shape: shape.history.year.100-accounts.dense.daily | 10000 | 218.97 → 223.42 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| shape: shape.history.year.100-accounts.sparse-prior-fx.daily | 10000 | 41.95 → 40.46 | 8 → 6 | named baseline arithmetic correction: 115554.99999999999 → exact 115555; all integer totals, accounts, dates and labels unchanged |
| filters: transactions.filter.category | 100000 | 14.71 → 8.07 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| filters: transactions.filter.uncategorized | 100000 | 24.55 → 11.69 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| filters: transactions.filter.date-account-category | 100000 | 20.09 → 3.48 | 3 → 2 | exact economic/selection parity after documented representation and metadata changes |
| auth-settings: auth-settings.pat.recent-use | 10000 | 0.97 → 0.78 | 2 → 1 | exact economic/selection parity after documented representation and metadata changes |
| auth-settings: auth-settings.pat.usage-due | 10000 | 1.03 → 0.76 | 2 → 1 | exact economic/selection parity after documented representation and metadata changes |
| auth-settings: auth-settings.settings.parallel-disjoint | 10000 | 1.99 → 1.97 | 5 → 3 | named settings concurrency correction; both requested patches and all unrelated siblings preserved |
| auth-settings: auth-settings.settings.parallel-nested | 10000 | 1.87 → 1.97 | 5 → 3 | named settings concurrency correction; both requested patches and all unrelated siblings preserved |
| extended: extended.cursor.activityDate.deep | 1000000 | 127.18 → 16.98 | 3 → 1 | exact ordered deep-page data; initial count retained by caller, continuation omits count |
| extended: extended.cursor.amount.deep | 1000000 | failed/unavailable → 23.95 | — → 1 | Named original failure corrected |
| extended: extended.cursor.merchantName.deep | 1000000 | 143.52 → 80.16 | 3 → 1 | exact ordered deep-page data; initial count retained by caller, continuation omits count |
| extended: extended.cursor.pending.deep | 1000000 | 140.52 → 67.46 | 3 → 1 | exact ordered deep-page data; initial count retained by caller, continuation omits count |
| extended: extended.holdings.1-accounts.0-positions | 1000000 | 59.52 → 2.00 | 3 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.holdings.20-accounts.0-positions | 1000000 | 72.75 → 4.40 | 22 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.holdings.100-accounts.0-positions | 1000000 | 89.97 → 11.13 | 102 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.holdings.1-accounts.10-positions | 1000000 | 63.25 → 3.85 | 5 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.holdings.20-accounts.10-positions | 1000000 | 88.27 → 6.44 | 62 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.holdings.100-accounts.10-positions | 1000000 | 173.32 → 24.73 | 302 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.portfolio.1-accounts.0-positions | 1000000 | 58.56 → 1.17 | 3 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.portfolio.20-accounts.0-positions | 1000000 | 72.87 → 3.21 | 22 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.portfolio.100-accounts.0-positions | 1000000 | 87.58 → 9.59 | 102 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.portfolio.1-accounts.10-positions | 1000000 | 65.40 → 2.66 | 5 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.portfolio.20-accounts.10-positions | 1000000 | 92.33 → 7.00 | 62 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.portfolio.100-accounts.10-positions | 1000000 | 176.29 → 28.60 | 302 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.portfolio.1-accounts.100-positions | 1000000 | 60.56 → 3.22 | 5 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.portfolio.20-accounts.100-positions | 1000000 | 159.74 → 36.55 | 62 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.portfolio.100-accounts.100-positions | 1000000 | 584.90 → 201.22 | 302 → 3 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.portfolio.20-accounts.mixed-currency-dates | 1000000 | 157.97 → 40.70 | 65 → 4 | exact economic/selection parity after documented representation and metadata changes |
| extended: extended.transactions.no-match-amount | 1000000 | 27944.62 → 73.23 | 761 → 1 | bounded first call; full advancing continuation checked against ordered SQL oracle |
| extended: extended.transactions.rare-match-amount | 1000000 | 28156.79 → 73.31 | 761 → 1 | bounded first call; full advancing continuation checked against ordered SQL oracle |
| extended: extended.history.ten-years.20-accounts.compact | 1000000 | 74.93 → 48.91 | 5 → 5 | exact boundaries/accounts; selected original daily points; explicit compact chart |
| extended: extended.history.ten-years.100-accounts.compact | 1000000 | 335.78 → 187.32 | 5 → 5 | exact boundaries/accounts; selected original daily points; explicit compact chart |
| sync: sync.banking.50.rules-off | 10000 | 53.08 → 19.95 | 100 → 3 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.banking.50.rules-on | 10000 | 66.95 → 21.48 | 100 → 3 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.banking.500.rules-off | 10000 | 365.59 → 80.04 | 1000 → 4 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.banking.500.rules-on | 10000 | 369.42 → 70.68 | 1000 → 4 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.banking.5000.rules-off | 10000 | failed/unavailable → 647.63 | — → 22 | Named original failure corrected |
| sync: sync.banking.5000.rules-on | 10000 | failed/unavailable → 720.86 | — → 22 | Named original failure corrected |
| sync: sync.banking-modified.50.rules-off | 10000 | 94.84 → 19.90 | 250 → 3 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.banking-modified.50.rules-on | 10000 | 97.70 → 21.50 | 250 → 3 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.banking-modified.500.rules-off | 10000 | 963.84 → 82.78 | 2500 → 4 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.banking-modified.500.rules-on | 10000 | 1003.00 → 81.44 | 2500 → 4 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.banking-modified.5000.rules-off | 10000 | 13374.95 → 941.66 | 25000 → 22 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.banking-modified.5000.rules-on | 10000 | 12943.67 → 1124.09 | 25000 → 22 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.investment-transactions.50 | 10000 | 108.62 → 8.80 | 100 → 4 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.investment-transactions.500 | 10000 | 1700.66 → 57.04 | 1000 → 5 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.investment-transactions.5000 | 10000 | 17586.50 → 614.25 | 10000 → 20 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.holdings.0-positions | 10000 | 0.42 → 5.58 | 0 → 4 | exact economic/selection parity after documented representation and metadata changes |
| sync: sync.holdings.100-positions | 10000 | 199.90 → 14.20 | 201 → 5 | exact economic/selection parity after documented representation and metadata changes |
| memory/history.ten-years.20-accounts.daily: history.ten-years.20-accounts.daily | 10000 | 84.82 → 56.79 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| memory/history.ten-years.100-accounts.daily: history.ten-years.100-accounts.daily | 10000 | 353.91 → 194.59 | 5 → 5 | exact economic/selection parity after documented representation and metadata changes |
| memory/extended.history.ten-years.20-accounts.compact: extended.history.ten-years.20-accounts.compact | 10000 | 75.52 → 58.86 | 5 → 5 | exact boundaries/accounts; selected original daily points; explicit compact chart |
| memory/extended.history.ten-years.100-accounts.compact: extended.history.ten-years.100-accounts.compact | 10000 | 374.75 → 195.11 | 5 → 5 | exact boundaries/accounts; selected original daily points; explicit compact chart |

Mixed load uses one 30-second phase at each listed shape. Its saturated sync producer processes different write rates in the two variants; compare that rate alongside read throughput. Raw observed tails, event-loop delay and pool waits are retained in comparison.json, with no repeated-run confidence claim.

| Transport | Concurrency | Sync | Requests/s before → after | Completed sync batches/s before → after | Errors |
| --- | ---: | --- | ---: | ---: | ---: |
| http | 1 | false | 61.50 → 83.29 | 0.00 → 0.00 | 0 → 0 |
| http | 1 | true | 69.32 → 77.86 | 4.78 → 80.50 | 0 → 0 |
| http | 10 | false | 231.99 → 305.33 | 0.00 → 0.00 | 0 → 0 |
| http | 10 | true | 229.37 → 250.15 | 1.10 → 32.11 | 0 → 0 |
| mcp | 1 | false | 18.83 → 63.25 | 0.00 → 0.00 | 0 → 0 |
| mcp | 1 | true | 13.14 → 59.08 | 6.72 → 51.38 | 0 → 0 |
| mcp | 10 | false | 45.33 → 150.08 | 0.00 → 0.00 | 0 → 0 |
| mcp | 10 | true | 39.21 → 144.86 | 2.62 → 17.75 | 0 → 0 |

Isolated memory rows retain sampled process RSS peaks, including observer/worker overhead. The stronger three-process memory matrix was intentionally omitted. Schema parity, actual sync write plans, migration runtime/locks and production browser evidence remain separately retained.
