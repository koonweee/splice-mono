# Shared backend query performance

The first complete paired dataset shows substantial gains in the shared FX,
holdings and cash-flow paths, including the real MCP transport. At the user's
request, the remaining validation uses the shorter focused set described below;
the original full matrix remains available as an optional reproduction.
That focused set is now complete: [read the detailed results](performance/backend-query/focused/comparison.md)
or inspect [the raw comparison](performance/backend-query/focused/comparison.json).
The maintained harness measures real PostgreSQL and the actual compiled service,
HTTP controller, PAT guard, and MCP runtime. Database repositories are not mocked.
The separate correctness probes intentionally expose bugs in the original code.

## Who benefits

| Scope                  | Improvement                                                                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared web + MCP       | Transaction projections, batched FX and holdings, reused cash-flow evaluation, streamed history, exact money and coherent financial snapshots. Future callers can reuse these domain entry points. |
| Web-specific adoption  | The Transactions screen uses count-free cursor continuation; exact-money forms, formatting and generated HTTP bindings use the coordinated string contract.                                        |
| MCP-specific behavior  | Converted-amount searches expose bounded continuation, holdings include authoritative empty-snapshot metadata, and the cash-flow App reuses one evaluated report per period.                       |
| HTTP token clients     | PAT validation avoids repeated usage writes. This does not apply to browser cookie authentication or the standalone Auth0 MCP listener.                                                            |
| Indirect sync benefits | Batched atomic application of provider results uses fewer queries and writes, leaving more capacity for reads. Mixed-load evidence measures that interaction; provider network time is excluded.   |

## Verified 10k dataset

[The complete 10k comparison](performance/backend-query/comparison-10000.md)
contains 35 scenarios across three independent processes per variant, with five
warmups and 100 measured calls for each successful latency case. The two original
amount-sort failures are recorded as correctness cases; their replacements pass
an independently ordered SQL page oracle. All economic-output, provenance and
query-budget checks pass. No scenario exceeds the material-regression threshold
in any paired run. The main transaction table has 10,000 rows, including 1,000
for the target owner, alongside the separately seeded FX, holdings and history
fixtures described below.

| Workload                                                  | Median before → after | p95 before → after | SELECTs before → after |
| --------------------------------------------------------- | --------------------: | -----------------: | ---------------------: |
| Shared holdings, 100 accounts × 100 positions             |      540.9 → 174.2 ms |   608.5 → 182.4 ms |                302 → 3 |
| Shared FX page, 100 dates / 3 currencies                  |         44.9 → 7.9 ms |     52.8 → 13.3 ms |                302 → 2 |
| Cash-flow year, combined summary and audit                |        74.1 → 30.5 ms |     79.7 → 32.7 ms |                 10 → 4 |
| Daily history, 100 accounts / 10 years                    |      297.4 → 183.2 ms |   330.2 → 195.9 ms |                  5 → 5 |
| MCP FX page, actual client completion                     |        49.9 → 15.1 ms |     54.3 → 17.6 ms |                303 → 3 |
| MCP holdings, 20 accounts, actual client completion       |       167.0 → 57.4 ms |    185.5 → 63.3 ms |                 63 → 4 |
| MCP cash-flow comparison App, actual client completion    |        36.4 → 19.5 ms |     41.3 → 24.1 ms |                 21 → 9 |
| PAT HTTP transaction conversion, actual client completion |        12.4 → 10.3 ms |     19.7 → 16.5 ms |                  9 → 5 |

These are medians of the three process-level percentiles, with full spread and
raw samples retained in [the machine-readable comparison](performance/backend-query/comparison-10000.json).
Transport rows subtract the separately timed final harness reserialization from
each sample before computing client-completion percentiles. Service rows include
result serialization. All figures are instrumented local, database-warm timings;
they include neither internet/provider latency nor model inference.

