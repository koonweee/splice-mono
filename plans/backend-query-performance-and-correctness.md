# Shared Backend Queries, Correctness, And Before/After Benchmarks

## Status

Done

Benchmark scope revised at the user's request: “Can we do a shorter benchmark set”. All implementation, financial correctness, migration, browser and independent-review requirements remain in scope. The focused measurement protocol below replaces the unfinished exhaustive sampling requirement; completing that original full matrix is no longer an exit criterion.

## Goal

Fix every finding in the [backend audit](../docs/backend-speed-and-correctness-audit-2026-09-05.md), centralize the financial read paths used by HTTP and MCP, and publish reproducible before/after benchmarks. Keep NestJS, TypeORM, PostgreSQL, the existing provider integrations, and the completed SSR/query-cache work.

Implementation and validation are complete: all 10 milestones and 158 criteria are verified in [the ledger](backend-query-implementation-ledger.md), and the final independent review found no major issues. Shared paths are adopted by existing callers, correctness failures have regression coverage, and benchmark results distinguish equivalent-output improvements from intentional contract/financial-policy changes. No production deployment was performed or authorized by this plan.

Settled product decisions:

- Use each transaction's **effective reporting date** for transaction/spending FX across web and MCP. A reporting-date override therefore changes both reporting inclusion and conversion date. Balance history, current balances, and portfolio valuations retain their existing valuation-date meaning.
- The user explicitly allows changing money contracts from numbers to exact decimal strings, with frontend and MCP Apps updated together. **No staged rollout, compatibility API, dual-write period, or retained numeric-money contract is required.** Prepare one coordinated release.
- Cash-flow totals sum the same once-rounded converted transaction amounts shown in drilldowns. This is the chosen reconciliation rule for fixing the audited mismatch.
- Preserve exact daily history as the default existing history behavior; add an explicit compact chart resolution for callers that want smaller output. Benchmark daily and compact results separately.
- Preserve the approved 30-second, tab-memory-only frontend query policy and mutation/sync invalidation. Shared backend reads use request-local reuse, not a new persistent financial-data cache.

## Current Behavior

The audit includes deterministic reproductions and 86 passing existing tests. Its repository mocks establish call counts and failure cases; they are not PostgreSQL query plans or production latency measurements. Capture a new real-database baseline before implementing changes.

| Area              | Current code and observation                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transaction reads | `TransactionService.buildFilteredTransactionQuery`, `findAllPaginated`, and `findMatchingTransactions`; `McpReadService.buildTransactionQuery`; `TransactionAnalysisService.getAnalysisTransactionsInRange`. Filters recompute `COALESCE(reportingDateOverride, authorizedDate, providerDate)` rather than using the stored/indexed activity date. Full entity joins hydrate unused metadata. Legacy surface search filters/maps all rows before slicing to 20. |
| Indexes           | `AccountActivityEntity` and migration `1777000000000-AddAccountActivityAndBankingTransactions.ts` already define user/date/id and account/date indexes. Snapshot account/date and FX pair/date uniqueness already provide useful indexes. Inspect actual plans before adding more.                                                                                                                                                                              |
| Pagination        | MCP transaction reads scan candidate batches of 250 and convert sequentially; a full final page reports more data without lookahead. Web uses offset pages through `frontend/src/lib/queries/primary.ts`, although the UI is infinite scrolling. It still exposes all current sorts and an exact total.                                                                                                                                                         |
| FX                | `CurrencyExchangeService.getRatesForDateRange` reads in-range/prior/future rates serially. `McpReadService.getRate` repeats this per distinct date/currency key: 100 foreign transactions on 100 dates caused 300 rate reads in the probe.                                                                                                                                                                                                                      |
| Holdings          | `InvestmentService.findLatestHoldingsForAccount` understands the factual balance header for manual holdings; `McpReadService.findLatestHoldings` does not. Twenty accounts caused 40 sequential holdings reads. Cleared manual portfolios can show old positions in MCP. Provider holdings have no explicit empty snapshot header.                                                                                                                              |
| Cash flow         | Summary, category detail, and audit reload candidates and rerun rules. `mcp.definition.ts` calls summary and audit separately per App period. Equal-amount neutralization repeatedly filters/sorts candidates. Aggregate conversion and row conversion disagree on rounding.                                                                                                                                                                                    |
| Balances          | `BalanceQueryService.loadDashboardProjection` and `balance-projection.ts` already support compact Home output. `BalanceHistorySurfaceService.getBalanceHistorySummary` still constructs the legacy daily account matrix.                                                                                                                                                                                                                                        |
| Sync              | Banking sync preserves atomic cursor/data commits but performs per-row identity/rule reads. `InvestmentService.upsertPlaidHoldings` and `upsertPlaidInvestmentTransactions` perform separate writes without a containing transaction. Manual brokerage already uses a transaction, account lock, and positions-signature concurrency check; retain those protections.                                                                                           |
| Money             | `MoneyWithSign`, `BalanceColumns`, raw analysis totals, and MCP amounts use numbers. Crypto converts exact strings through `parseFloat`; `bigint` storage overflows at ordinary ETH balances. Frontend `format.ts`, `balance-utils.ts`, forms, and both MCP App models also perform numeric financial arithmetic.                                                                                                                                               |
| Settings/auth     | `UserService.updateSettings` and default-notification initialization save entire settings JSON after an unlocked read. PAT validation performs token/user reads and a usage write per request. The standalone MCP runtime uses Auth0, so PAT improvements must not be attributed to that listener.                                                                                                                                                              |

