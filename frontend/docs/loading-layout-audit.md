# Loading layout audit

Implementation inventory for `plans/instant-navigation-stable-loading.md`.
Code review is not a substitute for browser geometry measurement. Rows below
map implementation boundaries to browser evidence and targeted behavioral tests.
Supplemental Home disclosure/scroll retention is verified below.

| Surface and boundary                                           | Cold / changed query                                                              | Matching refresh                                                                        | Geometry correction / status                                                                                                                 | Reproducible visual check                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Shared PageHeader                                              | Static `h1`; CSS sizes it at compact breakpoint                                   | No resize                                                                               | Removed media-query first-render title resize                                                                                                | Direct load each primary page at 390px and 1440px; compare heading bounds before/after hydration                |
| DataState, MobileTableList                                     | Caller-provided row/table/card skeleton; empty/error occupies same skeleton frame | Existing children retained; hidden busy announcement; bounded fixed refresh-error alert | No in-flow refresh error row; draft/focus retention integration tested                                                                       | Delay request, fail refresh, Retry; measure list start and check alert does not cover needed controls           |
| DeferredFeature                                                | Caller shape or chart/form skeleton                                               | Loaded modules stay mounted                                                             | Default spinner removed; feature failure keeps supplied minHeight                                                                            | Delay/fail module; confirm same-shaped data phase; dialog fallback must remain in overlay                       |
| Home summary + comparisons                                     | Home card/row skeleton and period-only placeholders                               | Balances/identities/disclosure remain visible                                           | Implemented; root critical-route anchor evidence plus Home interaction extras                                                                | Cold, four-second period switch, cached return, rapid out-of-order switch, masked comparison popover            |
| Home optional chart                                            | Hydration-stable chart slot                                                       | Period chart placeholder                                                                | Implemented; fixed responsive chart slot and reduced-motion skeleton                                                                         | Direct SSR and phone load; no summary-node replacement                                                          |
| Accounts groups                                                | Institution/card and row skeleton                                                 | Same groups/disclosures remain mounted                                                  | DataState reserves cold/empty/error frame                                                                                                    | Delay accounts; collapse institution then fail refresh; highlighted-account URL                                 |
| Transactions desktop                                           | Six-row table skeleton                                                            | Same matching rows and selection                                                        | Virtualizer/list flex and progress geometry measured in primary critical-route audit                                                         | Cold/filter/sort/cache, delayed next page, selection, scroll anchors                                            |
| Transactions phone                                             | Shared list fallback                                                              | Same matching rows                                                                      | CSS-selected first-paint branch; footer preserves cached list                                                                                | Direct narrow SSR; filter drawer; infinite-page error and Retry                                                 |
| Analysis summary + donut groups                                | Summary and responsive chart/list skeleton                                        | Matching analysis retained                                                              | Removed center spinner and in-flow error banner; actual summary/group spacing mirrored                                                       | Four-second filter change, cached return, empty range, refresh error/Retry                                      |
| Analysis donut module                                          | Fixed 160px chart skeleton                                                        | Chart remains mounted                                                                   | Same chart height; verify width does not collapse inside flex/grid                                                                           | Slow module with ready data; legend start and card edges                                                        |
| Analysis Sankey module/data                                    | Chart-module fallback uses fixed chart slot; page data uses analysis shape        | Matching cached content retained                                                        | Removed media-query DOM switch: desktop chart, compact bars/padding and list order are CSS-responsive from first paint                       | Enabled Sankey direct load at phone/tablet/desktop; category clicks, empty direction, hydration and card height |
| Settings general                                               | Form uses authoritative user data                                                 | Cached user/draft retained even on refresh error                                        | Whole-page error no longer replaces cached draft                                                                                             | Edit currency/preferences then trigger refresh/failure; ensure unsaved draft unchanged                          |
| Settings notifications                                         | Existing switches remain; disabled while device support resolves                  | No spinner insertion                                                                    | Static controls; device support explanation keeps a bounded two-line slot instead of inserting/removing an alert                             | Direct tab on supported/unsupported browser; observe device-support message and notification error              |
| Settings access                                                | Module settings skeleton; token query form/row skeleton                           | Active form/draft stays on ordinary background fetch                                    | Token fetch stays outside speculation; cached inventory survives failed refresh; initial error uses inventory frame                          | Direct access, delayed token inventory, create draft then failed refresh; do not create real tokens             |
| Settings categories                                            | Toolbar/filter module skeleton; table data skeleton                               | Cached rows, selection, open editor retained                                            | CSS-selected ResponsiveSlot and filter controls stable from first paint; compact actions always 44px                                         | Cold/empty/error, archive filter, selected rows, open editor, mobile categories                                 |
| Settings analysis                                              | Persistent display settings; rules module and table skeleton                      | Rules and editable lookaround stay                                                      | Shared DataState; no spinner                                                                                                                 | Cold rules, search/archive, failed refresh, lookaround draft                                                    |
| Settings categorization                                        | Toolbar/filter module skeleton; table data skeleton                               | Matching rules and draft stay                                                           | Shared DataState; no spinner                                                                                                                 | Cold/search/archive, edit rule, fail refresh                                                                    |
| Settings recurring                                             | Toolbar module skeleton without filter slot; table data skeleton                  | Schedules and open form stay                                                            | Shared DataState; no spinner                                                                                                                 | Cold/empty/error and existing recurring form draft                                                              |
| Account details / overview / history                           | Account details/chart/table shape                                                 | History refresh failure retains cached details                                          | DataState instead of spinner/error replacing entire modal; main body remains mounted                                                         | Open checking, change period, history chart, notes draft, failed history/Retry                                  |
| Investment holdings                                            | One-row holdings shape inside a shared 180px data region                          | Existing holdings retained on refresh error                                             | Shared DataState; empty/error in same frame                                                                                                  | Open brokerage holdings with delayed data, empty holdings, failed refresh                                       |
| Investment activity                                            | Stable count line + three-row table shape                                         | Existing activity retained                                                              | Count keeps same line during initial query; no loading spinner                                                                               | Select activity, delay first/next page, error, load-more Retry                                                  |
| Category transaction drilldown                                 | Same table skeleton as transaction data                                           | Matching rows remain                                                                    | Shared DataState preserves results and error overlay                                                                                         | Open category, cold/empty/error/Retry; phone/desktop                                                            |
| Analysis audit drawer                                          | Four-row audit shape                                                              | Existing audit rows remain on failed refresh                                            | Shared DataState removes in-flow refresh alert, retains cached audit rows, and exposes optional explicit Retry                               | Open delayed audit; empty effects; fail cached refresh                                                          |
| Categorization apply preview                                   | Four-row transaction skeleton                                                     | Preview tied to selected rule only                                                      | 300px scrolling results frame keeps load/empty/error/actions stable; header count slot preserved; explicit Retry                             | Open Apply preview, delay request, empty/failed preview; no real Apply                                          |
| Categorization recommendations                                 | Generation is an explicit mutation and may retain progress                        | Existing recommendations selectable                                                     | Initial read uses DataState skeleton/error; cached suggestions stay; Last run metadata reserves one line; mutation progress remains distinct | Open existing recommendations/preview; avoid generating against real user data                                  |
| Account Add / Backfill / transaction / holdings editor modules | DeferredOverlay uses shared actual editor frames                                  | Active drafts never replaced on fetch                                                   | Overlay loading and failure remain closeable; final Add/Backfill/editor screenshots inspected                                                | Trigger each with delayed code, keyboard dismissal, phone fullscreen shell                                      |
| Security search inside holdings editor                         | Existing input right-section progress                                             | Draft remains editable                                                                  | In-control spinner intentionally retained; fixed right section prevents movement                                                             | Type security query and delay response; input bounds unchanged                                                  |
| Account sync/link, form Save/Delete/Create                     | Existing button-local progress                                                    | Operation-owned pending                                                                 | Mutation progress intentionally retained; do not replace form with skeleton                                                                  | Confirm button size, draft retention and safe failure in existing tests                                         |