The constructed 2,000-row equal-amount matching case reduces median CPU from
260.32 ms to 0.404 ms while preserving the exact selected IDs. This is a deliberately
adversarial algorithm fixture, not an expected speedup for every cash-flow request.
The small MCP monthly-history case stays broadly unchanged (client median
10.59 → 10.10 ms), as does its six-SELECT count. Extra exact-money strings and FX
observation metadata slightly increase several response payloads even when the
database projection becomes much smaller; this is reported separately from latency.

The retained plans show less work reaching JavaScript, rather than a universal
removal of SQL scans. In the 10k search fixture, the original hydrates 1,550 rows
and transfers 8.57 MB of serialized database results to return 20 matches. The
new path returns 20 projected rows plus an exact count, totaling 46.3 kB; service
median falls from 32.64 to 5.60 ms despite adding a second SELECT. The new first
date page reads about 54 ordered activity rows to return 51 candidates using the
account/date index, while its separate exact-count query still scans matching
rows. The 100-account holdings header query sorts 12,200 small historical headers
to select 100 completed snapshots, then reads the 10,000 requested positions in
one batch. Its gain comes from removing repeated queries and fat hydration, not
from pretending the historical-header scan disappeared. These representative
plans are database-warm (zero shared blocks read from disk); per-node row estimates,
actual rows, loops, sorts and buffer hits are retained in each raw capture.

## Focused results and limits

The completed shortened set adds 130 diagnostic scenario pairs and eight paired
30-second mixed-load phases. All source/build/observer checks, exact financial
comparisons, page/continuation oracles, persisted-write checks and deterministic
query budgets pass. The original full matrix is explicitly marked incomplete;
the user's shortened acceptance set is complete.

| Completed evidence                               | Sampling                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 35 main shapes at 10k rows                       | Five warmups, 100 successful calls, three processes per variant; two named original amount-sort failures |
| 35 main shapes at both 100k and 1m rows          | Completed original 100-call captures versus final one-warmup/three-call checks                           |
| 56 shape/filter/auth/extended/sync cases         | One warmup and three calls in one process per variant; category filters use 100k rows                    |
| Four daily/compact history memory shapes         | Fresh isolated process per shape and variant, one warmup and three calls                                 |
| HTTP/MCP concurrency 1 and 10, with/without sync | One 30-second phase per shape and variant                                                                |
| Sparse foreign-history follow-up                 | Five warmups and 20 calls in one process per variant                                                     |

The shortened run intentionally omits the remaining full 1m original repeats,
100-call final scale/supplemental repeats, supplemental category filters at
10k/1m, concurrency 5, and repeated mixed/memory processes. Existing source archives,
schema parity, actual write plans, migration runtime/lock evidence and correctness
proofs remain retained. Harness syntax, focused lint and all 16 guard/comparator/
provenance tests pass. The exact harness at capture completion is archived under
`focused/protocol-source/`; subsequent formatting affects reporting/orchestration
only, preserving every measured workload/observer profile.

The short scale checks are consistent with the stronger 10k gains: at 1m total
rows, observed search median falls from 2,338 to 107 ms and yearly cash-flow
summary/audit from 5,126 to 1,238 ms. For 5,000 modified banking rows, the observed
median falls from 13,375 to 942 ms, SELECTs from 25,000 to 22, and writes from
10,000 to 40. Investment application falls from 17,586 to 614 ms, with 10,000 → 20
SELECTs and 10,000 → 36 writes. Added banking batches of 5,000 originally failed
the bind-parameter limit; the final batch succeeds in about 648 ms with rules off
and 721 ms with rules on. These are diagnostic medians from three final calls,
not p95 improvement claims.

Large converted-amount searches change the work contract. The original no-match
call scans 95,000 eligible rows in about 28 seconds using 761 SELECTs. The final
call fetches 5,001 candidates in one SELECT and returns an advancing continuation
in about 73 ms. All 19 continuations are verified against the complete independent
SQL result, including zero no-match results and ten rare matches. The first
response is bounded; 73 ms is not a measurement of the complete multi-call scan.

