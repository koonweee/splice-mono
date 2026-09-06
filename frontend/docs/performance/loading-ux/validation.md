# Loading UX validation

Production frontend builds run against the real NestJS/Postgres synthetic browser
fixture. No real financial accounts or external sync/provider operations are used.
The feature changes are frontend-only; the fixture helper additionally supports
an external frontend lifecycle and an explicit local environment-file path.

## Reproduce the fixture and browser checks

From the implementation checkout, start the backend fixture in its own terminal:

```sh
cd backend
SPLICE_BROWSER_EXTERNAL_FRONTEND=true \
SPLICE_BROWSER_ENV_FILE=/absolute/path/to/your/local/backend/.env \
node test/helpers/serve-browser-fixture.cjs
```

The environment file is read only in that process. The helper creates a random
schema in `splice_backend_benchmark`, seeds the same financial values/accounts and
126 transactions, and drops the schema when stopped. User dev ports 3000/4000 are
not used. Run the production frontend separately so changing builds cannot trigger
backend/schema cleanup:

```sh
cd frontend
VITE_API_BASE_URL=http://localhost:3101 VITE_DISABLE_DEVTOOLS=true yarn build
NITRO_PORT=4101 NITRO_HOST=127.0.0.1 PORT=4101 HOST=127.0.0.1 \
SPLICE_INTERNAL_API_BASE_URL=http://localhost:3101 NODE_ENV=production \
node .output/server/index.mjs
```

Open a named, task-owned agent-browser session using the normal local login:
`http://localhost:3101/user/dev/login?redirect=/home`. Obtain that session's exact
CDP browser endpoint and page target from its tab listing. Both harnesses require
an explicit origin and target; they refuse an unrelated tab. Do not write a fake
JWT over the dev-login cookies. Close the named browser and both synthetic servers
when finished.

```sh
node scripts/loading-ux-surfaces.mjs "$BROWSER_WS" http://localhost:4101 \
  "$TASK_TAB" scenario.json docs/performance/loading-ux/surfaces
```

Scenario inputs and raw outputs record viewport, delayed/failed request patterns,
actual interaction, layout entries including recent-input entries, anchor bounds,
errors and screenshots. Natural result-cardinality changes, deliberate navigation
or disclosure motion, viewport changes, and asynchronous loading are classified
separately. Zero CLS alone is insufficient: the dialog and Settings corrections
were identified through screenshot/anchor differences despite zero CLS.

## Critical Home and Transactions coverage

The root inspected these real production screenshots and raw measurements:

| Case                                             | Result                                                                                                                                                                                  | Evidence                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Home phone direct,390×844                        | Zero shift entries, zero runtime errors; correct h1 sizing from first paint                                                                                                             | `critical/home-phone-direct.json`, matchingPNG                    |
| Transactions phone direct,390×844                | Zero shift entries/errors; compact Add action, filter control and transaction cards from first paint                                                                                    | `critical/transactions-phone-direct.json`, matchingPNG            |
| Transactions tablet portrait,768×1024            | Zero shift entries/errors; compact list and controls                                                                                                                                    | `critical/transactions-tablet-direct.json`, matchingPNG           |
| Home tablet landscape,1024×768                   | Zero shift entries/errors; wide account columns                                                                                                                                         | `critical/home-tablet-landscape.json`, matchingPNG                |
| Phone period change with4-second dashboard delay | Heading, selector, net-worth and all account-row anchors identical before/during/after; zero interaction shifts; selected Week immediate, balances retained, comparison/chart skeletons | `critical/home-phone-period.json`, `home-phone-period-during.png` |
| Rapid Week→1Y with out-of-order responses        | Year responses completed first; late Week responses did not change the selected period, amount or chart path; zero shifts/errors                                                        | `critical/home-rapid-periods.json`                                |
| Selected-period failure and Retry, wide viewport | Balances and row anchors identical through failure and recovery; zero shifts; dismissible bounded Retry notice; stale comparisons remain unavailable until correct results arrive       | `critical/home-period-error-retry.json`, `home-period-error.png`  |