## Implemented behavioral evidence

- `DataState.test.tsx`: cold supplied shape is hidden from assistive technology;
  cached refresh/failure preserves the same input DOM node, unsaved value and focus;
  retry remains explicit; initial empty/error distinguished from loading.
- Existing AccountModal, AnalysisAuditDrawer, Accounts and Analysis tests cover
  history errors/retry, cached results, empty periods and direction selection.
- Component skeletons use a single hidden status announcement and CSS disables
  shimmer for `prefers-reduced-motion`. No financial values are fabricated.

## Browser evidence scope

The additional browser evidence below covers Settings, dialogs and read-only surfaces.
Root maintains critical Home/Transactions and repeated before/after measurements in
`docs/performance/loading-ux/`. Natural result cardinality, viewport resize, overlay
opening transitions and explicit user expansion are separate from asynchronous
placeholder/indicator movement. No real financial mutation or external sync was used.

## Additional visual inventory — initial candidate

`frontend/scripts/loading-ux-surfaces.mjs` runs on the task-owned
`splice-loading-surfaces` browser tab at `localhost:4101`, authenticated through
synthetic backend `localhost:3101`. It installs an observer before document scripts,
records layout shifts **including recent-input shifts**, anchor rectangles, document
scroll dimensions, runtime exceptions, intercepted requests and screenshots. These
are visual checks, separate from the repeated performance timing benchmark.

