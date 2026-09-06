# Shared financial query services

New HTTP, MCP and background features should use these entry points so ownership, effective dates, money and missing-data behavior remain consistent.

| Domain          | Entry point                                                                                     | Contract and scope                                                                                                                                                                                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transactions    | `TransactionQueryService.readPage`, `search`, `readDetail`, `readAnalysis`, `readMcpCandidates` | Owned user/account filters; stored reporting dates; explicit projections. Use `withReadSnapshot` and its manager when combining rows with settings or FX. Lists omit raw provider payloads. Detail and sync identity reads preserve provenance.                          |
| Sync identities | `TransactionQueryService.readSyncIdentities`, `readRemovalActivityIds`                          | Use the caller's transaction manager. Identity reads lock existing rows; sync also locks active accounts in sorted order to serialize new identities. Chunk inputs.                                                                                                      |
| FX              | `CurrencyConversionService.getResolvedRates`                                                    | Deduplicated sparse pair/date requests, one set-based SQL statement, prior-first fallback. Carries requested date, observed quote date, source and exact integer ratio. Pass a manager for a consistent report snapshot.                                                 |
| Holdings        | `HoldingsQueryService.read`                                                                     | Account/header/positions in at most three domain SELECTs; completed empty headers are authoritative. Default is latest; explicit snapshot dates preserve as-of selection.                                                                                                |
| Cash flow       | `CashFlowQueryService.report`                                                                   | Settings, rules, candidates and available FX in one short repeatable-read snapshot. CPU matching and exact row rounding occur after commit. Derive summary/audit/drilldown from the returned context. Never serialize the internal context wholesale.                    |
| Balances        | `BalanceQueryService.loadBalanceProjection`                                                     | Settings, accounts, snapshots and FX are staged under one repeatable-read manager, then shared cursors stream exact conversions after commit. Streams daily account results; boundary mode returns only first/last days. Legacy full-detail adapters may materialize it. |
| History         | `BalanceHistorySurfaceService.getBalanceHistorySummary`                                         | Retains boundary summaries and chart values without retaining the daily account-object matrix. Daily is the default; compact sampling is explicit.                                                                                                                       |
| User settings   | `UserService.findSettings`, `getPreferredCurrency`                                              | Narrow settings reads. Settings/default/provider-detail writes merge under a row lock. No financial or authentication result cache.                                                                                                                                      |

## Exact money and FX

HTTP `money.amount` values and raw financial aggregates are strings of integer minor units. USD `"1234"` means $12.34; ETH `"1000000000000000001"` means 1.000000000000000001 ETH. MCP money amounts are decimal strings of major units. Rates are decimal strings and resolved rates also carry exact numerator/denominator strings; use that ratio when converting, especially for inverse-rate rounding ties.

Use `canonicalMinorUnits`, `minorToMajorString`, `majorToMinorString`, `convertMinorUnits`, and `moneyFromSignedMinorUnits` from `common/exact-money.ts`. Money never passes through JavaScript floating-point arithmetic. `MoneyWithSign.fromFloat` is reserved for provider SDKs that already deliver a number; it cannot restore source digits lost by that SDK.

Transaction FX uses the effective reporting date, including manual overrides. Balance and holdings valuations use their valuation date. Round each converted transaction once, half up, then sum integer minor units. A zero magnitude needs no foreign quote. Missing required quotes fail the report; missing quotes for excluded/neutralized cash-flow rows do not. The optional `allowMissing` resolver mode is for loading candidate coverage inside a snapshot, and callers must require a quote for every nonzero row they actually use.

## Pagination and work limits

HTTP transaction pages default to cursor navigation when `pageIndex` is omitted. Request an initial exact total; continuation responses normally return `total: null` and one extra row supplies `hasMore`. Explicit `pageIndex` remains an offset adapter for existing service callers. Cursors bind user, sort and filters, including full null/date/ID ties. A changed query requires a fresh cursor.

HTTP transaction pages, MCP transaction pages and portfolio valuations stage financial rows and required quote coverage in the same short snapshot before computing their output. MCP transaction cursors additionally bind reporting currency, merchant search and converted-amount filters. Filtered scans inspect at most 5,000 candidates per invocation. An unfinished scan returns `continuationReason: "scan_budget"`; follow `nextCursor` even when a page contains no matches. An exactly full terminal page has no continuation.

History accepts at most 10,000 days and 1,000,000 account-days. Compact output defaults to 240 chart points, accepts 4–1,000, and preserves endpoints and each bucket's extrema. Sampling metadata reports the source and returned point counts. It reduces chart output, not the exact boundary summaries or underlying work limit. Home retains its established point selection.

## Writes and observability

Banking sync loads an ordered rule snapshot once, maintains a composite identity map, then writes activity/detail tables in chunks of 250. Cursor hooks, duplicate consolidation and reconciliation archives stay inside the transaction; events are emitted after commit for surviving new uncategorized identities.

Investment provider fetches require a generation token allocated before network work. The apply transaction rejects stale generations and commits securities, complete headers, positions, activity details and completion metadata together. See [investment and cash-flow details](investment-and-cash-flow-queries.md).

`observability/request-metrics.ts` collects per-request SQL count/time, connection acquisition, request elapsed time and response serialization/bytes without retaining SQL, parameters, tokens or financial payloads. PAT validation uses a narrow joined statement with authoritative expiry/revocation checks and at most one usage-timestamp write per minute. The standalone MCP listener uses Auth0; PAT improvements apply to PAT HTTP, not that listener.

See [benchmark results and reproduction](backend-query-performance.md) and [coordinated release notes](backend-query-release-notes.md).
