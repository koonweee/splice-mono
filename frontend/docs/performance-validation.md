# Perceived performance validation

Implementation started from `f5f1298` on 2026-09-05. The existing React 19,
TanStack Start/Router/Query, Nitro, NestJS 11, TypeORM, and PostgreSQL stack remains.
The work changes route splitting, authenticated rendering, presentation startup,
dashboard projections, and cache/mutation ownership.

## Reproducible comparison

The baseline is a production build of the starting frontend, preserved outside
the working tree before implementation. Both versions use the same synthetic HTTP
fixture server, browser, machine, viewports, and throttling:

- Desktop: 1440 × 1000; phone: 390 × 844, device scale 1.
- Chromium controlled through a dedicated agent-browser session and CDP.
- 4× CPU slowdown, 150 ms network latency, 1.6 Mbps download, 0.8 Mbps upload.
- Seven cold loads per primary route and viewport. Browser HTTP cache disabled
  and cleared for each cold load; each navigation creates a fresh app QueryClient.
- Seven warm navigation round trips, period changes, account dialog openings,
  and synthetic account-name saves per viewport. These use DOM activation for
  reproducibility; real pointer, keyboard, and touch behavior is checked separately.
- No production credentials or user financial records. Fixtures include 0, 4,
  and 20 accounts, assets/debt, USD/EUR/JPY history, changing native currencies,
  archived accounts, sparse snapshots, and ten years of history.

First useful content is the first rendered frame with Home summary/account cards
(including intentional masking), Transactions rows, Accounts rows, or Analysis
summary values. It is distinct from LCP and does not require a chart or editor to
finish loading. The cold measurement script installs its observer before navigation.
Browser errors, requests, and resource sizes accompany the timing samples.

The fixture server caches generated response bodies to isolate transfer and
frontend processing. These timings measure local production Nitro, not live
production latency or database throughput. Static file compression/CDN behavior
in production can change absolute timings. Database query counts and financial
parity are tested separately against PostgreSQL and the actual frontend transform.

## Evidence and commands

Run from the repository root unless a command begins with `cd frontend` or
`cd backend`. Start local servers on unused ports; do not replace the user's dev
processes. Close every agent-browser session started for validation.

```sh
# Current-source OpenAPI without starting the real backend or accessing its DB
cd backend
yarn ts-node -r tsconfig-paths/register test/balance-query/export-dashboard-openapi.ts /tmp/splice-performance-openapi.json

cd ../frontend
ORVAL_API_INPUT=/tmp/splice-performance-openapi.json yarn orval
VITE_API_BASE_URL=http://localhost:4310 VITE_DISABLE_DEVTOOLS=true yarn build
node scripts/build-report.mjs .output
node scripts/verify-ssr.mjs
node scripts/verify-dashboard-parity.mjs --report /tmp/splice-dashboard-parity-report.json

# Synthetic API, from repository root
TS_NODE_PROJECT=backend/tsconfig.json node -r ./backend/node_modules/ts-node/register/transpile-only -r ./backend/node_modules/tsconfig-paths/register frontend/scripts/performance-fixture.cjs

# Optimized production frontend, from frontend/
PORT=4302 HOST=127.0.0.1 SPLICE_INTERNAL_API_BASE_URL=http://localhost:4310 node .output/server/index.mjs

agent-browser --session splice-performance open http://localhost:4302/home
agent-browser --session splice-performance get cdp-url
# Pass that session's reported websocket endpoint:
node scripts/performance-browser.mjs <websocket> http://localhost:4302 /tmp/after-cold.json
node scripts/performance-interactions.mjs <websocket> http://localhost:4302 /tmp/after-interactions.json
agent-browser --session splice-performance close
```

`build-report.mjs` reads the actual TanStack production manifest and follows
static imports. Required vendor chunks count toward initial bytes. Dynamically
loaded editor/chart chunks do not. Raw and gzip sizes are both recorded.

## Measured results

All startup budgets pass. Times below are milliseconds; spread is minimum–maximum across seven runs. These are matched synthetic local measurements, not a live-production latency claim.