The first pass opened Accounts, Analysis and all seven Settings tabs at 1440×1000,
390×844, 768×1024 and 1024×768: 36 direct-page cases. All four screenshot contact
sheets were inspected (`surfaces/sheet-{desktop,phone,tablet-portrait,tablet-landscape}.png`).
Two Analysis cases showed a 10.27px Audit button width change during hydration;
other pages had no recorded LayoutShift entries. **Zero CLS did not prove stability**:
anchor inspection caught Settings replacing its desktop table with mobile rows and
changing category filter geometry after hydration. Those first-paint branches now
use CSS-selected `ResponsiveSlot`; DateRangeControl's trigger geometry is CSS-based.

Delayed code/data checks additionally exposed mismatched category-section module
skeletons (search/first-row positions), generic Add account and Backfill modal shapes,
and AccountDetails skeletons taller than the actual Overview/Holdings body. These
were reported before fixes. Initial and corrected evidence is retained separately;
corrected cases have `-verified` in the artifact name. A screenshot from an invalid
or incomplete interaction is not counted as an interaction pass; inspect `actionReady`
and actual intercepted URLs in each JSON record.

Activity is unavailable for the fixture's manually valued brokerage by design.
`providerActivityFixture` changes only the browser query-cache valuation flag to
exercise the provider Activity tab, then delays the actual read-only activity GET.
The actual response is empty. This proves the empty Activity UI path only; it is not
backend-performance evidence. A hard navigation discards this browser-only override.
Sankey was enabled through the synthetic user's display preference for one phone
visual check, then restored to false; the API confirmed USD and Sankey disabled.

Populated-rule/token and preview scenarios use explicit browser-only query/response
fixtures recorded in scenario JSON. They do not create records, credentials or
recommendations, submit edits, apply rules, or call external sync services.

## Final focused visual verification

All linked files below are under `docs/performance/loading-ux/surfaces/`. Initial
and intermediate measurements remain for comparison; only the stated successful
final checks are counted. Failed attempts and earlier keyboard cases with
`actionReady: null` are excluded. The final production build was used for the
focused reruns; the clean 36-page initial matrix was not repeated unnecessarily.

