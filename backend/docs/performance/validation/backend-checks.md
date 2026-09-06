# Backend query validation

Validation was run against the complete working tree, preserving the previous SSR changes. PostgreSQL tests used only randomly named schemas in the dedicated loopback `splice_backend_benchmark` database, with real migrations and synthetic identities.

Final source verification compared all 749 files under `backend/src` and `frontend/src` byte for byte against `/tmp/splice-backend-final-20260905-224946`: no differences. Later benchmark-orchestration and reporting edits do not change the measured application implementation. Its durable archive and manifests are linked from the benchmark report.

- `yarn test --runInBand`: **109 suites, 1,148 tests passed** (17.42 seconds, 2026-09-05). Includes all relevant service/controller/surface, migration, money, sync, HTTP, MCP runtime/App, benchmark regression and real PostgreSQL suites.
- `yarn test --config test/jest-performance-postgres.json --runInBand`: **3 suites, 14 tests passed** under the dedicated harness configuration.
- After the benchmark protocol/reporting changes, the targeted safety/comparator/provenance command passed **3 suites, 16 tests**. All 22 maintained CJS files passed syntax checks; focused lint and reporting/orchestration formatting passed. [The final harness check summary](../backend-query/focused/checks.json) records the exact commands.
- `yarn lint`: passed.
- `yarn typecheck`: passed.
- `yarn build`: passed, including regenerated MCP App runtime and Nest production output.
- Final Orval generation from the 15-controller OpenAPI export passed; frontend typecheck passed afterward. The final regeneration changed only rate-schema documentation.

The full-suite command was launched by a secret-safe local environment bridge. It sets `BACKEND_BENCHMARK_DATABASE_URL` to the dedicated database and disables schedules. The dashboard PostgreSQL suite now uses the same shared guarded fixture helper, so it runs under this variable too. Its credentials are never stored in reports. The maintained tests enforce database-name/loopback/schema ownership guards.

## Direct concurrency and migration evidence

- Banking sync: 14 PostgreSQL cases cover chunked 5,000-row writes, single rule snapshot, duplicate/retry/pending replacement, manual metadata, archive/cursor rollback, simultaneous triggers and committed events.
- Holdings: 12 PostgreSQL cases cover complete/empty headers, same-day replacement, injected failure, stale generations, activity/detail atomicity and manual inverse FX ties.
- HTTP transactions: page inputs/counts/settings/FX share one snapshot; writer races preserve a coherent version and conversion occurs after release.
- MCP transactions and portfolio: a concurrent amount/holding and quote update cannot mix versions; filtered candidate batches use one quote snapshot; unused lookahead does not require a missing rate.
- Balance/history/Home: daily and boundary inputs/FX share a snapshot and iteration starts after release. Request-local reuse preserves changing quote ratios and daily provenance.
- Cash flow: rows, rules, settings and quotes share one snapshot. Summary/drilldown totals sum the same once-rounded integers; excluded rows do not require unused FX.
- Settings and PAT: simultaneous disjoint/nested settings updates survive; authoritative token checks reject expiry/revocation/deleted-user races and coalesce usage writes.
- Exact-money migration: four PostgreSQL cases cover 78-digit limits, normalized account/recommendation JSON, reconciliation archives and refusal of lossy rollback. [Three million-row migration measurements](../migrations/backend-query-2026-09-05.json) also completed.

The saved projection CPU probes compare an intermediate exact-money implementation before request-local reuse with the final projection; they do **not** compare the original application with the final application. In seven CPU-only diagnostic samples, median wall time for a 366-day projection fell from 20.40 to 12.51 ms for 20 accounts and from 88.75 to 48.64 ms for 100 accounts, with identical exact-output digests. [The intermediate probe](splice-balance-cpu-before.json) and [the final probe](splice-balance-cpu-after-rr.json) document the avoided repeated conversion work. Database staging, transport and stable-tail claims require the separate paired benchmark evidence.

Four read-only application implementation review passes were completed. A fifth pass reviewed benchmark protocol and coverage; its added probes and production-instrumented smoke passed. A sixth read-only pass cleared all seven protocol findings. The user subsequently requested shorter benchmarks: the completed 35-scenario 10k matrix retains 100 calls and three independent paired runs, while larger and supplemental checks use a focused diagnostic protocol. A seventh read-only review confirmed that this shorter protocol preserves financial/order/query-budget/provenance checks and labels its reduced samples accurately. Findings were fixed and regression-tested, including exact inverse rounding, missing-rate zero paths, cursor scope and snapshot consistency. Production browser and official MCP App cases are complete. The eighth independent review checked all 158 verified criteria and completed evidence and concluded **No major issues remain.** See [final review](final-review.md). Unfinished exhaustive repeats were intentionally omitted under the user-approved scope.

See [frontend/browser/MCP App evidence](frontend-and-mcp-apps.md), [shared entry points](../../shared-query-services.md), and [benchmark protocol/results](../../backend-query-performance.md).

The additional [paired instrumented smoke](../backend-query/final-instrumented-smoke/) reproduced original duplicate-response unique violations and late pending resurrection. The final implementation retained one posted row with its reporting-date override. Actual history requests with missing required CHF/USD quotes failed explicitly in both versions. These are correctness observations, not repeated latency measurements.