For ten-year charts, both 20- and 100-account fixtures retain 62 of 3,651 original
points within the explicit 122-point budget, preserving requested endpoints,
selected source values, account summaries and exact totals. Chart JSON drops
192,425 → 3,349 bytes and 196,076 → 3,411 bytes respectively: **98.3% less chart
data**. The 100-account whole response drops 241,896 → 49,533 bytes (79.5%), since
complete account summaries remain. In the isolated three-call memory checks,
100-account daily peak sampled RSS drops 942 → 413 MB and compact peak 913 → 412 MB.
Those are single-process observed peaks, including the common observer/worker,
not a production-memory forecast.

Mixed-load gains also have limits. At HTTP concurrency 10 with sync, read
throughput rises 229 → 250 requests/s while observed p95 stays about 52.5 ms;
completed 50-row sync batches rise 1.10 → 32.11/s. The corresponding MCP phase
rises 39.21 → 144.86 requests/s while sync batches rise 2.62 → 17.75/s and median
latency falls 250 → 66.95 ms. MCP event-loop p95 rises 11.95 → 18.94 ms as more work
completes. All phases have zero errors. This is a saturated writer, so the two
variants process different write rates; neither uniformly better tails nor a
matched offered-write-rate comparison is claimed.

All six diagnostic regression flags were reviewed:

- **Three retained deep-offset adapters regress at 1m rows.** At offset 99,900,
  date sorting rises 121.8 → 157.3 ms, merchant sorting 138.1 → 183.2 ms and pending
  sorting 129.7 → 195.7 ms. The old ID-first page sorts narrow 44–55-byte rows in
  memory, then hydrates 50 results. The shared projection sorts roughly 841-byte
  rows before the offset and spills about 2,743 temporary blocks. This remains a
  limitation of the compatibility offset path. The adopted count-free cursor
  equivalents preserve the same ordered page and take 17.0, 80.2 and 67.5 ms,
  respectively, with one SELECT and no OFFSET/count/spill. Merchant/pending
  cursors still inspect many account rows; they are not constant-work queries.
- **Sparse daily foreign history for 20 accounts has a correctness cost.** The
  three-call median rises 12.04 → 19.10 ms. A separate five-warmup/20-call check
  confirms a persistent but variable increase: 13.52 → 25.01 ms, with final calls
  ranging 17.00–91.27 ms. CPU rises 12.43 → 16.64 ms and SELECT/CTE elapsed
  6.05 → 20.00 ms. The new resolver provides a quote result for each requested
  historical day inside the coherent read, increasing rows from 314 to 667 while
  reducing SELECTs from eight to six. Existing request-local reuse already removes
  repeated exact conversion work; its intermediate profiling is not an
  original/final speed claim. [The follow-up evidence](performance/backend-query/focused/regression-sparse-fx/diagnosis.json)
  retains the remaining cost and variation.
- **Publishing an empty provider portfolio adds about 5 ms.** The original
  delete-only apply takes 0.42 ms; the final fenced, owned transaction and explicit
  completed-empty header take 5.58 ms. This prevents a cleared portfolio from
  falling back to stale positions and is an intentional correctness cost.
- **One three-call daily-history tail is inconclusive.** The 1m-fixture
  20-account yearly median improves 9.95 → 8.99 ms, but its first final call takes
  24.35 ms, followed by 8.99 and 7.85 ms with similar SQL time. This short sample
  does not establish a persistent tail regression. The repeated 10k fixture,
  which has the same history inputs, improves both median and p95.

## Reproduction

The user-approved focused set preserves the completed 10k matrix's three-process,
100-call evidence. It adds final 100k/1m main checks against completed original
captures; paired shape, 100k category/filter, auth/settings, extended and sync
checks; and isolated daily/compact memory checks. These new normal cases use one
warmup and three measured calls in one process. All selected 100k-candidate scan
continuations still pass the complete independent SQL oracle. Mixed load uses
concurrency 1 and 10, with/without saturated sync, for 30 seconds each, for both
PAT HTTP and Auth0 MCP. Missing concurrency 5, extra process repeats and the
long original 100-call write runs are intentional scope reductions.