| Verified surface                        | Evidence                                                                                                                              | Result                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phone and portrait Analysis header      | `phone-analysis-verified.json`, `tablet-portrait-analysis-verified.json`                                                              | Audit control hydration shift removed; zero shift entries.                                                                                                              |
| Phone/portrait category first paint     | `phone-settings-categories-final.json`, `tablet-portrait-settings-categories-final.json`                                              | Search/filter bounds unchanged; Edit action 44×44 from first frame, same x/y.                                                                                           |
| Delayed Settings categories module/data | `settings-categories-phone-touch-delay-verified.json` and screenshot pair                                                             | Toolbar/search match loaded layout; touch activation, actual 4s intercepted GET, zero shifts.                                                                           |
| Add account / Backfill lazy code        | `dialog-add-account-code-delay-verified.json`, `dialog-backfill-code-delay-verified.json`                                             | Exact modal heights319.39 /524.58px unchanged across code load.                                                                                                         |
| Account Overview / history error        | `dialog-checking-history-delay-verified.json`, `dialog-checking-history-error-verified.json`                                          | Top-anchored dialog retains header and body; checking height321.30px through delayed data; error has Retry.                                                             |
| Investment holdings                     | `dialog-brokerage-holdings-delay-final.json`, `dialog-brokerage-holdings-phone-final.json`                                            | Desktop modal780×491px unchanged; phone fullscreen390×844 with readable one-position list, no desktop→mobile flash.                                                     |
| Investment Activity empty               | `dialog-activity-provider-response-fixture-verified.json`                                                                             | Explicit browser-only provider applicability flag; actual delayed empty Activity endpoint, zero shifts.                                                                 |
| Analysis audit and category drilldown   | `dialog-analysis-audit-data-delay-verified.json`, `dialog-analysis-drilldown-data-delay.json`                                         | Actual delayed read endpoints; persistent audit header and table skeleton, phone drilldown rows.                                                                        |
| Populated Settings rows                 | `controlled-{rule,analysis-rule,recurring,token}-populated-phone.json`                                                                | Browser-only typed data, compact rows visible and usable; no writes.                                                                                                    |
| Apply preview empty/error               | `controlled-preview-empty-delay-final.json`, `controlled-preview-error-final.json`                                                    | Modal height791.875px retained; bounded300px result area, error Retry, stable action row (subpixel text-width difference under1px). No Apply clicked.                   |
| Recommendation inventory read           | `controlled-recommendations-populated-delay-final.json`                                                                               | Initial skeleton replaces false-empty/Generate flash, Regenerate disabled until data; stable metadata line; existing suggestion card appears. No generation/acceptance. |
| Editors                                 | `editor-{analysis-rule-tablet,categorization-rule-desktop,holdings-desktop,recurring-phone-verified,transaction-tablet-verified}.png` | Actual form layouts inspected at desktop/phone/tablet; no submit. Normal modal opening transforms are intentional motion, not load movement.                            |
| Failed lazy module                      | `dialog-add-account-code-failure-final.json`                                                                                          | Failure stays in closeable phone overlay; actual Close was verified before navigating away.                                                                             |
| Cached token draft and explicit Retry   | `interaction-extras-final.json`, `cached-token-draft-failure-final.png`                                                               | Unsaved text, input DOM identity and focus retained after failed refresh; cached token row remains. Retry preserves draft.                                              |

Limits: Activity browser coverage uses the actual empty response, not populated
provider activity; populated rows and recommendations are controlled UI fixtures,
not backend correctness/performance results. Initial skeleton-to-different-result
cardinality can change the size of result regions that intentionally grow with
content; controls above those regions remain anchored. Mutation-local progress and
security-search input progress are retained intentionally. Unit tests cover data
refresh failures, empty states, open editor drafts and mutation behavior without
submitting synthetic or real financial changes in the browser.

Keyboard final check: `surfaces/editor-category-keyboard-final.json` records native
Enter keypress activation of Add category, `actionReady: true`, zero shift/error
entries and the actual fullscreen form. Earlier failed keyboard attempts lacked
the native Enter keypress text and are harness failures, not application failures.

Supplemental Home disclosure/scroll check passed on the final build after timing:
[`home-disclosure-scroll-final.json`](performance/loading-ux/surfaces/home-disclosure-scroll-final.json)
records Liabilities collapsed and scrollY20 before, during and after Month→Week.
The selected input and URL both changed to Week; both dashboard series/summary
GETs were delayed4000ms. The earlier scrollY50 probe clicked the fixed header
covering the selector and is retained as incomplete harness evidence.

The visual browser session was closed and the synthetic preferences verified as
USD, Sankey disabled, with no masking override before the final timing run.
`surfaces-index.json` is a compact machine-readable record index; failed attempts
and incomplete interactions are retained transparently but excluded from passes.

Evidence navigation: [complete record index](performance/loading-ux/surfaces-index.json),
[desktop contact sheet](performance/loading-ux/surfaces/sheet-desktop.png),
[phone contact sheet](performance/loading-ux/surfaces/sheet-phone.png),
[portrait tablet contact sheet](performance/loading-ux/surfaces/sheet-tablet-portrait.png),
[landscape tablet contact sheet](performance/loading-ux/surfaces/sheet-tablet-landscape.png),
and [primary-route validation](performance/loading-ux/validation.md).

Final holdings empty/error follow-up: `dialog-holdings-empty-final.json` and
`dialog-holdings-error-final.json` use the rebuilt180px results region. Both have
zero shift/runtime-error entries and the same780×491px modal shell as populated
holdings. Empty text and error Retry were visually inspected. The browser was
closed again after these final read-only checks.
