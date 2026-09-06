# Shared investment and cash-flow reads

`HoldingsQueryService.read(userId, options, manager?)` is the holdings entry point
for HTTP investment reads, manual brokerage valuation, MCP holdings, and portfolio
visualization. It selects owned accounts, their complete snapshot headers, and
positions in at most three domain SELECTs, independent of account count. Its own
read transaction uses repeatable read; a write caller may supply its locked
transaction manager. No opaque provider JSON is selected.

A completed header is authoritative even when it has no positions. Headers carry
the provider, date, revision and completion time; manual headers also preserve
the committed account valuation. Migration backfill uses position dates and
actual manual valuation events, never unrelated provider balance dates. Deleting
a header cascades its positions; permitted account deletion cleans up headers.
Existing account deletion constraints on holdings, balances and activity remain.
Manual holdings accounts accept
position edits rather than CSV balance imports.

Manual position quantities, prices, native/account valuations and stored FX rates
must fit their `numeric(30,12)` columns: at most 18 integer and 12 fractional
digits. FX valuation uses the stored quote's exact fraction; the informational
rate saved on the position is explicitly rounded to 12 decimals. This supports
ordinary inverse quotes and preserves exact half-cent rounding.
Valuation checks storage bounds before opening the write transaction and
returns an actionable 400 for unsupported positions. Account money remains exact
minor-unit text with its separate 78-digit bound.

Provider sync must call `InvestmentService.beginProviderSync` **before** fetching
holdings or investment activity. Its persisted generation token is mandatory for
the apply method. Apply locks the bank link, generation state and owned active
accounts, then writes securities, headers, positions or activity/details in
bounded batches. Superseded/already completed generations fail. Investment
activity completion metadata commits with its data. Provider network work stays
outside this transaction. Manual edits retain their account lock and optimistic
position signature checks.

`CashFlowQueryService.report(userId, startDate, endDate, reportingCurrency?)`
loads settings, active rules, the complete lookaround candidate set and available
FX quotes for report candidates from one
repeatable-read database snapshot. `TransactionQueryService.readAnalysis` owns
the shared candidate projection and effective-date filtering. The SQL transaction
commits before rule matching, conversion or aggregation. Missing candidate quotes
are allowed during loading; only surviving nonzero foreign rows require them.
Concurrent amount and quote updates cannot produce a mixed-version report.
No financial context is cached across
requests.

The returned request-local report has `summary`, `audit`, and
`evaluatedTransactions`. Serialize only the requested public view. Derive a
category drilldown with `categoryTransactions(report, category, direction)`.
`TransactionAnalysisService.getReport` is the adapter for a combined caller;
MCP cash-flow visualization invokes it once per period, twice for comparison.
Independent HTTP requests each obtain a fresh context.

Exclusions precede neutralization; specific rules precede broad rules. Native
currency/amount buckets match each inflow with the nearest eligible earlier
outflow, then ascending ID for same-day ties. A sorted date index preserves this
policy without repeated filtering and sorting. Lookaround counterparts can sit
outside the requested report interval.

Each surviving transaction converts once at its effective activity date. Exact
integer-ratio FX rounds that row once; category and overall totals sum those
rounded minor units with bigint. Thus two EUR 0.01 outflows at 1.5 total USD 0.04
in both summary and drilldown. Money fields are decimal strings: internal/HTTP
money uses minor units; MCP money uses major units. Rates retain requested date,
actual quote date, source and exact fraction.

Summary, audit and detail share the combined report's failure boundary. Missing
required FX on surviving rows fails the report, including an audit request;
excluded or neutralized rows do not themselves require conversion. This is an
intentional coordinated contract change, not a partially available report.

Regression suites are `test/investment/holdings.postgres.spec.ts`,
`test/transaction-analysis/{cash-flow.postgres,cash-flow-matching,transaction-analysis.service}.spec.ts`,
and `test/currency-exchange/currency-exchange.postgres.spec.ts`. PostgreSQL tests
require the dedicated loopback `splice_backend_benchmark` database and create/drop
only a unique test schema. The matched benchmark harness separately captures
500/1,000/2,000-row matching CPU and complete HTTP/MCP/report workloads.