Set `BENCHMARK_BASELINE_SOURCE_ROOT` and `BENCHMARK_FINAL_SOURCE_ROOT` to the
approved frozen backend directories, plus the guarded database URL described
below, then run:

```bash
yarn node test/performance/focused-runner.cjs
```

The focused runner saves raw results and progress under `performance/backend-query/focused/`.
It retains strict source/build/harness identities, economic-output comparisons,
query budgets, persisted-write validation, edge-case correctness and migration-derived
fixture checks. Its short samples are diagnostic: do not make p95 improvement or
stable-tail claims from them. The cancelled second original 1m capture remains
under `interrupted-shortened-scope/` and is excluded from every comparison.

The commands below reproduce the original, longer protocol if stronger confidence
is later needed across every shape; they are no longer the completion requirement
for this user-approved run.

Use Node 24 or later, Yarn, and a disposable local PostgreSQL database named
`splice_backend_benchmark`. Supply `BACKEND_BENCHMARK_DATABASE_URL` in the invoking
process environment. The runner refuses another database name, a non-loopback
host, or a non-PostgreSQL URL. It creates and drops only a uniquely named schema;
it never synchronizes or truncates an application's schema.

The original source is retained in
[the source archive](performance/backend-query/baseline-source.tar.gz),
with [the complete input manifest](performance/backend-query/baseline-source-manifest.json)
and [the exact archive subset](performance/backend-query/baseline-archive-manifest.json).
The archive contains application source, tests, scripts, lockfiles and build configuration;
it excludes environment credentials, node_modules, build output, temporary artifacts and screenshots.
Its source includes the earlier dashboard/SSR work present at baseline capture,
not merely Git HEAD. Extract it into a temporary directory and install its locked
dependencies (or use the existing matching node_modules).
The final application is retained in [the final source archive](performance/backend-query/final-source.tar.gz)
with its [input manifest](performance/backend-query/final-source-manifest.json) and
[archive subset](performance/backend-query/final-archive-manifest.json).
Always use the maintained harness from the final repository for both applications;
any earlier benchmark helpers included incidentally in a source snapshot are not
the approved measurement harness. The provenance approval records the measured
harness fingerprints separately from these application snapshots.

Compile the selected backend independently of the harness:

```bash
yarn tsc -p tsconfig.build.json --outDir .benchmark-build --incremental false
```

Run the common harness from the working backend directory, pointing
`BENCHMARK_SOURCE_ROOT` at the selected backend directory, not its build output:

```bash
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts capture --variant before --rows 10000 --samples 100 --warmups 5 --run 1 --full
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts capture --variant after --rows 10000 --samples 100 --warmups 5 --run 1 --full
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts compare
```

Repeat each capture in three independent processes (`--run 1`, `2`, `3`) for
`--rows 10000`, `100000`, and `1000000`. Each fixture gives the target user one
tenth of the main transaction rows and another owner the remaining rows.
`--filter` selects a scenario-name substring. `--no-transports` selects service
work only. `--output` isolates a supplemental suite's reports from the main
comparison matrix. Never compare exploratory one-sample reports as p95 evidence.
The maintained matrix runner automates those independent processes:

```bash
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts matrix --variant before --suite main --resume
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts matrix --variant before --suite extended --resume
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts matrix --variant before --suite shape --resume
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts matrix --variant before --suite filters --resume
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts matrix --variant before --suite auth-settings --resume
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts matrix --variant before --suite sync --resume
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts matrix --variant before --suite mixed --resume
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts matrix --variant before --suite memory --resume
```

