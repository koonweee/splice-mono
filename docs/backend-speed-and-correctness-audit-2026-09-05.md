# Splice backend speed and correctness audit

Audited September 5, 2026 against the current working tree, including the previous dashboard/SSR performance changes. This is an audit, not an implemented change or a deployment report.

The strongest architectural opportunity is a small set of shared, domain-specific query services inside the existing NestJS/TypeORM/PostgreSQL backend. HTTP, MCP tools, MCP Apps, and background jobs can use the same ownership checks, date semantics, projections, and conversion logic. The current evidence does not justify replacing the framework, database, or ORM wholesale.

**Evidence and limits.** Inspected services, callers, entities, and migrations; ran actual service code with synthetic in-memory repositories; reran four relevant suites: **86 tests passed**. Query counts below count calls to actual query-builder/repository methods against mocks; they are not recorded production SQL. CPU figures exclude PostgreSQL, network, MCP transport, and model latency. No production query plans, table cardinalities, p95 timings, or deployed index inventory were collected. The existing tests passing alongside the reproductions identifies missing coverage, not proof that the reproduced cases are correct.

Reproduction [script](/Users/jtkw/.codex/visualizations/2026/09/05/01a07266-932e-76f3-95e4-a37ded3e77d6/splice-backend-audit.cjs) and [results](/Users/jtkw/.codex/visualizations/2026/09/05/01a07266-932e-76f3-95e4-a37ded3e77d6/splice-backend-audit.json) are available. Run the script with Node from this checkout; it only uses synthetic repositories and writes its result beside itself.

## Shared query paths with the highest return

| Proposed shared boundary | Current duplication | Callers that benefit | Responsibility |
| --- | --- | --- | --- |
| Transaction reads | TransactionService, McpReadService, analysis candidate query | Web transaction table/search, MCP list/search, analysis and future exports | User scope, indexed effective date, filters, explicit projections, deterministic pagination |
| FX lookup and conversion | Per-date MCP loop, web controller conversion, analysis, portfolio conversion | All currency-aware HTTP and MCP reads | Batch currency/date requests, rate provenance, explicit valuation date and rounding policy |
| Holdings reads | InvestmentService versus McpReadService | Web account detail, manual brokerage workflows, MCP holdings/resources and portfolio App | Authoritative latest snapshot, including empty snapshots; batch across accounts |
| Cash-flow report | Summary, category detail, and audit load/recompute separately | Web analysis, MCP analysis/audit tools, cash-flow App | Load candidates/rules/settings once, apply rules once, derive consistent views |
| Balance projection | Dashboard projection versus legacy matrix consumed by history summary | Home, account history, MCP balance history and future charts | Extend the existing projection to explicit date ranges/account subsets; separate exact values from chart sampling |

These are proposed boundaries, not a requirement to create five new classes. Extend/extract existing services where sensible. Public callers should receive typed results, while ownership-sensitive query builders remain internal. Keep mutations and transaction boundaries explicit. Existing `OwnedCrudService` remains useful for simple CRUD; these read paths need domain-specific semantics.

### 1. High return: make transaction queries use the effective-date index

The schema already has `(userId, activityDate, id)` and `(accountId, activityDate)` indexes on account activity. Transaction creation and update paths populate `activity.activityDate`. However, web lists, MCP lists, and analysis filter on `COALESCE(reportingDateOverride, authorizedDate, activity.providerDate)` across joined tables. The stored date index cannot directly supply that expression's date bounds; the user prefix may still help. MCP also orders/cursors on the banking transaction ID, while the date index ends in the activity ID.

Centralize the read predicate on the canonical stored date after verifying/backfilling equality with the expression and preserving it on every write. Align pagination keys with the chosen index, retaining required chronological tie-breaks and handling existing cursors explicitly. Inspect actual `EXPLAIN (ANALYZE, BUFFERS)` before adding indexes; exact plans and speedups remain unmeasured. PostgreSQL's [multicolumn index guidance](https://www.postgresql.org/docs/current/indexes-multicolumn.html) explains why the predicate and key order matter.

The same shared reader should select only required fields. Current joins hydrate the transaction's raw provider payload and other metadata for simple lists/analysis; MCP additionally selects the bank link even though its transaction mapper does not use it. Keep full metadata in detail/sync paths. Legacy `search_transactions` reads every SQL match, maps/filter rows in JavaScript, then slices to 20. Push merchant/native-amount filters and the limit into SQL, with a separate exact count only when the response contract requires it. For deep web pagination, evaluate cursor pagination against the table's page-number requirements.