Applicable guidance: root `AGENTS.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`, `backend/src/mcp/AGENTS.md`, `docs/mcp-app-product-guidance.md`, and `frontend/docs/ui-conventions.md`. Generated API files must be regenerated with Orval. The existing dirty working tree contains the prior performance implementation; preserve it and freeze the actual source used for the baseline rather than treating `HEAD` alone as the baseline.

## Target Data Shape

Proposed service names below describe extraction boundaries; prefer extending existing domain modules over adding a generic query framework. Public service methods accept authenticated `userId` explicitly. Keep SQL/query builders internal and return typed projections. A request-local read context may carry the scoped `EntityManager`, settings, and memoized FX; never store it on a singleton or reuse it across users/requests.

```ts
type ExactMoney = {
  money: {
    currency: string;
    amount: string; // Nonnegative integer minor units, canonical decimal text.
  };
  sign: "positive" | "negative";
};

type ExactMcpMoney = {
  amount: string; // Nonnegative decimal MAJOR units; preserve MCP's current unit.
  currency: string;
  sign: "positive" | "negative";
};

type ResolvedFx = {
  from: string;
  to: string;
  requestedDate: string;
  rateDate: string; // Actual observation used, not the requested date.
  rate: string; // Exact decimal representation of the stored rate.
  source: "DB" | "FORWARD_FILLED" | "BACKWARD_FILLED" | "IDENTITY";
};

type HoldingsSnapshotHeader = {
  id: string;
  userId: string;
  accountId: string;
  provider: "plaid" | "manual";
  snapshotDate: string;
  revision: number;
  completedAt: string;
  // A completed header with zero position rows means an empty portfolio.
};

type HistoryResolution = "daily" | "compact";

type HistorySampling = {
  resolution: HistoryResolution;
  sourcePointCount: number;
  returnedPointCount: number;
  maxPoints: number | null;
};
```

Contract rules:

- HTTP minor-unit fields remain minor units, but become strings. This includes raw monetary aggregates and signed net-flow fields, not just nested `MoneyWithSign`. MCP major-unit fields remain major units and become decimal strings. Counts, percentages, dates, and revisions keep their appropriate existing types. Rate strings are not rounded through JavaScript numbers.
- Use BigInt for integer money arithmetic and `decimal.js` for rate/price/major-unit operations. Backend already depends on `decimal.js`; add the frontend dependency when needed. Configure a dedicated decimal context with sufficient precision for the permitted 78-digit amounts, currency scales, and intermediate rate operations; the library default must not silently truncate large values. Test conversion ties and inverse rates at the supported limits, using integer-ratio rounding where necessary. Quantize converted magnitudes once using decimal half-up rounding, then apply sign. Sum exact integers afterward.
- Define backend currency scales in one pure source and generate the frontend currency metadata from it during client generation; remove the hand-copied table in `frontend/src/lib/format.ts`. Preserve current supported currencies/default behavior unless separately validated. Do not introduce a new monorepo/package manager solely for this registry.
- Keep exact values through persistence, service computations, JSON, parsing, sorting, filtering, and formatting. Converting a bounded value to `number` is allowed only at an explicit chart geometry/percentage boundary; tooltips and reported totals still use exact values.
- Use `numeric(78,0)` for integer minor-unit storage with nonnegative checks where sign is separate, including all columns embedded through `BalanceColumns`. Inspect JSONB persisted payloads containing money, recurring schedules/occurrences, reconciliation archives, undo payloads, and provider adapters as part of the contract inventory. Reject invalid/noncanonical/over-limit inputs; never silently clamp.
- Holdings headers are unique by account/provider/date, belong to the authenticated account, and are committed atomically with all corresponding positions. Preserve daily same-day replacement semantics. Explicit request results identify a latest empty snapshot rather than falling back to older positions.
- Strengthen the existing regex-only date schemas with real calendar validation, ordered ranges, and work budgets shared across HTTP and MCP. Return actionable limit errors or explicit continuation; never silently truncate a financial total.

## Milestones

### 1. Freeze the baseline and build the benchmark/regression harness

Implementation tasks:

- Add `backend/test/performance/` with deterministic fixtures, service adapters for the original and changed contracts, SQL counting/timing, workload runners, and a result summarizer. Add `backend/test/jest-performance-postgres.json` and an explicit `backend/scripts/benchmark-backend.ts` entry point.
- Reuse the isolated database guard/schema lifecycle from `backend/test/balance-query/dashboard-query.postgres.spec.ts`, extending it to all relevant entities and real migrations. Require `BACKEND_BENCHMARK_DATABASE_URL` to reference a dedicated loopback database named `splice_backend_benchmark`. Never use the user's development or production database for seeding, synchronization, truncation, or load tests.
- Freeze the complete functional baseline, including tracked/untracked prior work, in an isolated snapshot/worktree before functional edits. Record revision, dirty-content hashes, fixture checksum, schema/index definitions, Node/PostgreSQL versions, CPU, pool configuration, code build mode, and fixed clock. Do not copy secrets or personal data into the snapshot artifacts.
- Add baseline cases for each audit reproduction before changing its behavior: cleared holdings, partial writes, duplicate/overlapping sync, missing FX, summary/detail rounding, large/exact ETH, settings lost updates, and full-final-page continuation.
- Capture real PostgreSQL plans and row/byte counts for transaction listing/count/search, holdings, FX, and snapshot reads. Benchmark the actual HTTP controllers and real MCP runtime/tool pipeline with database-backed services; adapt the test JWT authority/client pattern from `backend/test/mcp/mcp.runtime.spec.ts` to avoid live Auth0 or model calls.
- Use provider stubs with deterministic responses/delays for sync workloads, separate from measured database application time. Set `DISABLE_SCHEDULES=true` through the existing `backend/src/schedule-options.ts` boundary, disable external notification/log shipping, and inject test-owned provider/auth adapters. Do not contact Plaid/Alchemy/Yahoo/FX providers during comparison runs.
- Store manifests, raw samples, plans, and comparisons in `backend/docs/performance/backend-query/`, with a readable `backend/docs/backend-query-performance.md` report. Promote the audit scripts into this maintained harness rather than depending on `/tmp` or a thread artifact path.