| Viewport / route      | Before median (spread) | After median (spread) | Earlier useful content |
| --------------------- | ---------------------: | --------------------: | ---------------------: |
| Desktop /home         | 10,365 (10,222–10,636) |   3,100 (3,089–4,069) |                  70.1% |
| Desktop /transactions | 10,488 (10,448–10,717) |   4,612 (4,305–5,206) |                  56.0% |
| Desktop /accounts     | 10,278 (10,213–10,316) |   4,163 (3,889–4,562) |                  59.5% |
| Desktop /analysis     | 10,410 (10,335–10,596) |   4,113 (4,093–4,119) |                  60.5% |
| Phone /home           | 10,299 (10,194–10,397) |   3,087 (3,076–4,226) |                  70.0% |
| Phone /transactions   | 10,231 (10,177–10,274) |   4,476 (4,227–5,182) |                  56.2% |
| Phone /accounts       | 10,212 (10,187–10,287) |   4, 143 (3,843–4,582) |                  59.4% |
| Phone /analysis       | 10,423 (10,326–10,497) |   4,096 (4,092–4,100) |                  60.7% |

Home exceeds the 25% improvement target on both viewports. Every other primary route improves, satisfying the maximum 10% regression limit. All 56 final cold runs and 56 baseline runs recorded zero uncaught page errors.

The main entry is **227,796 gzip bytes**, below the 300,000-byte budget and 51.8% smaller than the 472,784-byte baseline. Initial route dependency totals include required static vendor imports:

| Route         | Before raw / gzip bytes | After raw / gzip bytes |
| ------------- | ----------------------: | ---------------------: |
| /             |     1,561,670 / 472,784 |      736,570 / 232,268 |
| /home         |     1,574,966 / 477,006 |      784,748 / 251,989 |
| /transactions |     1,595,258 / 484,720 |    1,097,531 / 347,192 |
| /accounts     |     1,593,613 / 483,604 |      779,713 / 250,567 |
| /analysis     |     1,631,132 / 494,658 |      820,305 / 260,757 |
| /settings     |     1,574,966 / 477,006 |      769,213 / 243,579 |

Charts are measured separately from useful content. A supplementary seven-run Home baseline captures the first rendered Recharts area; the final cold script records both milestones.

| Home chart | Before median (spread), ms | After median (spread), ms |
| ---------- | -------------------------: | ------------------------: |
| Desktop    |     10,203 (10,161–10,243) |       7,970 (7,962–9,128) |
| Phone      |     10,189 (10,174–10,205) |      7,960 (7,951–10,590) |

This is first rendered chart geometry, not animation completion. Home summary appears several seconds earlier than the deferred chart on the throttled profile. LCP samples remain in the raw records; they are observations at the capture boundary, not field Core Web Vitals.

Raw samples, response/resource inventories, manifests and comparison inputs are retained in [performance/](./performance/). The browser fixture logs used by the preference/interaction checks include server-side API calls that do not appear as separate browser requests during SSR.

## Repeat navigation and editing

Times are milliseconds; spread is minimum–maximum across seven interactions. Requests count synthetic API calls observed around each interaction, including background work.

| Viewport / interaction  | Before median (spread) | After median (spread) | Median API requests, before → after |
| ----------------------- | ---------------------: | --------------------: | ----------------------------------: |
| Desktop warm-navigation |          192 (170–302) |         169 (156–192) |                               3 → 0 |
| Desktop period-change   |            79 (65–344) |            71 (48–75) |                               1 → 1 |
| Desktop account-modal   |            71 (61–252) |           67 (61–626) |                               1 → 1 |
| Desktop name-save       |          372 (364–390) |         375 (360–390) |                               2 → 2 |
| Phone warm-navigation   |          198 (175–307) |         151 (148–169) |                               3 → 0 |
| Phone period-change     |            94 (73–319) |            69 (40–79) |                               1 → 1 |
| Phone account-modal     |            72 (65–214) |           65 (62–516) |                               1 → 1 |
| Phone name-save         |          383 (360–400) |         373 (357–393) |                               2 → 2 |

Matching warm navigation makes **zero primary data requests**, versus three API requests per round trip before. The period timing measures visible selection/content, not completion of its background refresh. Each test loop also saves an account name, so affected inactive period/history queries correctly become stale again.

The first modal opening without prior hover/focus pays the deferred code download: desktop 626 ms versus 252 ms, phone 516 ms versus 214 ms. Subsequent openings are comparable or faster. This is an explicit tradeoff for the smaller startup download. Save completion remains roughly 0.4 seconds; the change does not claim faster server writes.

