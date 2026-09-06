# Loading UX benchmark

A new three-sample production-browser benchmark for
`plans/instant-navigation-stable-loading.md`. Historical seven-sample harnesses and
readers are unchanged. All records contain synthetic fixture data.

## Protocol

- Exact task-owned Chromium tab and supplied origin; normal dev-login cookies.
  Frontend `http://localhost:4101`, backend `http://localhost:3101`. The harness never
  writes a JWT or changes the backend. No providers or syncs are called.
- Desktop 1440 × 1000, device scale 1, 2× CPU throttle, 80ms latency,
  1,000,000 bytes/s download, 500,000 bytes/s upload. Browser cache is cleared before
  each fresh document; query state resets naturally with the document. Cold means
  browser/document cold: the production server remains running and warmed.
- Three runs each: cold Home, immediate Transactions, five-second idle-prepared
  Transactions/Accounts/Analysis/Settings, cached Home/Transactions, stale Home
  after a real 31-second wait, and Month→Week Home comparison. Total: 30 samples.
- Three additional cold direct Transactions samples check the heaviest SSR route.
  These use the reseeded fixture on both sides, the same profile, and a 1500ms
  post-useful observation for row/scroll geometry.
- Three supplementary whole-document Home→Analysis runs include all requests from
  initial navigation through settled Analysis, including intent preparation before
  a measured link click. They also explicitly time Analysis's first rendered chart.
- Real CDP pointer input opens the desktop drawer, waits for a visible link, then
  clicks it. Link-click timing includes normal foreground navigation; opening the
  drawer can trigger the app's normal preparation. Invisible links are not clicked.
- Useful means financial values plus fixture accounts/rows, or actual Settings form
  content. A heading or spinner alone is insufficient. Chart readiness is separate.
- A PerformanceObserver is installed before app scripts. Raw traces retain every
  layout shift, including `hadRecentInput`, plus heading/control/card/chart bounds,
  all three account origins, first eight transaction rows, and document/ancestor
  scroll dimensions and positions. CDP records request/code/data order and bytes.
  Response bodies, cookies, and auth headers are not stored.

Investigate a cold useful-content median regression exceeding **both 10% and 50ms**.
Every nonzero shift needs classification. `ordinaryCls` sums non-recent-input shifts
within each short measured window; `interactionShiftSum` also includes recent input.
These are controlled windows, not a site-wide Core Web Vitals score.

## Commands

Run from `frontend`, substituting the assigned browser websocket and exact tab ID.
Browser/CDP commands require the same sandbox escalation as agent-browser.

```sh
SPLICE_LOADING_LABEL=before node scripts/loading-ux-browser.mjs "$TASK_BROWSER_WS" http://localhost:4101 "$TASK_TAB_ID" docs/performance/loading-ux/before.json
SPLICE_LOADING_LABEL=before SPLICE_LOADING_MATRIX=resource node scripts/loading-ux-browser.mjs "$TASK_BROWSER_WS" http://localhost:4101 "$TASK_TAB_ID" docs/performance/loading-ux/before-resources.json
SPLICE_LOADING_LABEL=before SPLICE_LOADING_MATRIX=cold-transactions node scripts/loading-ux-browser.mjs "$TASK_BROWSER_WS" http://localhost:4101 "$TASK_TAB_ID" docs/performance/loading-ux/before-cold-transactions.json
# Repeat with label after and after.json / after-resources.json / after-cold-transactions.json.
node scripts/loading-ux-summary.mjs docs/performance/loading-ux/after.json docs/performance/loading-ux/after-summary.json docs/performance/loading-ux/before.json
node scripts/loading-ux-summary.mjs docs/performance/loading-ux/after-resources.json docs/performance/loading-ux/after-resource-summary.json docs/performance/loading-ux/before-resources.json
node scripts/loading-ux-classify.mjs docs/performance/loading-ux/after.json docs/performance/loading-ux/after-shifts.json
node scripts/loading-ux-summary.mjs docs/performance/loading-ux/after-cold-transactions.json docs/performance/loading-ux/after-cold-transactions-summary.json docs/performance/loading-ux/before-cold-transactions.json
node scripts/loading-ux-classify.mjs docs/performance/loading-ux/after-resources.json docs/performance/loading-ux/after-resource-shifts.json
node scripts/loading-ux-classify.mjs docs/performance/loading-ux/after-cold-transactions.json docs/performance/loading-ux/after-cold-transactions-shifts.json
SPLICE_LOADING_LABEL=after-final-row-estimate SPLICE_LOADING_MATRIX=warmed-transactions node scripts/loading-ux-browser.mjs "$TASK_BROWSER_WS" http://localhost:4101 "$TASK_TAB_ID" docs/performance/loading-ux/after-warmed-transactions.json
node scripts/loading-ux-summary.mjs docs/performance/loading-ux/after-warmed-transactions.json docs/performance/loading-ux/after-warmed-transactions-summary.json docs/performance/loading-ux/before.json
node scripts/loading-ux-classify.mjs docs/performance/loading-ux/after-warmed-transactions.json docs/performance/loading-ux/after-warmed-transactions-shifts.json
node scripts/loading-ux-report.mjs docs/performance/loading-ux
```

The harness restores network/CPU throttles and detaches its CDP connection. The
browser remains assigned to the owning task for visual checks; that owner closes
it after all browser work.

## Baseline findings