Exit criteria:

- A fresh disposable database can reproduce the baseline from documented commands, and cleanup affects only test-owned schemas/processes.
- Baseline results and exact source identity are saved before any functional optimization. Existing tests pass except new intentionally failing correctness cases recorded as baseline failures.
- Each benchmark states whether it measures SQL, service CPU, HTTP, MCP, or provider-stub sync; no production or model-latency claims appear in local measurements.

### 2. Migrate the shared money representation end to end

Implementation tasks:

- Inventory and update `backend/src/types/MoneyWithSign.ts`, `common/balance.columns.ts`, `types/BalanceQuery.ts`, `types/TransactionAnalysis.ts`, `types/Transaction.ts`, `types/RecurringManualTransaction.ts`, investment/manual brokerage types, and all financial arithmetic consumers. Include CSV/backfill and provider ingestion paths, not only display serializers.
- Add migration(s) that widen minor-unit storage, preserve exact stored integers, validate sign/amount constraints, and migrate affected persisted money JSON. Use the existing migration runner and unique migration identities. Measure lock duration and migration runtime on the large fixture.
- Remove float conversion from `CryptoProvider.createAPIAccount`; preserve `CryptoBalanceService`'s exact decimal string through ingestion. Handle provider APIs that originate as JSON numbers explicitly at their adapter boundary without claiming to recover precision the provider never supplied.
- Update rate and monetary helpers to exact arithmetic; preserve missing-rate failures. Replace safe-integer bottlenecks in `ManualBrokerageService` with explicit exact limits while keeping holdings quantities and prices as decimals. Respect and validate the separate precision limits of position/price/value columns; widening balance integers alone does not widen every investment decimal column.
- Update `mcp-money.ts`, `mcp-schemas.ts`, `mcp.definition.ts`, portfolio/cash-flow result builders and `apps/cash-flow-model.ts` / `apps/portfolio-model.ts`. Keep HTTP/MCP units explicit and remove permissive invalid-money-to-zero fallbacks.
- Regenerate frontend clients and update `lib/format.ts`, `lib/balance-utils.ts`, investment formatters, charts, manual transaction/balance/holding editors, recurring schedules, settings previews, and SSR serialization. User input must be parsed from decimal text without a number round trip. Keep masked balances and saved drafts working.
- Prepare one coordinated contract release. Document the changed schemas and required client updates. Do not implement old numeric-money endpoints or a staged migration. Existing stored precision loss cannot be repaired by widening columns: preserve history faithfully and document that only a provider refresh can recover current source values.

Exit criteria:

- Exact round trips for USD cents, JPY, BTC satoshis, 1.000000000000000001 ETH, 10 ETH, and large permitted values pass across PostgreSQL, HTTP, MCP, frontend parsing, and form submission.
- No production arithmetic or aggregate converts canonical money to a JS number before an explicitly bounded presentation boundary. All relevant contracts agree on units and string representation.
- Migration up/data checks pass; downgrade refuses out-of-range values rather than truncating them. Restore/forward-fix procedures are documented for values that cannot fit the old schema.
- Backend/frontend typecheck, relevant tests, generated-client checks, MCP App build, and production builds pass together. Browser verification covers exact entry/display, negative/zero values, masked SSR, and ETH values above the old storage limit.

### 3. Commit complete investment snapshots and centralize holdings reads

Implementation tasks:

- Add a holdings snapshot header entity/migration and a `HoldingsQueryService` in the investment module. Backfill headers from known position dates and valid manual factual balance headers; do not invent historical empty provider snapshots from balance syncs.
- Replace MCP's per-account latest-row loop and web's separate interpretation with a batched latest-header/positions read. Use one coherent SQL snapshot for headers, positions, and required account/security metadata. Preserve explicit-date lookup and archived-account policies.
- Make `InvestmentService.upsertPlaidHoldings` and `upsertPlaidInvestmentTransactions` atomic, conflict-aware batch operations. Persist activity/detail pairs and completion metadata in the same transaction. Avoid raw provider payload hydration in read projections.
- Reuse bank-link lifecycle coordination and manual brokerage account/signature protections. Fetch remote responses before the apply transaction. Add a persisted generation/fencing check allocated before provider fetch so an older response cannot overwrite a newer completed sync; lock affected accounts consistently and reject archived/obsolete work at commit.
- Batch securities and positions with chunked statements; do not assume `Repository.save(array)` removes all per-row database work. Delete stale same-day positions only inside the successful snapshot transaction, including empty portfolios. Update existing lifecycle cleanup/deletion paths for the new headers.
- Migrate HTTP investment controllers, `ManualBrokerageService` readers, `McpReadService`, MCP resources, and `McpPortfolioVisualizationService` to the shared reader. Keep native holdings values and account valuation modes distinct.