[comparison.json](./performance/comparison.json) includes median/spread, request and payload counts, transitive bundles, chart readiness, and executable budget results. Recreate it with `node scripts/summarize-performance.mjs` after collecting all seven-run inputs.

## Financial and server verification

The actual frontend `transformToDashboardData` was compared with the compact API
in 42 cases: every period, 0/4/20 accounts, and USD/JPY reporting currencies.
Net worth, change amounts/percentages, account ordering/metadata, and chart dates
match. Chart values are compared in exact reporting-currency minor units through
the existing money converter, removing only previous binary floating-point tails.

For the synthetic 20-account, ten-year USD case, the previous history payload was
80,560,187 uncompressed bytes (892,639 gzip). Combined summary and series responses
were 21,243 bytes (1,945 gzip), a 99.97% raw reduction, with 121 chart points.
The new dashboard path never constructs an account-by-day response matrix.

Disposable PostgreSQL integration verifies bounded queries, including FX:
11 SELECTs for the summary and 7 for the series, independent of account/day count.
Existing history and MCP contracts remain available. Unit/HTTP tests cover empty
users, signed balances, missing FX, dates, authentication, ownership, and errors.

Built-Nitro HTTP checks verify request-local two-user isolation, private/no-store
headers, separate rotated Set-Cookie headers, refresh-cookie reuse before streaming,
no serialized token bodies, anonymous redirects, and recoverable landing outages.
They also hold chart data back while Home summary HTML arrives, verify actual
transaction table rows in HTML, limit Settings loading to the selected section,
and preserve local errors through hydration.

## Automated and browser verification

- Frontend: `yarn test --maxWorkers=3` passes 67 files / 410 tests; `yarn lint`, `yarn typecheck`, and production `yarn build` pass. Lint reports three nonblocking `require-await` warnings.
- Backend: `yarn test test/balance-query test/currency-exchange test/auth --runInBand` passes 114 tests. The two opt-in PostgreSQL tests are skipped in that default command and pass separately using `yarn test --config test/jest-dashboard-postgres.json --runInBand` with `DASHBOARD_TEST_DATABASE_URL` pointing only to a disposable local `splice_dashboard_test` database.
- Portfolio regressions: `yarn test test/mcp/mcp-portfolio-model.spec.ts test/mcp/mcp-portfolio-visualization.service.spec.ts --runInBand` passes 26 tests. Backend `yarn lint`, `yarn typecheck`, and `yarn build` pass.
- Generated clients came from current backend controller/schema metadata through Orval; the route tree came from the normal compiler. Generated files were not hand-edited.
- [Preference and session browser evidence](./performance/preferences/README.md): 19 delayed-JavaScript first-paint cases plus anonymous hydration and settled two-tab logout. Actual screenshots cover four themes and phone/tablet/desktop. Parent inspection confirmed masked phone content and saved Settings before hydration.
- [Interaction observations](./performance/interaction-qa.md) and [completion report](./performance/interaction-completion.json) cover real pointer/keyboard/touch input, tablet navigation, 50→65 pagination, failed draft preservation, primary Retry recovery, URL/history behavior, selected Settings requests, zero-request fresh navigation, and labeled previous content after a real 31-second stale refresh failure. Categories loads its active inventory once and its existing archived comparison separately; unopened Settings sections remain unloaded.

- [Two-tab browser refresh](./performance/refresh-qa.md): two actual canonical query revalidations receive synthetic 401s; the real Web Locks coordinator performs one refresh, both retries succeed, HTTP-only rotation is verified, and both tabs retain identity without page errors. The backend grace behavior and real server transport are covered separately by backend/SSR tests.
- All task-owned browsers and temporary servers were closed after validation; existing dev services were left intact. No deployment was performed.

Independent implementation/review/fix work completed across three review passes. Final signoff: **No major issues remain.** All 83 implementation ledger items are verified.

## Rollout and rollback

Deploy the additive backend APIs and private-response headers first. Verify the
frontend runtime's `SPLICE_INTERNAL_API_BASE_URL`, then deploy the frontend through
the existing protected Deploy workflow. This implementation does not deploy or
change infrastructure topology.

Rollback the frontend first; old clients still use the existing history endpoints.
Rollback backend changes afterward only if needed. Keep private-response headers
in place. Presentation cookies are optional hints that older clients can ignore.