Thirty core samples: Home useful 789ms/chart 1852ms; immediate Transactions 966ms;
idle-prepared Transactions 643ms, Accounts 121ms, Analysis 119ms, Settings 149ms;
cached Home 31ms, cached Transactions 104ms; stale Home 46ms; Week comparison 114ms.
Supplementary Analysis useful 171ms/chart 475ms. Cold direct Transactions is
843ms with zero shifts across its three samples. These are medians.

Month→Week inserts/removes the old status row, moving retained cards/account origins
**32.296875px down and back up** in every sample. All six entries have recent input,
so ordinary CLS misses them. The other 218 core shifts and 30 supplementary shifts
match the user-opened drawer closing: sourced changes are horizontal, within its
short transition, and supported by anchor traces. Source-less entries are explicitly
classified as inferences from adjacent sourced entries and the same horizontal
anchors. Every entry appears in the classification JSON; none is silently omitted.

The navigation samples show 49px transaction rows that are stable after mount,
with a 2309px scrollHeight, 788px clientHeight and scrollTop 0. The later **cold
direct Transactions supplement exposed a separate hydration correction** on both
builds: the 42.7px virtualizer estimate placed row2 6.3px too high and row8 44.1px
too high until measurement corrected the spacing to 49px. Its scrollHeight changed
2178→2309px. Row1 stayed fixed and CLS reported zero, but the retained row anchors
proved visible movement. This finding required an explicit 49px initial estimate,
followed by three rebuilt cold and three warmed Transactions checks.

## Fixture continuity and limits

Stopping the old fixture-managed frontend also stopped its backend. The initial
candidate attempt therefore reached a session-unavailable error boundary and
produced no valid sample. The owner recreated the same semantic fixture with
independent frontend management. Normal dev-login was renewed, and API readback
confirmed net worth 751704 USD minor; checking 500000; ETH 1000000000000000001
converted to 248000 USD; brokerage 3704; 126 transactions, 50 on the first page,
first activity date 2026-09-05, comparison end date 2026-09-06. Random UUIDs and
relative last-sync text differ, so small payload differences can reflect reseeding.

Three samples are a short controlled comparison. Browser API counts exclude
individual backend calls inside SSR, whose time is included in the document.
The whole-document supplement is the authoritative idle/intent byte comparison:
ordinary link windows omit requests started before the click. Bytes count completed
transfers through a fixed settled window, not memory use. Runtime exceptions and
failed requests are recorded; the later harness also records caught console errors
and warnings after the infrastructure preflight exposed that additional seam.

Phone/tablet, keyboard/touch, delayed/error recovery, and broader visual checks are
owned by the accompanying [visual validation](validation.md) and loading audit. This harness does not claim those checks.
Changes are frontend-only; no backend or MCP speed improvement is claimed here.

## Diagnostic candidate

`after-contended.json` preserves two complete diagnostic runs (20 samples). It is
not the release comparison. Discretionary Transactions code/data began 32ms after
Home chart imports, delaying the shared Recharts download: first-run Home chart
1901ms → 2305ms while summary usefulness stayed825ms → 819ms. The implementation
was changed to protect foreground chart code before scheduling discretionary work.
Both diagnostic period samples already had zero loading shifts. The third run
stalled during Chrome cache reset and was stopped; no incomplete sample is counted.
The final run uses a fresh task-owned browser of the same installed Chromium build,
with identical viewport/throttling and no leftover observer scripts.

The final core capture also hit a Chrome document-reset timeout after twelve
complete samples, while the tab was `about:blank` with no requests or application
error. `after-reset-partial.json` preserves those samples and the failure record.
The remaining eighteen samples resumed in a fresh browser, with normal dev-login,
using `Page.stopLoading`, cache clearing, and direct document navigation instead
of the intermediate blank page. The twelve completed samples were retained
verbatim; no incomplete sample or repeated stale wait was counted.

## Final comparison and targeted correction

[Measured comparison](comparison.md) reports the navigation gains, request/byte
costs, cold-route checks and every retained-anchor limit. The thirty core samples
plus six supplements preceding the virtualizer correction are preserved under
`after-previrtualizer-*`; the rebuilt cold/warmed Transactions supplements verify
that final correction. Other measurements are retained and explicitly identified
as preceding this one-line estimate change. `anchor-review.json` complements
shift classification so zero CLS cannot hide transformed-row movement again.

Final Transactions row1–8 origins are identical before/after hydration in all three
cold samples, at y238.484375 through581.484375 in49px increments. ScrollHeight changes
2493→2492px (1px, within the acceptance limit), clientHeight stays788 and scrollTop
stays0. Warmed rows likewise have zero vertical movement. Cold Transactions median
is826ms versus843ms; prepared Transactions109ms versus643ms. The first rebuilt cold
sample was1215ms; it remains in the raw data and was not discarded. All three-sample
cold medians remain within the agreed regression threshold.

The whole-document Home→Analysis supplement measures38 additional requests:36
additional code/resource requests and2 API requests, with427.7KiB additional
transfers (65.0KiB API bytes). The additional API work is the first Transactions
page and Accounts; the Analysis request moves earlier and is reused at navigation.
No extra transaction pages or access-token inventory are fetched.

The console observer recorded Recharts initial-size warnings while its responsive
container initializes. Rendered charts have positive dimensions and stable anchors;
there were no runtime exceptions or failed requests. The original baseline did
not record console warnings, so warning-frequency parity is not claimed.