Repeat with `--variant after` and the final compiled source. Run matrices
sequentially on this shared machine. The mixed suite runs each PAT HTTP/Auth0 MCP
concurrency 1/5/10 phase for 30 seconds, with and without a concurrent 50-row sync.
The memory suite launches a fresh process for each daily/compact 20/100-account
ten-year history scenario, with 5 warmups and 100 calls. A separate sampling thread
measures process RSS every 5 ms while the application thread is busy. It excludes
seeding and includes that scenario's preflight/warmups/calls; worker overhead is
included identically in both variants. The maximum is a sampled peak, not an
estimate of peak heap or proof of an unobserved instantaneous RSS maximum.
Memory-only processes expose GC and collect once before the scenario; normal
latency captures do not force GC. Create `.pause-captures` in the output root to
pause the matrix before its next capture, then remove it after other validation
finishes. Wait for the pause announcement before starting competing load; current
captures finish normally. The pause marker is temporary and must not be committed.

The final `compare` command checks all required suites. Use `compare --suite main`
for an early main-only report, or add `--rows 10000` to require all three paired
processes for just that dataset and write `comparison-10000.json`/`.md`.
`--output` points at an individual supplemental
directory. Migration runtime and blocked-read measurements can be reproduced with
[the migration runner](../test/migrations/measure-query-migrations.cjs), using
the same guarded database environment.

Matrix startup/resume and final comparison require
`approved-provenance.json`: each variant's application-source and compiled-JavaScript
hashes plus fingerprints for the shared sampling/observer/adapters and the selected
workload family. The full shared runner module is also checked, covering serializer
helpers and module constants outside those functions. Unknown revisions are rejected. Explicitly enumerated original
v2 main captures predate per-function fingerprints; their saved full harness hashes
are approved separately, with the limited subsequent harness edits documented.
New disjoint suites or reporting changes do not silently approve changed measurements.
`approve-provenance` records an intentional approval using original/final source
roots; review the diff before adopting a changed fingerprint. This command is not
part of ordinary capture/resume.

Use `write-plans --variant before` and `write-plans --variant after` for the
separate sync plan probe. It explains the actual service-emitted writes on their
real inputs inside a rollback savepoint, then executes the normal statement and
verifies persisted results. This retains generated-ID and transaction behavior.
Those EXPLAIN execution times are diagnostics and are excluded from normal request
latency samples. The source used by either command is selected with the same
`BENCHMARK_SOURCE_ROOT` variable.

Additional suites use the same guarded lifecycle:

```bash
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts capture --variant before --samples 1 --warmups 0 --correctness --filter transactions.date-filter --no-transports --output docs/performance/backend-query/probes
yarn ts-node -r tsconfig-paths/register scripts/benchmark-backend.ts capture --variant before --samples 100 --warmups 5 --sync --filter sync. --no-transports --output docs/performance/backend-query/sync
yarn test --config test/jest-performance-postgres.json --runInBand
```

The PostgreSQL Jest case is opt-in through the same URL and requires a compiled
source root. The guard/statistics tests run without a database. New migrations
are applied with the actual TypeORM migration runner, not schema synchronization.

The final fixture reproduces migration-derived holdings history: 100 position
headers plus 12,100 factual monthly manual valuation headers. September 4 remains
the latest snapshot, with 100 positions in each of 100 portfolios. Accounts and
positions both use the manual provider; no unlinked Plaid positions are invented.
[The fixture parity proof](performance/backend-query/schema-fixture-parity.json)
compares every header fact against applying the three actual final migrations to
the original seeded schema, excluding generated header UUIDs. Reproduce it with
`fixture-parity`, setting `BENCHMARK_SOURCE_ROOT` to the original backend and
`BENCHMARK_FINAL_SOURCE_ROOT` to the final backend. This keeps equivalent portfolio
benchmarks populated; explicit clears remain separate correctness probes.

## What each number measures