**MCP: direct benefit** to list/search and analysis. Existing MCP transaction pagination also reports `hasMore=true` when the last page contains exactly the requested number of rows; a matching-row lookahead would avoid an unnecessary empty follow-up call. Converted-amount filters can scan many candidate batches before returning a page, so bound that work and expose continuation semantics.

Sources: [date expression](/Users/jtkw/projects/splice-mono/backend/src/transaction/transaction-date.ts:3), [indexes](/Users/jtkw/projects/splice-mono/backend/src/account-activity/account-activity.entity.ts:19), [date writes](/Users/jtkw/projects/splice-mono/backend/src/transaction/transaction.service.ts:209), [web query](/Users/jtkw/projects/splice-mono/backend/src/transaction/transaction.service.ts:856), [MCP query](/Users/jtkw/projects/splice-mono/backend/src/mcp/mcp-read.service.ts:1125), [legacy search](/Users/jtkw/projects/splice-mono/backend/src/transaction/transaction.service.ts:1199).

### 2. High return: batch FX reads across dates

MCP converts transactions sequentially, caching only identical currency/date keys within the call. Each distinct foreign-currency date calls `getRateMap`, which performs three sequential rate reads: in-range, prior, and future. The probe returned **100 transactions on 100 dates with 300 FX query-builder reads**. This is additional to the transaction query.

Extend the existing FX service with a batch API for currency pairs and requested dates. Fetch bounded history/boundaries once per batch, reuse the fill logic, and memoize duplicate work within the request. A broad contiguous range can reuse the existing range query; sparse dates need a bounded strategy rather than constructing every date over an arbitrarily large span. Query future fallback only when needed, and parallelize independent reads where appropriate. Preserve missing-rate failures and carry the actual rate date/source through conversion metadata.

**MCP: very strong direct benefit** to transaction lists and portfolio valuation. Balance and analysis already batch more effectively, but can share the resulting resolver. Valuation dates currently differ deliberately or implicitly: web transaction conversion uses today, analysis uses report end, and MCP transaction conversion uses activity date. Make this an explicit policy rather than silently unifying these meanings.

Sources: [MCP conversion loop](/Users/jtkw/projects/splice-mono/backend/src/mcp/mcp-read.service.ts:541), [rate lookup](/Users/jtkw/projects/splice-mono/backend/src/mcp/mcp-read.service.ts:1271), [three rate reads](/Users/jtkw/projects/splice-mono/backend/src/currency-exchange/currency-exchange.service.ts:81), [web valuation date](/Users/jtkw/projects/splice-mono/backend/src/transaction/transaction.controller.ts:174).

### 3. High correctness priority: centralize latest holdings, including empty portfolios

MCP queries a latest holding, then all holdings on that date, separately for each account. **20 accounts produced 40 sequential holdings reads**, excluding account lookup and conversion. A grouped latest-snapshot query joined back to holdings can make the query count independent of account count, with ownership enforced throughout.

More importantly, its latest-date definition differs from the web service. For a manual holdings account, the web uses the latest factual balance snapshot as the header; MCP uses the latest nonempty holding row. With holdings on September 4 and a cleared portfolio on September 5, the probe returned **zero holdings on the web and an old holding through MCP**. The portfolio App consumes that same MCP path. Linked portfolios also have no persisted empty holdings header in `upsertPlaidHoldings`, so a later zero-holdings snapshot can fall back to an older day.

Use a common holdings-snapshot read model that represents a successful empty snapshot explicitly. Reuse existing factual headers where valid, and add a dedicated holdings snapshot header/version for provider snapshots as needed; a balance sync is not automatically evidence of a holdings sync. Date-specific reads and latest reads should share the same ownership and projection logic.

**MCP: direct speed and correctness benefit**, including the portfolio visualization. Web/manual brokerage callers also gain a consistent reusable reader.

Sources: [MCP latest holdings](/Users/jtkw/projects/splice-mono/backend/src/mcp/mcp-read.service.ts:940), [web latest holdings](/Users/jtkw/projects/splice-mono/backend/src/investment/investment.service.ts:120), [portfolio caller](/Users/jtkw/projects/splice-mono/backend/src/mcp/mcp-portfolio-visualization.service.ts:183).

### 4. High return: compute cash flow once and derive all views