Exit criteria:

- Real PostgreSQL tests prove rollback after injected failures, simultaneous sync idempotency, stale-generation rejection, no orphan investment activities, and correct cleanup after clear/archive/delete.
- Web and MCP show the same completed snapshot date and positions, including zero holdings. Failed syncs leave the last complete snapshot intact.
- For 1, 20, and 100 accounts, latest holdings uses at most three domain SELECT statements for account/header/positions data, excluding authentication and separately counted FX; it never performs two queries per account.
- Manual clear/refresh and MCP portfolio empty/current states pass focused browser/official-host checks.

### 4. Centralize transaction projections, indexed filtering, and pagination

Implementation tasks:

- Extract `TransactionQueryService` from the existing web/MCP builders. Support explicit list, detail, analysis-candidate, and sync-identity projections. Share user/account/date/category/pending/sign/merchant filters while retaining each endpoint's documented defaults. Never route mutation logic through a slim read projection that omits required provenance.
- Verify and backfill `activity.activityDate = COALESCE(reportingDateOverride, authorizedDate, providerDate)` for banking rows. Centralize maintenance for creation, provider modifications, pending replacement, manual edits, reporting overrides, and recurring generation. Enforce the invariant with targeted real-database tests.
- Switch filters to stored activity dates. Preserve web chronological tie behavior and stable public transaction IDs; do not assume the existing activity-ID index fully covers sorting by banking transaction ID. Add/update indexes only after before/after plans justify them; document ordering and write cost. If an index requires concurrent creation, explicitly configure the migration transaction mode instead of placing it inside the default all-migrations transaction.
- Select only fields needed by each projection. Remove unused bank-link joins and raw provider JSON from list/analysis reads. Push legacy merchant/native-amount predicates and limits to SQL. Return an exact count separately when required, rather than fetching all matching entities to count.
- Add cursor pagination to the shared list contract and move `frontend/src/lib/queries/primary.ts` and Transactions infinite scrolling to it. Preserve every existing sortable column, direction, filter, and exact total display; obtain the count on the initial query, not every continuation. Retain page-index compatibility only for callers that still need it, backed by the same reader.
- Bind/version cursors to sort/filter identity, include complete null/date/ID tie-breaks, and reject incompatible cursors clearly. Fix full-final-page lookahead. For converted-amount searches, batch conversion and cap candidates at 5,000 per call; return an advancing continuation with an explicit scan-budget reason instead of claiming an exact exhausted result.

Exit criteria:

- HTTP/MCP parity covers user isolation, reporting overrides, all filters/sorts, equal-date ties, pending rows, null categories, literal merchant matching, and decimal amount bounds.
- Real query plans use date bounds on the canonical activity path for representative date-filtered workloads; explanations accompany any remaining scans/sorts. No redundant index is added solely from its name or an ORM decorator inventory.
- Typical unfiltered cursor pages require at most two domain SELECTs, with at most one separate initial count; FX/auth are reported separately. Deep continuations contain no OFFSET. Exact final pages terminate; filtered-budget continuations advance without dropping or repeating processed candidates.
- Browser scrolling, sorting/filter resets, selected transactions, editing, totals, and stale refresh behavior pass without regressions.

### 5. Batch FX lookup and apply the agreed valuation policy

Implementation tasks:

- Extend `CurrencyExchangeService` / `CurrencyConversionService` with a typed batch resolver for unique pairs and requested dates. Normalize identity/inversion once, retrieve only the requested pair combinations, and reuse exact decimal quotes within the request.
- Load bounded in-range/prior/future data in set-based statements; future fallback is fetched only for missing coverage. Sparse date requests must not allocate every day of an arbitrarily large span. Preserve the existing prior-first/future-fallback behavior and expose its actual observation date/source rather than treating filled quotes as exact-date observations.
- Route transaction HTTP conversion, MCP list conversion, analysis, balance projection, and portfolio conversion through the resolver. Transactions use effective reporting date; balance/holdings continue using their own valuation dates. Same-currency and zero-only paths do not require unnecessary FX queries.
- Preserve a coherent rate set for each report. Keep rate loading inside the report's short read snapshot, with CPU/formatting after the database transaction is released. Never use a global user-financial result cache.

Exit criteria:

- The 100-date foreign transaction fixture drops from the baseline's per-date rate queries to at most three FX SELECTs for the whole batch; 1/10/100 dates do not increase query count within the configured batch size.
- Cross-surface historical amounts agree using transaction-date FX. Identity, inversion, missing/invalid rate, weekend gaps, early-date fallback, JPY/BTC/ETH scale, zero values, and reporting-date edits pass exact tests.
- The report separates speed measured under equivalent valuation settings from changed totals caused by the newly accepted policy. No difference is dismissed as harmless numerical drift.

### 6. Compute cash-flow reports once and make totals reconcile

Implementation tasks:

- Extract a `CashFlowQueryService` / report-context seam from `TransactionAnalysisService`: load settings, full lookaround candidates, rules, and FX once, then derive summary, audit, and category drilldown. Existing public methods become adapters to this pipeline.
- Change the cash-flow App handler in `mcp.definition.ts` to request one combined report per period. Use the same candidate/rule snapshot for totals and adjustment metadata. Retain specific-before-broad neutralization precedence, exclusion semantics, ownership, and lookaround matches across report boundaries.
- Pre-sort/index amount/currency matching buckets so each inflow does not refilter/resort all outflows. Preserve nearest-earlier matching and exact same-date/ID tie-breaking. Do not aggregate or page candidates before cancellation rules finish.
- Convert surviving transactions once using effective-date quotes; sum those exact rounded results for category and overall totals. Derive colors/counts/audit amounts consistently from the same result. A paged drilldown can then select from the evaluated result; do not truncate the total computation.
- Reuse settings/rules within a combined invocation and release SQL snapshots before CPU work. Add a no-rules/SQL aggregation fast path only if it demonstrates a measurable gain and matches row-wise rounding semantics; it is not required to satisfy this milestone.

Exit criteria:

- One period loads its candidate set and evaluates rules once; comparison evaluates exactly two periods. Summary, audit, and detail derive from the same version of the data/rules.
- Two EUR 0.01 outflows at 1.5 produce a USD 0.04 summary and USD 0.04 summed drilldown. Reconciliation holds across randomized currencies, signs, categories, and changing daily rates.
- Matching parity holds for overlapping rules, same-date duplicates, partial pools, and boundary counterparts. The 2,000-row pathological bucket improves by at least 50% median CPU on matched runs; typical reports do not incur an unexplained regression.
- Web analysis and the MCP cash-flow App display consistent amounts and truthful empty/error/adjustment states.

### 7. Batch banking sync identities and categorization rules

Implementation tasks:

- Add a batch categorization context in `TransactionCategorizationService` and load the ordered active rule set once per provider batch using the transaction's manager. Evaluate the existing pure rule engine against that immutable snapshot.
- Bulk-load existing posted/pending identities for `TransactionService.processSyncResults` using user/account/provider/kind/external identity. Deduplicate same-response identities and update the in-memory identity map as replacements occur; preserve manual category and reporting-date metadata.
- Batch inserts/updates/deletes in bounded chunks while preserving the existing bank-link cursor transaction hooks, category revision behavior, reconciliation archives, archived-account exclusions, and pending-to-posted identity merge rules.
- Emit notifications/events only after commit and once per actual change. Reuse the batch path for scheduled, webhook, and manual triggers; keep network calls outside the apply transaction.

Exit criteria:

- Five hundred eligible transactions load the rule set once; identity reads scale by configured chunks, not individual transactions. Measure actual SQL from ORM writes to verify batching.
- Failure, retry, repeated provider IDs, simultaneous triggers, pending replacement, manual metadata, rule edits, and archived identities pass PostgreSQL integration tests.
- Cursor/data commit and existing side-effect semantics remain atomic. Read workloads under concurrent sync show reduced query contention or an explicitly explained result in the benchmark report.

### 8. Reuse balance projection for history and bound response work

Implementation tasks:

- Generalize `BalanceQueryService.loadDashboardProjection` to explicit user/date/account inputs and projection modes. Retain shared snapshot cursors, historical FX validation, archived account semantics, liabilities, missing-data behavior, and true sync timestamps.
- Adapt `BalanceHistorySurfaceService.getBalanceHistorySummary` to derive first/last account summaries and daily net-worth values without retaining a daily account-object matrix. Explicit full-detail legacy reads may materialize rows from the same projection; they must not carry a second calculation implementation.
- Add `resolution: daily | compact` and `maxPoints` to history contracts. Default remains daily. Compact mode defaults to 240 points, preserves endpoints and material extrema deterministically, returns sampling metadata, and always computes totals/change from exact requested boundaries. Requests below the point budget return every point. Require 4–1,000 for a requested compact budget.
- Start interactive work limits at 10,000 returned daily points and 1,000,000 projected account-days per call, validated before allocating the matrix/series. Reject excessive requests with an actionable supported-range/resolution message; compact mode is not allowed to hide an exceeded computation budget. Record any benchmark-justified limit adjustment explicitly in the results and contract docs.
- Update MCP descriptions/examples to request compact output for chart/trend questions and daily output for exact-date work. Preserve exact structured/text money values and complete account summaries regardless of chart resolution.

Exit criteria:

- Daily history matches the normalized baseline exactly, except documented money representation fixes. Home retains existing point selection and total behavior.
- Ten-year 20/100-account history does not retain a full per-account daily matrix when a summary/series was requested. Daily and compact CPU/memory/payload measurements are published separately.
- Compact output obeys its budget and reports sampling; endpoints/extrema and exact totals pass tests. Oversized/invalid date work fails before heavy allocation, with no silent financial truncation.

### 9. Make settings atomic and remove avoidable auth overhead

Implementation tasks:

- Update `UserService.updateSettings` and default-notification initialization to read/merge/write under a row lock or apply equivalent atomic nested patches. Emit settings events from committed before/after values. Apply the same treatment to `updateProviderDetails` if concurrent provider patches can overwrite unrelated keys.
- Reuse narrow user/settings projections within each financial invocation. Do not share OAuth identity/financial data across users or cache revocation decisions.
- Benchmark `PersonalAccessTokenService.validateToken`, then replace full token/user hydration with a narrow joined validation query. Coalesce `lastUsedAt` writes to at most once per token per 60 seconds using a conditional update. A skipped usage write is not an authentication failure; revoked/expired/deleted-user tokens still fail authoritative validation, including races already protected by the current flow.
- Keep the standalone Auth0 MCP benchmark separate from PAT HTTP authentication. Measure identity resolution once per tool invocation and reuse it only within that invocation.
- Add sanitized query/SQL/serialization counters and timings at the shared read/transport boundaries, with request-local collection. Do not log financial values, raw SQL parameters, tokens, or provider payloads. Record pool wait/queueing and errors under concurrency before changing pool sizes/timeouts.

