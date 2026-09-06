# Frontend and MCP App validation

The production frontend, real Nest HTTP API and real PostgreSQL passed the browser cases below. The previous SSR/cache work was preserved. No application changes were needed during final browser verification.

## Automated checks

| Check | Result |
| --- | --- |
| Frontend tests | 69 files, 435 tests passed |
| Frontend typecheck | Passed, including after final Orval regeneration |
| Frontend lint | Zero errors; three existing warnings |
| Frontend production build | Passed; the generated `.output` server was used for browser checks |
| MCP App model/runtime focused tests | Three suites, 71 tests passed |
| Complete backend suite | 109 suites, 1,148 tests passed, including MCP, settings, PAT and metrics |

The settings/PAT PostgreSQL tests cover simultaneous nested patches, notification defaults, provider-detail replacement, and expiry/revocation/deleted-user races while waiting on row locks. Ten concurrent PAT validations perform exactly one actual usage update, and a later minute permits another. A pool-size-one test proves separate connection-acquisition timing and request isolation. See [backend checks](backend-checks.md) and [metrics semantics](../../request-metrics.md).

## Production web cases

The task-owned API ran on port 3101 and the production frontend on 4101. `test/helpers/serve-browser-fixture.cjs` creates a random migrated schema in the dedicated loopback `splice_backend_benchmark` database, uses normal cookie authentication, and supplies synthetic USD/ETH transactions and deterministic brokerage quotes. Financial services, HTTP, database operations and UI behavior were real.

| Case | Observed result | Evidence |
| --- | --- | --- |
| Transaction scrolling | Loaded 50 → 100 → 126 rows using cursors; continuation retained the initial total | [Desktop list](splice-production-transactions-desktop.png) |
| Filters and sorting | Account filter restarted at one matching row; description sort restarted with `merchantName ASC` and no old cursor/offset | Same production flow |
| Exact ETH edit | Saved −1.000000000000000002 ETH and read back minor-unit string `1000000000000000002` | [Phone editor](splice-production-eth-edit-mobile.png) |
| Above-bigint ETH edit | Saved −10.000000000000000001 ETH; HTTP 200 readback retained minor-unit string `10000000000000000001` | [Input](splice-final-eth-above-bigint-input.png), [saved value](splice-final-eth-above-bigint-saved.png) |
| Cash-flow reconciliation | September 1–5 Food drilldown displayed 126 transactions; native USD/ETH rows converted at their reporting dates to the same 265,859 USD minor-unit outflow as the summary | [Drilldown](splice-final-cashflow-drilldown.png) |
| Clear manual holdings | Exact quantity `3.000000000001` remained editable. Removing the last holding changed the account from $37.04 to $0 and net worth from $7,493.13 to $7,456.09. Refreshing prices still returned an empty completed snapshot and zero value | [Cleared holdings](splice-final-holdings-cleared.png) |
| Stale settings tabs | Separate saves kept both `hideZeroBalanceAccounts=true` and `newSyncedTransactions=false`, preserving the unrelated notification setting | [Two tabs](splice-final-settings-tabs.png) |
| SSR preference persistence | Hidden balances remained hidden through a complete Home reload | [Masked Home](splice-production-home-masked-mobile.png) |
| Loading, failure and retry | A deliberately aborted local category request showed loading, then an error and Retry. Removing the interception and retrying rendered the expected 90 rows | [Loading](splice-final-drilldown-loading.png), [error](splice-final-drilldown-error.png), [recovered](splice-final-drilldown-recovered.png) |
| Phone layout/runtime | At a 390 px viewport, document width remained 390 px. Production navigation and edits produced no page errors | Phone screenshots above |

The development Vite/TanStack server intermittently regenerated routes around colocated test files and reported `createStartHandler`/`setResponseHeader` as undefined. No SSR workaround was added for this separate existing development issue. Final browser results use the stable production build.

## Official MCP App host

The tagged official `modelcontextprotocol/ext-apps` v1.7.5 host exercised authenticated fixture transport and the final compiled cash-flow and portfolio Apps. Viewports included desktop dark, phone light/dark and 320 px. The fixture implements the final `withReadSnapshot` service callback; earlier captures made before that adapter fix are superseded.

| Case | Observed result | Evidence |
| --- | --- | --- |
| Empty results | Both Apps showed purposeful empty states and exact $0.00, with no old positions or spending rows. Eight captures, zero page errors | [Contact sheet](mcp-empty/contact-sheet-mobile-light.png), [sanitized capture summary](mcp-empty/summary.json) |
| Primary tool failures | Both tool calls returned errors without stale financial values. Eight captures, zero page errors; host controls remained usable | [Contact sheet](mcp-primary-error/contact-sheet-mobile-light.png), [sanitized capture summary](mcp-primary-error/summary.json) |
| Changed portfolio selection | An initial $140,000 / eight-holding result was followed by a $100,000 / two-holding result: $62,000 and $38,000 at 62% / 38%, with no inherited rows in the new result | [Initial result](splice-mcp-current-first.png), [new result](splice-mcp-current-second-focused.png) |
| Cash-flow comparison | Final `getReport` output showed $3,130 net, +$730 change, $6,250 inflow and $3,120 outflow, with exact category changes | [Comparison](splice-mcp-current-cashflow.png) |

The host intentionally retains earlier tool cards as conversation history. In-App result replacement and late-result races are separately covered by runtime regressions. The host controls error-resource timing: the portfolio failure screenshot can show a blank tool pane before its Unavailable card; the returned tool error is the asserted boundary. Loading-to-ready recordings and full transport logs were inspected during validation; only screenshots and sanitized summaries are retained here.

All task-owned browser sessions, API/frontend/host servers and fixture schemas were closed or removed. Ports 3101, 4101, 3102, 8080 and 8081 were confirmed clear. Existing user servers on 3000/4000 were left running. Credentials were loaded only into the local process; reports contain no tokens or provider credentials.