The failure case rewrites only that browser's selected summary request to a missing
synthetic endpoint, then restores it for Retry. The out-of-order case delays only
that browser's matching XHR requests. These are controlled failures, not production
network errors. Geometry checks use the actual captured viewport; they do not infer
mobile coverage merely from a scenario name after another tool changes the viewport.

The desktop navigation samples measured49px rows with stable row origins and scroll
containers. The later cold direct Transactions supplement exposed a hydration
correction in both builds: the42.7px estimate placed row2 6.3px and row 8 44.1px too
high until measurement corrected their spacing to49px; scrollHeight changed
2178→2309px. The first row stayed fixed and CLS remained zero, so only the retained
anchor trace revealed the movement. The final estimate now matches the measured
49px normal row footprint, while variable-height rows remain measured normally.
Three rebuilt cold and three warmed Transactions samples verify the correction.
All first-eight row origins are identical throughout all three cold samples and
all three warmed samples. The cold scrollHeight correction is now just2493→2492px
(within1px), with clientHeight788 and scrollTop0 unchanged.
Newly appended result rows are natural result growth, not loading-indicator movement.

## Independent review and quality gates

Review found and corrected: compact Add-button first-paint width, Home skeleton
summary spacing, refresh notices covering unrelated editors, and detached retained
summary snapshots ignoring later mutation patches. Retention now observes the source
Query and rejects removed/reset/currency-mismatched cache entries.

Focused verification before browser work passed 145 tests in 23 files; targeted review
regressions and subsequent fixes are recorded in the final timing/audit report.
The full frontend run exercised 471 tests. Two old assertions still expected a
spinner and browser-only Sankey DOM ordering; both were corrected and their 12-test
focused run passed. The Sankey lists now use the mobile reading order in the DOM
while CSS positions inflows first on wide screens. Final combined results follow below.

A further independent failure-path pass removed the redundant uncaught account
module import and added explicit read retries for holdings/activity. Recovery tests
verify the same dialog and selected tab survive the failed read and retry.
Frontend lint passes with three preexisting `require-await` warnings;
frontend typecheck and production build pass. The test-fixture-only backend change
passes backend lint/typecheck and `node --check`.

## Final quality gate

On the final candidate, `yarn test` passes **471 tests in 74 files**. `yarn lint`
passes with no errors and three preexisting `require-await` warnings; `yarn
typecheck` and the production `yarn build` pass. Backend `yarn lint`, `yarn
typecheck`, and the fixture helper syntax check pass. No product backend files,
generated API client, API contract, database schema, or MCP implementation changed.

The parent inspected the corrected checking-account loading/loaded screenshots:
identical modal origin, dimensions, balance row, tabs and Notes positions. The phone
category editor also renders fullscreen with reachable footer actions. Additional
final surface and timing results are linked from the audit and benchmark report.

Independent review loop: four review/fix rounds and final signoff examined implementation and failure
paths; the parent inspected the fixes and browser artifacts. The initial review
corrected four shared-state/geometry issues; the next removed an uncaught import
and added missing holdings/activity retries; the final code pass accepted the
preview, recommendation, and holdings corrections. The final ledger includes the completed timing comparison and supplemental Home
disclosure check; all 64 criteria are verified.

Final Transactions correction: explicit normal-row estimate 49px eliminates the
previous cumulative virtualizer movement (44.1px by row 8). Three rebuilt cold and
three rebuilt warm samples show 0px row-origin movement. Table scrollHeight differs
by only 1px during initial measurement, within the plan's 1px tolerance. The focused
Transactions run passes 18 tests after this correction, and lint/typecheck/build
pass. The strengthened existing recommendation-loading test passes all 14 tests in
its file. No wider test rerun was needed after these bounded final changes.