Exit criteria:

- Real simultaneous settings patches preserve disjoint keys and nested notification changes; emitted events describe committed changes. Provider/default initialization cannot revert another patch.
- PAT repeated requests have at most one usage write per 60-second window, remain correctly authenticated, and reject revocation/expiry races without an authorization cache. No Auth0 latency improvement is falsely credited to PAT work.
- Instrumentation can attribute time and query counts without logging business values, and its measured overhead is included in both benchmark variants.

### 10. Run the matched comparison and complete caller/contract verification

Implementation tasks:

- Recreate both baseline and final schemas from the same seed and replay the same workloads. Apply final migrations only to the final copy. Compare with the frozen baseline implementation, not a partially optimized intermediate revision.
- Run the focused matrix below, retain raw samples, and publish readable before/after tables for the measured shared services, HTTP/MCP paths and representative sync operations. Include SQL count/time, returned rows, DB-to-app bytes where measurable, CPU/mapping/serialization, RSS/heap/event-loop delay, JSON/gzip bytes, throughput and errors. Publish p50/p95 with repeated-run spread for the completed rigorous 10k matrix; label reduced-sample timings diagnostic and do not present their p95 as reliable tail estimates. State unavailable metrics rather than estimating them as measurements.
- Separate equivalent-output, intentional FX/rounding corrections, exact-money representation, and compact-history comparisons. Use a semantic normalizer that preserves units and exact values; whitelist named expected corrections only. Never remove financial differences to force parity.
- Regenerate API bindings, run full impacted checks, and use `$agent-browser` plus the documented official MCP App host to validate browser-observable changes. Read each skill at execution time. Run agent-browser outside the sandbox and close only task-owned sessions/processes.
- Finish developer documentation describing shared query entry points, projection selection, ownership/transaction requirements, conversion rules, cursor/work budgets, exact money, and benchmark commands. Update `docs/mcp.md` for changed tool contracts and existing consumers. Mark this plan Done only after all exit criteria pass.
- Prepare migration/release notes for one coordinated backend/frontend/MCP release. Use the existing protected main→deploy workflow if deployment is subsequently requested; the earlier deployment task for SSR is independent. Before live stack work, read `/Users/jtkw/projects/stack/AGENTS.md` and its deployment gates. Do not turn this planning request into a live deployment.

Exit criteria:

- Every audited finding maps to an implemented fix, a direct regression test, and the relevant benchmark/verification result. Existing callers use the shared path rather than retaining parallel implementations.
- Deterministic query/shape budgets pass. Assess the original 30% median/p95 FX/holdings/cash-flow and 50% matching-CPU targets using the completed rigorous 10k matrix. Use short 100k/1m checks to inspect scaling and query work, without claiming full tail characterization. Profile material target misses and address avoidable work, then report the actual gain and any correctness-driven cost. These are optimization targets, not a reason to weaken financial correctness.
- No material unexplained regression: investigate median/p95 increases exceeding both 10% and 5 ms in the rigorous matched matrix; diagnose substantial slowdowns in short checks without over-interpreting noisy small samples. Full daily history does not grow a daily account matrix; compact chart bytes drop by at least 80% in the ten-year fixture.
- Migration, frontend, HTTP, MCP, sync concurrency, financial parity/corrections, and browser checks pass. The final report explicitly distinguishes web-only, MCP-only, shared, and indirect sync benefits.

## Benchmark Matrix

Use the same PostgreSQL version, production builds, fixed UTC clock (`2026-09-05T12:00:00Z`), seeded currencies/accounts/rules, connection pool, machine, and logging configuration for both variants. Seed separate user scopes and unrelated rows so indexing/ownership cases are meaningful. Keep credentials in the invoking process only.

### Focused completion protocol

The user requested shorter benchmarks after the paired 10k main matrix had completed. Preserve the original workload inventory below as a reproducible extended suite, but do not run its unfinished 100-call × three-process matrix to satisfy this task. Stop the old continuation queue and retain partial captures as incomplete evidence.

| Required focused evidence                                                                      | Sampling and interpretation                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Completed 10k main matrix, 35 scenarios                                                        | Retain five warmups and 100 measured calls in three independent processes per variant. This is the primary latency/p95 evidence; the two original amount-sort failures remain correctness cases.                                                                                                 |
| Scale checks at 100k and 1m rows                                                               | Reuse completed original captures and collect short final captures of the same workloads. Report sample counts and any warmup differences explicitly; compare economic output, ordered results, query budgets and representative plans. Treat timing as diagnostic.                              |
| Representative sync, filter, cash-flow/portfolio/history shapes and rare/no-match MCP searches | Use one process per variant with one warmup and approximately three measured calls where practical. Include a 5,000-row banking/investment case, compact output and exact-result/continuation checks. Existing PostgreSQL tests and saved paired smoke provide the broader correctness coverage. |
| PAT validation and parallel settings patches                                                   | Short paired samples with physical usage-write and persisted settings assertions. Keep PAT separate from Auth0 MCP.                                                                                                                                                                              |
| Concurrent reads with and without sync                                                         | One 30-second phase per selected transport/concurrency case, covering PAT HTTP and Auth0 MCP at low/high concurrency. Report throughput, errors, pool wait and observed latency; no repeated-run confidence claim.                                                                               |
| Isolated daily/compact history memory                                                          | Fresh processes for representative long-history shapes, with short repeated calls and the same RSS sampler. Publish sampled peak memory, CPU and exact payload counts separately from the rigorous latency table.                                                                                |