Summary, category detail, and audit each load candidates and reapply rules. The MCP cash-flow App calls summary and audit concurrently for one period; a comparison repeats this for another period. That is **two evaluations per period, four for a comparison**, with potentially different data/rules observed between reads.

Build one report context from settings, candidate rows, rules and FX, then derive summary, adjustments, and paginated drilldown. Use an appropriate read transaction when a point-in-time snapshot across SQL reads is required. Thin candidate projections should retain all fields used by rule matching; do not filter away transfer counterparts before neutralization or apply SQL aggregation ahead of those rules.

Within the matching engine, each inflow filters and sorts possible outflows again. A synthetic equal-amount bucket took **15.89 ms for 500 rows, 59.18 ms for 1,000, and 236.19 ms for 2,000**. This is a constructed scaling case, not a typical-account forecast. Pre-sort/date-index each currency/amount bucket and preserve nearest-earlier matching, tie-breaking, and rule precedence.

The shared report should also resolve a confirmed rounding mismatch: two EUR 0.01 outflows at a 1.5 USD rate produce a **USD 0.03 summary but USD 0.04 when the displayed drilldown rows are summed**. Summary currently converts grouped amounts; detail rounds each transaction. Choose one reconciliation policy and test it across both views.

**MCP: strong direct benefit** to analysis tools and the cash-flow App; web analysis and drilldown benefit too.

Sources: [analysis](/Users/jtkw/projects/splice-mono/backend/src/transaction-analysis/transaction-analysis.service.ts:72), [matching](/Users/jtkw/projects/splice-mono/backend/src/transaction-analysis/transaction-analysis.service.ts:377), [aggregate conversion](/Users/jtkw/projects/splice-mono/backend/src/transaction-analysis/transaction-analysis.service.ts:605), [row conversion](/Users/jtkw/projects/splice-mono/backend/src/transaction-analysis/transaction-analysis.service.ts:728), [duplicate App evaluation](/Users/jtkw/projects/splice-mono/backend/src/mcp/mcp.definition.ts:1330).

### 5. Medium/high return: share the existing balance projection with MCP

The previous work added the compact dashboard projection and a faster shared snapshot cursor. MCP history still builds the legacy daily account matrix and summarizes it afterward. Extend the projection to arbitrary requested dates/account subsets and adapt the existing history response from it. Exact daily chart output can be retained while avoiding the matrix; reducing chart points requires an explicit resolution/budget contract so existing callers do not silently lose detail.

The prior isolated benchmark already showed that this MCP response still contained **3,651 chart points / 227,248 raw bytes** for 20 accounts over ten years. That is output size, not the larger intermediate matrix. Add range/output budgets and preserve exact totals, daily FX validation, historical semantics and ownership parity.

**MCP: strong direct benefit** to history CPU/memory, and payload/token size if bounded chart resolution is adopted. Home already benefits from the previous implementation.

Sources: [existing projection](/Users/jtkw/projects/splice-mono/backend/src/balance-query/balance-query.service.ts:357), [MCP history summary](/Users/jtkw/projects/splice-mono/backend/src/balance-query/balance-history-surface.service.ts:175), [prior benchmark](/Users/jtkw/.codex/visualizations/2026/09/05/01a07266-932e-76f3-95e4-a37ded3e77d6/splice-mcp-performance.json).

## Write-path and correctness priorities

### 6. High priority: batch sync preparation and commit complete investment snapshots

Bank transaction sync already uses a database transaction and a bank-link cursor hook. Preserve that protection. It nevertheless performs individual existing/pending identity lookups; categorization reloads the same active rules for each eligible transaction. The probe performed **500 identical rule reads for 500 eligible transactions**. Load identities and one coherent rule set per batch, then evaluate in memory. Respect manual categories, pending-to-posted replacement, archival, revision handling, and duplicate provider IDs when batching.

Investment sync is less protected. Securities and holdings are saved individually, then stale same-day holdings are deleted. Activity and investment-transaction records are also written separately. There is no encompassing transaction in these service paths or their bank-link callers. An injected failure on holding write two left write one persisted and skipped cleanup. Concurrent read-then-save upserts can also race against unique constraints; overlapping snapshot cleanup can invalidate another run's work.

Fetch providers outside the database transaction, prepare batches, then apply an atomic, idempotent snapshot with per-link/account coordination. Use conflict-aware batch upserts where valid and publish snapshot completeness only on commit. Share batch orchestration between scheduled, webhook, and manual triggers. Do not replace identity-sensitive merge logic with a blind upsert of all columns.