Each normal scenario makes one preflight validation call, five unmeasured warmups,
then at least 100 measured calls. Raw samples preserve wall time, process CPU,
heap change/RSS at call completion, SELECT count, SELECT/CTE elapsed time, returned
SELECT/CTE row count and serialized row bytes, response bytes, and gzip bytes.
DML `RETURNING` rows/bytes are not included in those read-result counters.
Write/transaction
statement counts are recorded separately for sync/PAT cases. SQL byte counting
and gzip happen after the measured service interval. Application code is emitted
with the production TypeScript build settings; it is not interpreted by ts-node.
The observer records only measured intervals and releases records between calls.
It retains raw SQL result rows until each call finishes; that observer allocation
and retention are present in both variants and in isolated memory measurements.
Post-interval SQL byte serialization can still influence garbage collection in a
later call; matched variants retain this instrumentation, and repeated-run spread
is reported. Serialization has its own timing, and connection acquisition wait is
recorded at the PostgreSQL driver's pool boundary. Mixed phases also record
event-loop delay, throughput, errors and pool-wait distributions. Provider network
time and model latency are deliberately absent, rather than estimated.
CPU is process CPU for the whole measured call; ORM hydration and domain mapping
are not separately timed stages. The isolated matching workload measures that
algorithm directly. Generated comparison reports retain per-process diagnostic
distributions and show unavailable fields explicitly instead of assuming zero.
`sqlMs` is SELECT/WITH elapsed time, not total database time. Later captures also
retain `totalDataSqlMs` across read/write statements once each and
`topLevelWriteSqlMs`; earlier main files leave those new fields unavailable.
The common observer starts query timing before any connection acquisition, so
its SQL elapsed time can overlap `poolWaitMs`: do not add those as disjoint costs.
The final application's own request SQL metrics exclude connection acquisition.

The first observer retained SQL rows during unmeasured warmups. At 1m fixture rows,
that observer exhausted Node's 4 GiB heap during legacy search. This was a harness
failure, **not evidence of an application OOM**. Those six completed runs and the
partial run are preserved under `superseded-observer-v1/`; all primary comparisons
use a complete rerun with the corrected v2 observer. V2 also counts SQL bytes one
row at a time, avoiding a giant intermediate JSON string.

Service intervals include result JSON serialization. HTTP intervals include
loopback HTTP, the real PAT guard/controller and database services. MCP intervals
include loopback Streamable HTTP, a locally signed JWT validated by the real
Auth0 MCP gate, database-backed identity lookup, tool schemas and result formatting.
The local JWT authority supplies JWKS without contacting Auth0. Initialization
and handshake are recorded separately from repeated tool calls. No model
inference, internet latency, or provider network time is included.
Transport intervals also include the harness's final JSON reserialization after
the HTTP/MCP client has parsed the result. Its duration is saved separately as
`serializationMs`; subtract it per sample for client-completion latency before
computing percentiles. `responseBytes` and `gzipBytes` describe this logical JSON
payload, not captured HTTP wire bytes or Streamable HTTP framing.

Final captures include the production database metrics wrapper and HTTP request
middleware; the original production source predates those modules. The real final
MCP listener also installs its own request metrics. This implementation difference
is recorded separately from the common observer v2. Logging/shipper output remains
disabled identically. The generic `sqlWriteCount` counts top-level DML statements;
`dataModifyingStatements` additionally detects data-modifying CTEs. Isolated PAT
cases verify the actual tuple/last-used transition, since a CTE statement can
legitimately update zero rows.

The clock is fixed at `2026-09-05T12:00:00Z`. The pool maximum is 10. Schedules,
external providers, log shipping and notification listeners are absent/disabled;
provider/auth dependencies outside the tested paths throw if called. The provider
sync suite supplies deterministic responses and measures only database application,
with fixture cleanup and generation acquisition outside that interval.
Mixed sync runs one saturated serial producer: the next 50-row apply starts as
soon as the previous finishes. Faster implementations therefore process more sync
batches. Report completed sync calls per second beside read latency/throughput;
this is contention under saturation, not a matched offered write rate.