The maintained focused runner/report must enumerate exactly which cases were executed, preserve provenance and financial comparisons, and identify which exhaustive repeats were intentionally omitted. Broad correctness tests, migration/recovery evidence, production-browser checks and final independent review are unchanged.

### Extended workload inventory

| Workload                   | Required shapes                                                                                                                                                               | Before/after question                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Transaction lists/search   | 10k/100k/1m total rows across users; target users with 1k/10k/100k rows; first and deep pages; each current sort; date/account/category/merchant filters; large provider JSON | Do date indexes, slim projections, keyset continuation, and count separation reduce work while preserving selection/order? |
| MCP transaction conversion | 100 returned foreign rows on 1/10/100 dates; 1/3 currencies; no-match/rare converted-amount filters over 100k candidate rows                                                  | Does FX query count stay bounded, and does expensive filtered search return truthful advancing continuation?               |
| Holdings/portfolio         | 1/20/100 accounts; 0/10/100 positions each; empty latest versus older nonempty snapshot; mixed currency and snapshot dates                                                    | Does batching remove account fanout, and do HTTP/MCP report the same complete snapshot?                                    |
| Cash flow                  | Month/year ranges; rules off/on; lookaround boundaries; comparison periods; 500/1k/2k equal-amount matching rows                                                              | Are candidates/rules evaluated once per period, matching scalable, and summary/drilldown exact?                            |
| Balance history            | 20/100 accounts; 1 month/1 year/10 years; sparse/dense snapshots; missing/fallback rates; daily and compact separately                                                        | Is the matrix gone, are exact history results preserved, and what is the explicit payload/resolution tradeoff?             |
| Provider sync              | 50/500/5k added/modified rows; rules on/off; duplicates/pending replacements; investment empty/full/partial-failure batches                                                   | Do reads/writes scale by batches, commits stay atomic, and retry/overlap semantics hold?                                   |
| Mixed load/auth/settings   | Read concurrency 1/5/10 with and without sync; standalone Auth0 MCP and PAT HTTP separately; parallel settings patches                                                        | Do latency tails/pool waits improve without weakening consistency or authentication?                                       |

Common measurement rules:

- Keep SQL/service-only and end-to-end HTTP/MCP measurements separate. Auth0 tests use the local test authority; benchmark initialization/handshake separately from repeated tool invocations. No LLM inference, internet latency, or provider network time is included in backend gains.
- Use the focused completion protocol above. The completed rigorous matrix retains five warmups, 100 measured calls and three independent processes. New shorter samples establish diagnostic scaling/work measurements only; do not imply equally strong percentile evidence. Selected concurrency phases still run at least 30 seconds and report throughput/error rate.
- Label process-cold, database-warm, and repeated-request results truthfully. Do not claim a cold PostgreSQL cache without a dedicated disposable instance reset. Do not flush shared host caches or kill the user's dev servers.
- Reset mutable fixtures before each sync/settings repetition. Capture peak process memory in isolated processes; avoid comparing lifetime RSS maxima from unrelated workloads. Measure database statement counts including ORM hydration/count queries, separately from BEGIN/COMMIT and auth.
- Capture `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for representative SELECTs and disposable sync operations; report index conditions, actual versus estimated rows, sorts, and buffers. An index name appearing in a plan alone is not proof of improvement.
- Financial fixtures that expose baseline bugs are expected to differ: retain baseline failure evidence and assert the specified corrected result. Also keep an equivalent-policy benchmark lane for clean speed comparisons.

## Tests

### Backend

- Extend existing transaction/service/controller/surface, currency, balance/history/dashboard, investment/manual brokerage, categorization, bank-link, recurring, user/settings, money/crypto, auth/PAT, MCP runtime/schema/money/App tests.
- Add shared-query PostgreSQL parity tests with two owners, same-date ordering, reporting-date write consistency, duplicate identities, sparse FX boundaries, exact decimal scale, and cross-surface behavior.
- Add real transaction/concurrency failure tests for complete snapshots, stale sync generations, orphan prevention, settings patches, rule-snapshot application, and PAT revocation/usage-write races. Do not rely only on repository mocks for these claims.
- Run new migrations against a baseline schema/seed, including persisted JSON contracts, missing legacy headers, numeric limits, and downgrade refusal. Use only the dedicated benchmark/test database.
- Add query-count and work-budget regression assertions at shared boundaries; avoid tests that merely assert implementation strings or index names.

### Frontend

- Update formatting/parsing/balance utility tests for exact strings and unit parity; cover decimal text inputs, zero/negative values, JPY/BTC/ETH, large values, and invalid input without silent coercion.
- Update Transactions infinite-query tests for cursor advancement, filters/sorts/reset, counts, edits/selection, terminal pages, and retry. Preserve query invalidation and 30-second session-scoped reuse tests.
- Update Home/Analysis/AccountModal/holdings/manual transaction/recurring/Settings tests for changed contracts and correct zero/empty/rounding behavior. Regenerate rather than hand-edit API models.
- Use `$agent-browser` for desktop/phone exact entry/display, deep scrolling and sorting, cash-flow drilldown reconciliation, cleared holdings, concurrent settings tabs, masked SSR, and loading/error recovery. Reuse local auth bypass and isolated seeded identities.
- Use the documented official MCP App test host for both App result schemas, empty/error/current-result lifecycle, dark/light phone rendering, and exact total/tooltip formatting. This is a data/contract refactor, not an App redesign; no concept-generation step is needed.

## Validation Commands

Run from the owning app directory using Yarn. The benchmark scripts/config below are deliverables of milestone 1; the URL must be provided in the process environment and is never checked into examples or artifacts with credentials.

Backend:

```bash
yarn test test/transaction test/transaction-analysis test/currency-exchange test/balance-query test/investment test/transaction-categorization test/bank-link test/recurring-manual-transaction test/user test/auth test/crypto test/types test/migrations --runInBand
yarn test --config test/jest-performance-postgres.json --runInBand
yarn test:mcp-apps
yarn test test/mcp --runInBand
yarn lint
yarn typecheck
yarn build
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts capture --variant before
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts capture --variant after
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts compare --suite main --rows 10000
node test/performance/focused-runner.cjs
```

Run the `before` command against the frozen baseline with the maintained common benchmark harness, and `after` against the final implementation, each using its own disposable schema. Capture baseline before functional changes, not after the final build shown in this command inventory. For the focused runner, set `BENCHMARK_BASELINE_SOURCE_ROOT` and `BENCHMARK_FINAL_SOURCE_ROOT` to the approved compiled source directories and provide the guarded database URL in the invoking process. It reuses completed approved scale/supplemental captures and performs the focused comparison at the end. The rigorous comparison and focused comparator must fail on missing required cases, mismatched fixture/environment inputs, unexpected financial differences, or violated deterministic budgets. Baseline/final source and migration identities are expected to differ and must be recorded, not mistaken for invalid comparison inputs. The unqualified full-matrix `compare` remains available for an optional exhaustive run; its intentionally missing captures are not a completion gate for this shortened task.

Frontend:

```bash
yarn orval
yarn test
yarn lint
yarn typecheck
yarn build
```

Implementation update: the dashboard parity suite now uses the shared `isolatedPostgres` helper and `BACKEND_BENCHMARK_DATABASE_URL` guard, alongside the other PostgreSQL suites. Its dedicated `test/jest-dashboard-postgres.json` config still supports a targeted run; the full backend run includes it with the shared variable set. The former `DASHBOARD_TEST_DATABASE_URL` / `splice_dashboard_test` setup remains relevant only to the frozen pre-refactor source. Never run schema-mutating e2e suites against a default `.env` database by accident. For `gh` operations, request sandbox escalation as required by the user's repository instructions.

## Overall Exit Criteria

- Shared transaction, FX, holdings, cash-flow, and balance projection paths are used by all identified HTTP/MCP callers and documented for future features.
- Exact monetary persistence and contracts support ordinary and precise ETH balances; HTTP minor units and MCP major units are unambiguous. All affected frontend/App callers are updated for one coordinated contract change.
- Effective-date FX is consistent across transaction/spending views; every report reconciles exactly to its corresponding rounded rows, with preserved rule semantics and clear rate provenance.
- Completed empty holdings snapshots stay empty in web/MCP; sync failures and stale generations cannot publish partial or obsolete portfolios. Banking cursor/reconciliation/manual-metadata guarantees remain intact under batching.
- Settings patches do not lose unrelated edits; authentication still enforces expiry/revocation while reducing measured overhead.
- Query counts, bounded work/output, real PostgreSQL plans, transport timings, CPU/memory, and payload comparisons are saved with reproducible baseline/final identities. Expected corrections and compact-output tradeoffs are explicitly separated from equivalent-result speedups.
- All milestone exit criteria and required tests/builds/browser checks pass. No claimed production gains are inferred solely from local measurements. No staged compatibility rollout is introduced.

## Risks And Resolved Questions

- **Resolved by user:** transaction-date FX consistency; exact string money contract changes; no staged rollout.
- **Engineering choices recorded here:** row-wise half-up conversion then exact summation; daily history default plus explicit compact sampling; initial query/output budgets; one-minute PAT usage-write coalescing with authoritative auth checks.
- **Migration risk:** widening storage does not recover previously rounded crypto history, and values above the old integer limit prevent a lossless schema downgrade. Validate copy/restore and forward-fix paths before release; never promise a reversible cast of arbitrary new balances.
- **Baseline risk:** previous SSR/performance changes are still present in the working tree and have an independent deployment task. Freeze the actual input tree and do not overwrite or wait on that task to perform local benchmarks.
- **Correctness risk:** shared builders must not erase different pending/archive/account-mode semantics. Put these choices in typed options and caller parity tests rather than implicit endpoint-specific branches.
- **Measurement risk:** wider exact strings and decimal arithmetic may add work in isolated cases. Measure this honestly alongside the larger I/O reductions; prioritize correctness and resolve material missed budgets explicitly rather than weakening the contract to meet a headline number.
- **Operational unknowns:** production cardinality, query plans, and migration lock duration remain unmeasured. Resolve locally first through milestone 1 and migration tests; any subsequent production validation follows the stack repository and existing deployment workflow. No material product decision remains open for starting implementation.