**MCP: indirect performance benefit** from fresher data and lower backend contention; direct correctness benefit when reads no longer observe partially applied portfolios.

Sources: [bank sync transaction](/Users/jtkw/projects/splice-mono/backend/src/transaction/transaction.service.ts:1299), [per-row rules](/Users/jtkw/projects/splice-mono/backend/src/transaction-categorization/categorization-rule.service.ts:180), [holdings writes](/Users/jtkw/projects/splice-mono/backend/src/investment/investment.service.ts:41), [investment activity writes](/Users/jtkw/projects/splice-mono/backend/src/investment/investment.service.ts:206), [bank-link caller](/Users/jtkw/projects/splice-mono/backend/src/bank-link/bank-link.service.ts:1554).

### 7. High correctness priority: fix the shared monetary representation for ETH

The crypto provider converts an exact decimal string to a JavaScript number; `MoneyWithSign` stores minor units as a number and balance columns use PostgreSQL `bigint`. The probe converted **1.000000000000000001 ETH to 1000000000000000000 wei**, losing one wei. The current money schema also rejected a one-ETH number as an unsafe integer. Separately, **10 ETH in wei exceeds the signed PostgreSQL bigint maximum**; this is a storage limit, not just a display precision issue. PostgreSQL documents these [numeric type ranges](https://www.postgresql.org/docs/current/datatype-numeric.html).

This is the strongest case for a wider shared-domain migration: exact minor-unit strings/BigInt or decimal arithmetic internally, suitable numeric storage, explicit rounding at conversion/display boundaries, and a versioned serialization contract for frontend and MCP. This improves correctness; it is not promised as a speed optimization.

**MCP: correctness benefit** for crypto balances/history and any shared money output.

Sources: [crypto conversion](/Users/jtkw/projects/splice-mono/backend/src/bank-link/providers/crypto/crypto.provider.ts:157), [money schema](/Users/jtkw/projects/splice-mono/backend/src/types/MoneyWithSign.ts:42), [storage](/Users/jtkw/projects/splice-mono/backend/src/common/balance.columns.ts:29).

### 8. Medium correctness priority: make partial settings updates atomic

`updateSettings` reads the user, merges a patch in JavaScript, then saves the entire settings JSON. The deterministic concurrent-read probe applied EUR currency and Los Angeles timezone changes; the final record retained the timezone but reverted currency to USD. Default-notification initialization has the same whole-object read/modify/write pattern.

Use a transaction/row lock or an atomic nested JSON patch with suitable conflict handling, and emit changes based on committed before/after values. Request-scoped settings reuse can also eliminate repeated user reads in financial reports without adding cross-user or cross-request financial caches.

**MCP: indirect correctness benefit** because reporting currency, timezone, and analysis settings affect MCP results; little direct latency improvement by itself.

Source: [settings updates](/Users/jtkw/projects/splice-mono/backend/src/user/user.service.ts:146).

## Lower-priority follow-ups and execution order

PAT authentication currently performs a token read, user read, and awaited `lastUsedAt` write for each validation. After measuring its share of MCP latency, consider a narrower joined read and coalesced usage timestamps while preserving prompt revocation/expiry checks. This applies to PAT-authenticated MCP/API calls, not automatically every authentication mode. [Source](/Users/jtkw/projects/splice-mono/backend/src/auth/personal-access-token.service.ts:102).

Start correctness work with latest/empty holdings and atomic snapshot publication; scope the money migration promptly. The first performance tranche should centralize transaction predicates/projections and FX batching, then cash-flow evaluation/rule preloading, followed by balance history and pagination. Settings atomicity is a small independent fix.

Before assigning production speedup targets or adding speculative indexes, collect sanitized query counts, SQL time, rows/bytes returned, entity mapping/serialization time, and endpoint/tool p50/p95. Run representative plans using PostgreSQL's [EXPLAIN guidance](https://www.postgresql.org/docs/current/using-explain.html). Existing activity, snapshot, and FX indexes already cover useful keys; test each proposed change against the actual workload and write cost.

Validate the shared boundaries with meaningful parity and failure tests: HTTP/MCP ownership and date parity, cleared portfolios, rollback and overlapping syncs, missing/fill-forward FX, matching precedence, rounding reconciliation, exact ETH round trips, cursor continuation, and concurrent settings patches. Introduce query-count budgets so future callers cannot reintroduce per-row/per-account I/O. Centralization should make these guarantees reusable, with transport-specific response formatting kept at the edges.