The data is database-warm after seeding and `ANALYZE`; this is **not** a cold
PostgreSQL-cache benchmark. Process-cold startup is not included in repeated-call
latency. Per-call RSS is descriptive, not an isolated peak-memory comparison.
Use a separate process and `--filter` for an isolated workload memory run. The
machine also hosts developer activity; compare spread across independent runs and
investigate unstable tails before making an improvement claim.

Representative SELECTs retain `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, SQL,
synthetic parameters, and observed rows/bytes. The real migration list, index
and column definitions, source file hashes, fixture identity, Node/PostgreSQL
versions, CPU and pool settings accompany every capture. Unique schema names
are replaced in printed query text; captured plans contain test-owned schema names.

## Baseline correctness evidence

[The PostgreSQL reproduction](performance/backend-query/probes/before-10000-run1.json)
recorded:

| Scenario                              | Original result                        | Required corrected result      |
| ------------------------------------- | -------------------------------------- | ------------------------------ |
| Exactly full final transaction page   | 100 rows, `hasMore: true`              | `hasMore: false`               |
| Missing FX                            | Explicit failure                       | Preserve explicit failure      |
| Exact ETH ingestion                   | Final wei lost                         | Preserve `1000000000000000001` |
| 10 ETH persistence                    | PostgreSQL integer overflow            | Exact storage succeeds         |
| Cleared manual portfolio              | Web 0 positions; MCP 100 old positions | Both return 0                  |
| Failure on second holding write       | First position remains                 | No partial positions remain    |
| Reversed provider response completion | Older response overwrites newer        | Reject stale generation        |
| Concurrent settings patches           | 19 of 20 trials lost an edit           | No unrelated edit lost         |
| Two EUR-cent rows at 1.5 USD rate     | Summary 3 cents; drilldown 4           | Both 4 cents                   |

The real query runner additionally discovered that the original HTTP amount sort
fails inside TypeORM's joined pagination metadata handling. A 5,000-row banking
sync exceeds the PostgreSQL bind-parameter budget. Those are recorded as known
baseline failures, not timed successes; fixing them is a correctness improvement.
Unexpected failures abort capture instead of silently omitting a scenario.

The sparse EUR history fixture exposes another exact-arithmetic correction:
100 accounts total 10,505,000 EUR cents and the fixed 1.1 quote implies exactly
115,555 USD. The original daily chart reports `115554.99999999999`; the new chart
reports the exact string `"115555"`. Its integer net-worth total already reconciled.
The comparator accepts only this named input/output correction, while checking
all dates, labels, account summaries and integer totals unchanged. This profile is
separate from the entirely equivalent USD history lane.

## Coverage and completion

The main matrix currently covers every existing transaction sort, first/deep
pages, date filters, legacy search, FX pages on 1/10/100 dates and 1/3 currencies,
latest holdings for 1/20/100 accounts with 100 positions each, month/year/ten-year
history with 20/100 accounts, summary/audit cash flow, isolated equal-amount
matching CPU, PAT HTTP, MCP history/transactions/holdings and the cash-flow App
comparison pipeline. A supplemental sync matrix covers 50/500/5,000 banking rows
with rules off/on, modified banking rows, and investment activities at the same
sizes, plus completed provider holdings with zero or 100 positions. Supplemental
filter profiles cover category, uncategorized, and combined date/account/category
selection at 100k rows in the completed focused set; all three sizes remain available in the optional extended matrix. Extended shapes cover empty/10-position holdings, portfolio conversion,
compact history, and rare/no-match converted searches over 100k candidate rows.
The last pair validates every continuation against a separately ordered SQL oracle,
outside the measured interval. Shape profiles add rules/lookaround cash-flow
reports and dense/prior-FX history. Correctness integration suites separately
exercise failure, retries, sync fencing, pending replacements and settings races.
Deep cursor profiles acquire the preceding cursor outside the measured interval,
then compare the new count-free continuation with the original deep offset page.
They require the same ordered data, and the captured continuation SQL must contain
neither OFFSET nor a count. Portfolio profiles include 0/10/100 positions and
mixed currencies/snapshot dates.

Focused final-source validation is complete. The retained 10k result
provides repeated-run latency confidence; the new short samples provide broader
diagnostic coverage with strict correctness checks. They do not substitute for
the deliberately omitted 100-call, three-process full inventory. Migration runtime
and blocked-read measurements are recorded separately in `backend/docs/performance/migrations/`.

Comparisons must keep exact-money type changes and intentional date/rounding
corrections separate from equivalent-result speedups. Money numbers are normalized
to strings for comparison, never rounded back through a JavaScript number.
Transaction order and exact values must match. Holdings are compared by unique
identity because the new batched reader changes unspecified position ordering;
its complete snapshot metadata is checked separately. New cursor, sampling, and
actual FX observation metadata are checked explicitly rather than suppressing
financial fields. Daily series must match every point. Compact series must keep
original point values, requested endpoints, complete account summaries and exact
totals, obey the point budget, and reduce chart JSON by at least 80%.

The comparator fails on missing/mismatched inputs, unexpected economic differences,
incomplete sampling, and deterministic query/shape budgets. `comparison.json`
retains each run and spread; `comparison.md` presents the median of per-process
percentiles. Regressions exceeding both 10% and 5 ms are flagged for explanation.
`--exploratory` permits smaller samples for diagnosis only. The final before/after
diagnostic table is written separately by the focused runner, which does not mark
the original full inventory complete.

## Shared entry points for future work

| Need                                         | Entry point                                                                       | Contract and ownership                                                                                                                                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transaction pages, search, report candidates | `TransactionQueryService.readPage`, `search`, `readAnalysis`, `readMcpCandidates` | Always pass authenticated `userId`. The service owns SQL, filters and projections; detail/sync-only provider payloads stay out of list/report reads.                                                       |
| Infinite scrolling                           | `TransactionService.findPage`                                                     | Initial request may obtain the exact total; continuation sends the opaque sort/filter-bound cursor and omits the count. `findAllPaginated` is the offset adapter for remaining callers.                    |
| Historical conversion                        | `CurrencyConversionService.getResolvedRates`                                      | Batch unique currency-pair/date requests. Exact quotes include requested and actual observation dates/source. Use effective transaction date for spending; preserve valuation dates for balances/holdings. |
| Latest/date-specific holdings                | `HoldingsQueryService.read`                                                       | One coherent read snapshot for owned accounts, completed headers and positions. An empty completed header is a fact; do not fall back to old positions. Both investment HTTP and MCP reuse it.             |
| Cash-flow summary, audit and category detail | `CashFlowQueryService.report`, `categoryTransactions`                             | Load settings, candidates, rules and quotes once per period; derive all outputs from the evaluated report. `TransactionAnalysisService` adapts existing public methods.                                    |
| Home/history projection                      | `BalanceQueryService.loadBalanceProjection`                                       | Explicit user/date/account scope. Summary readers consume the projection without retaining a daily account matrix. Request `daily` or explicit `compact` history and honor work/output budgets.            |
| Provider apply                               | `TransactionService.processSyncResults`, investment upserts                       | Batch identities/rules/writes inside the apply transaction. Acquire investment generation before provider fetch; pass it to apply so stale work cannot publish.                                            |
| Settings/preferences                         | `UserService.findSettings`, `getPreferredCurrency`, `updateSettings`              | Narrow reads and locked patching. No singleton financial-data cache or cached revocation decision.                                                                                                         |

Keep HTTP minor-unit strings and MCP major-unit strings distinct. Do not convert
canonical financial values through JavaScript numbers to call these services.
Request-local reuse may share an `EntityManager`/quote set inside a read snapshot;
never retain one across users or requests. The standalone MCP listener uses Auth0;
PAT usage-write coalescing benefits the HTTP path only.
