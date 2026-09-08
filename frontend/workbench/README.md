# Splice component workbench

## PWA launch screen

`/?frame=true&example=launch-screen&state=checking&mode=oled&width=430`
shows the public session-checking surface. `state=native` removes the spinner and
status while keeping the brand in the same position for native startup artwork.
Browser-inspected at 320×568, 430×932 (iPhone 14 Pro Max), 932×430, and 1032×1376.

Run `yarn pwa:splash` with the workbench running to regenerate the versioned PNGs
from this production component. `src/lib/pwa/startup-images.ts` is the shared
device/media-query registry: 23 size/scale combinations, each in portrait and
landscape. The generator checks physical PNG dimensions, including 1290×2796
for the 14 Pro Max. Native iOS launch behavior still requires device validation;
the workbench verifies rendering, not iOS startup-image caching.

After `yarn build`, `yarn pwa:launch-test` verifies immediate public HTML without
an API wait, the loading state during a held session response, authenticated Home
navigation, logged-out Google login, transient-error Retry, hydration, and direct
private-route SSR/authentication using synthetic users.

## September 8 lifecycle and Home validation

Browser-inspected the production examples using Chromium at 320×800 (Light/OLED
update idle, pending and failure), 390×844 (OLED Home and notifications),
744×1000 (Light blocked update), and 1440×900 (Dark Home/update and Light inbox),
with accent `#bf927a`. Update labels fit; the settled loading spinner stays inside
the button and errors restore the action. The blocked action is disabled.
With `page-home&latency=1500`, Week selection produced identical period-control,
Assets and Liabilities anchor positions before, during and after loading at phone
and desktop widths. Notification header icons measured 20px inside 44px targets
on phone and 18px inside 34px targets on desktop. Clear all emptied the inbox;
Escape restored focus to the bell. The empty bell and logout shared the same
neutral foreground. No browser runtime errors were reported. This validates UI
fixtures, not native iOS service-worker registration or installation.

## App update notice

`/?frame=true&example=pwa-lifecycle&state=update&mode=oled&width=320`
shows the neutral production notice with a full-width phone action. Click Update
to inspect its 2.5-second loading state; the fixture then dismisses the notice
without navigating. `state=update-error` fails after the same delay so retry and
error feedback can be inspected. `blocked-update` exercises the edit guard.

## Manual save recovery

`/?frame=true&example=manual-save&state=lost-response&mode=light&width=390`
opens the real transaction editor with a complete synthetic draft. Save once to
simulate a committed write whose response was lost. The warning blocks another
save until an explicit read check; a matching entry can be accepted with Done.
The `offline` state rejects before changing the fixture store; `reconcile-error`
commits the write but fails the subsequent read, leaving repeat submission blocked.
All states use generated TanStack mutations and a per-document in-memory store.

## Notification inbox

`/?frame=true&example=notification-inbox&state=ready&mode=light&width=390`
opens the production bottom sheet directly. Its states include `loading`,
`empty`, `error`, `refresh-error`, `refreshing`, `pending`, `mutation-error`,
`clearing`, and `clear-error`.
Read and dismiss use separate icon buttons; opening a row follows its local
fixture destination. The example keeps its transaction count independent from
the unread indicator and has no retention footer.

The header bell in `page-home` exercises the production query/mutation wiring
against the per-frame notification store. `latency=800` and `failure=writes`
cover pending actions and failures; no system notification permission or push
subscription is requested. `notification-store.test.ts` verifies repeat actions,
failed writes, and frame isolation. Production query and menu tests cover cursor
pagination, summary deduplication, authentication changes, deferred navigation,
focus restoration, and failed-write retention. Browser inspection remains part
of the implementation validation matrix; these fixture registrations alone do
not establish visual correctness.

Before the inbox addition, all 84 rendered components and registered state choices have reviewed coverage. Nonvisual helper exclusions and tests are documented in `catalog.md`. Final checks pass (590 frontend tests, typecheck, token guard, app/workbench builds; lint has three existing warnings). `../docs/appearance-visual-validation.md` records the final matrix and supersedes historical pending notes below.

Run from `frontend/`:

```sh
yarn workbench        # localhost:4001, no backend required
yarn workbench:build  # static output in .workbench/
```

The workbench contains 40 examples, including real Home, Accounts, Transactions,
Analysis, Settings and landing routes; account dialogs; controls/status;
interactive rows/retained errors; editors/nested pickers/confirmation; and chart
compositions. `catalog.json` maps 93 rendered components to examples. Registration
is checked against exported JSX components in `src/components`; the completed
initial visual/state review is recorded in the validation document above. Catalog membership alone is not proof
that every interaction has been verified.

Examples import production components and styles. The shared `vite-css.ts`
expands the same responsive media conditions in both builds. Comparison frames
have separate documents, including their Mantine variables and portal roots.
Load Mantine and Mantine React Table styles before application CSS, matching the
production root. Authenticated page examples mount the production `AppShellLayout`, including
header, navigation and Main padding variables; height-constrained Settings
tables otherwise collapse despite appearing in the accessibility tree.
Do not add workbench routes under `src/routes` or fixture imports to production.

Stable URLs use query parameters:

- `/?example=history&mode=dark&state=loading&width=390`
- `/?example=editors&mode=light&compare=true&width=744`
- `/?frame=true&example=rows&state=refresh-error&masked=true`

`frame=true` renders the example directly, suitable for browser screenshots at an
actual viewport. Other controls include `motion=reduce` and `masked=true`.
Mode and accent controls use the new pure resolver. Use `accent=neutral` or a URL-encoded six-digit hex value; the token inspector shows resolved values.

Register examples through the modules collected by `examples.tsx` with stable ID, title, real component names,
and meaningful supported states. Update `catalog.json` and `catalog.md` together.
Use synthetic fixtures only. Fetch and XHR are fail-closed and report an alert
for unexpected requests; production API calls must receive explicit local mock
handlers before being added. Never mount bank-link or notification permission
side effects. Page examples use memory routing, per-document session/query data,
and presentation state. Vite substitutes workbench-only boundaries for appearance
persistence, login, browser notifications and PWA operations. Real component
providers still render the interface, including theme previews in portals, but
the adapters never write application cookies or local storage.

Keyboard walkthrough: Tab through controls and independent row actions, open an
editor, open its picker, dismiss with Escape, then open its confirmation. Check
focus restoration, foreground/background, clipping, and responsive sizing.
The phone date drawer and confirmation should consume the first Escape and keep
their editor open. In the position editor, type a search, use Arrow Down to enter
the result buttons, Tab between results, and Enter to select; Escape returns to
the search field without closing an enclosing editor.

## Shared control coverage

The Analysis and Transactions page examples cover `DateRangeControl` with
`growOnMobile`: the date trigger fills the Analysis toolbar and shares one row
with the Filters icon in Transactions. Desktop keeps the normal fixed width.
In Transactions, enter Bulk edit to review the selection count on the first row,
with category selection and Save on the second row. Toggle the header's bulk
selection action again to exit selection mode.

[Controls and status](http://localhost:4001/?example=controls) is the shared
primitive reference: segmented selector, text/decimal/number inputs, select and
multi-select, autocomplete, textarea, color/file inputs, checkbox/radio/switch,
button variants, icon/close/menu buttons, burger, tabs, navigation links and date
range picker. The segmented selector also appears in
[Compact touch targets](http://localhost:4001/?example=touch-controls), with its
target boundary overlay and disabled state.

Specialized controls remain in their production compositions: account/category
pickers in category-inputs and editors, Home periods in interaction-surfaces, and page
actions in page and touch examples. The exported-component catalog does not
enumerate Mantine primitives or guarantee every interaction state. When adding
or changing a shared primitive, update Controls alongside the relevant real
composition; use touch-controls for target geometry and touch state comparisons.

## Baseline findings

- 2026-09-06: desktop `DateRangeControl` inside `EditorModal` clips the upper
  calendar when the popover flips above its trigger. The non-portal popover and
  modal overflow were corrected with a portaled, viewport-shifted picker and isolated Escape handling. Screenshot:
  `/tmp/splice-workbench-editor.png` (temporary local evidence).
- App/workbench production builds, TypeScript check, lint (three existing warnings), and all 531 frontend tests pass. This was an early checkpoint; registry, API fixture and CI work has since
  progressed as documented below. The final browser matrix remains pending.

## In-memory API examples

Dashboard ranges use deterministic, distinct date spans (All uses the synthetic
6,000-day history). Day has two daily endpoints, avoiding duplicate tooltip dates.
Account balances, net worth, change amounts and graph endpoints reconcile. These
are synthetic inspection data, not simulated investment returns.

The workbench Vite resolver replaces the generated client's `src/api/axios`
request boundary with `fixture-api.ts`. The production hooks, mutation handlers,
query invalidation and components are unchanged. Each frame owns a fresh
QueryClient and cloned fixture store; edit/archive/balance changes round-trip
only within that document. Reloading resets them. No database or authentication
is involved. Unknown paths (including bank linking)
raise a visible error without opening a connection.

`latency=800` or `latency=3000` delays handled requests; `failure=reads` and
`failure=writes` produce deliberate 503 responses. Requests support cancellation.
Examples with local callback data additionally expose their own empty/error/
disabled states. Stable examples added in this pass:

- `/?frame=true&example=account-management&mode=dark&latency=800`
- `/?frame=true&example=account-overview&mode=oled&masked=true`
- `/?frame=true&example=status-colors&mode=light`
- `/?frame=true&example=investments&mode=light`
- `/?frame=true&example=positions&state=error`
- `/?frame=true&example=category-inputs&mode=oled`

Manual transactions support create, edit, reporting-date override/reset, category
changes and delete. These writes mutate only the current fixture store; refetches
use the production query hooks. Provider transactions cannot use manual edit/delete
operations. Date/category/sign filters use the edited values. Settings, bulk and portfolio mutations described below are implemented. An
unmocked request remains a visible missing fixture, not a successful operation.

Category management supports create, update, archive/restore, search, duplicate,
and bulk changes with partial results. Duplicate labels produce a conflict
response; archived choices remain visible on historical transactions. Phone
create/archive/restore and desktop table rendering have been checked. Rule and recommendation fixtures are documented below; full visual/state review
remains pending.

Run `yarn test workbench --maxWorkers=2`, `yarn tokens:check`, and
`yarn workbench:build`. CI runs those checks. The account-card
legacy component has no masking prop; its fixture tile is labelled accordingly.

## Recurring and access lifecycle fixtures

The real Settings panels use `settings-store.ts` through the same fixture request
adapter. Recurring schedules support create/update/pause/resume/archive, with a
deterministic next monthly date (including short-month clamping). The workbench
never runs a scheduler or generates financial transactions. Access tokens support
create/reveal/revoke; revealed values begin with
`workbench-only-not-a-credential-` and cannot authenticate anywhere. List responses
exclude the revealed value, matching the one-time reveal UI.

The normal latency and write-failure controls apply before all lifecycle mutations.
Three tests cover per-instance isolation, one-time token response shape, monthly
preview behavior and failed-write integrity. The OLED phone browser has verified
reveal/revoke, schedule pause/resume and edit/save. Complete mode/viewport coverage remains pending; rule-management fixtures are
documented below.

## Transaction bulk fixtures

Use `/?frame=true&example=page-transactions&state=refresh-error&mode=dark`
for a retained-error composition. Leave the global API failure setting at None,
enable Bulk edit, select a provider transaction, and click **Fail transaction
refresh**. The real page retains its data and selection while showing its normal
retry notice. **Restore transaction reads** refetches the same query without
resetting selection or remounting the page. This runtime failure affects only
transaction-list reads in the current frame; reload resets it.

The failure/recovery sequence has been checked at 390/744/1133/1440px across
Light, Dark and OLED, with retained selection, no horizontal overflow, no runtime
errors and zero confirmed axe violations. Transparent row hit areas still require
manual contrast review. These controls appear only in this workbench state.

Provider transactions support bulk category assignment, clearing and Undo through
`transaction-bulk-store.ts`. Manual records remain untouched, matching the real
endpoint. The whole selection is validated before mutation; Undo restores the
original assignment metadata and refuses unavailable original categories. Undo
references are local preview handles, not production-signed tokens.

Four tests cover provider/manual behavior, invalid selections, per-instance undo
isolation and write failures. Phone browser validation confirms selection, save,
selection reset and Undo. Let the notification's entry animation settle before
clicking Undo in automated captures; clicking immediately can miss the moving
button. The successful check compared both the rendered row and the exact fixture
module instance. Vite HMR query suffixes matter when inspecting a module: importing
an unversioned URL can create a separate fixture store.

## Rule manager fixtures

`rule-store.ts` supports create/edit/archive/restore for analysis and categorization
rules. It resolves analysis scopes and target categories to the production view
shapes and preserves conditions, priorities and revisions. The 744px Light browser
has verified analysis edit/save/archive/restore and categorization edit/save.
Three tests cover these round trips, fixture isolation and failed writes.

Rule application previews and application to historical fixture transactions now
support text, account, sign and exact amount matching, while preserving manual
assignments. Three additional tests cover read-only previews, application and
manual protection. The 390px Dark browser verified a preview with one eligible
transaction and the resulting Updated 1 confirmation, without browser errors.

Recommendations now support deterministic generation/regeneration, ignored category
filters, preview, acceptance and dismissal. Accepting creates a local rule; it does
not apply categories to transactions. Stale or already-handled suggestions reject
repeat actions. Regeneration completes synchronously after the configured request
latency; no model or background job runs. The fixture is an inspection scenario,
not a recommendation algorithm. Three tests cover these flows, frame isolation
and failed writes. The Light phone browser verified generation, nested preview,
acceptance, regeneration and dismissal.

The recommendation preview suspends its parent drawer's focus trap and Escape
handler; the first Escape returns to the drawer, and the next closes it. The
production component test protects that behavior. A priority badge found during
this walkthrough now uses the shared neutral status colors.

The generated CategorizationRuleChangePreview model has no rendered frontend
consumer; its backend-only helper is not a missing workbench interaction. The
static analysis chart/audit fixtures still do not recompute when a rule changes;
do not treat that page as proof of rule-engine correctness. Complete visual/state
review remains open in the implementation plan.

The Controls example includes unchecked/checked/indeterminate checkboxes, radio
choices and on/off switches. `state=pending` disables the choice controls and
shows the submit loader. Verify both the outline and the thumb/indicator: an
accent can be readable as a button while a default white switch thumb disappears.
Allow the client-rendered frame to settle before capturing; do not use a screenshot
taken immediately after `open` as evidence of settled appearance.

## Manual portfolio fixtures

`investment-store.ts` registers newly created accounts for detail, holdings and
activity reads. Manual brokerage creation, replacement and refresh round-trip
through generated hooks and the per-frame store. EXM uses a fixed EUR 42.1234
quote; ZERO uses a fixed USD 0 quote. Fixed inspection exchange rates support
USD/EUR/SGD/GBP/JPY; other currencies reject visibly. No quote provider is called.
Refresh revalues the current quantities at these fixed prices; it does not invent
market changes. Exact decimal calculations reconcile holdings totals and account
balances, rounded only to the destination currency's scale.

Invalid positions are rejected before replacing any holdings. Deliberate latency
and write failures apply before mutations. Four tests cover creation/readback,
replacement/refresh, exact totals, frame isolation, the editable scenario and
failed-write integrity.

`?frame=true&example=account-dialogs&state=holdings` seeds a manual two-share EXM
portfolio and opens the real AccountModal. Use Edit holdings for the nested editor
and Refresh prices for revaluation. Adding `failure=writes&latency=500` retains
the edited draft and exposes the real failed-save alert. This replaces the old
standalone editor's no-op save callback. The 744px Dark browser verified edit/save
and refresh; the 390px Light browser verified failure preserves the draft and
original balance. Bank-link and sync-all integrations remain fail-closed.

## Addressable nested overlay states

The editor example offers `confirm-ready`, `confirm-pending`, and `confirm-error`
to open confirmation above the actual editor. Its ordinary `pending` state disables
the draft and dismissal; ordinary `error` retains the draft on submission.
`validation-pending` combines an inline validation message with a disabled draft
and pending submit, making that difficult state directly reproducible.
The example follows the production form → Stack → FormActions structure, including
the sticky phone footer. Escape from confirmation returns to the editor.

The deferred example offers `overlay-ready`, `overlay-loading`, and `overlay-error`.
Loaded content owns its dialog, matching DeferredOverlay's production contract;
loading and failure use the shared fallback dialog. Close is available in each
state. Deliberate chunk failures are expected fixtures, and Reload repeats the
selected scenario rather than silently changing its result.

Stable capture URLs:

- `/?frame=true&example=editors&state=confirm-error&mode=light`
- `/?frame=true&example=deferred&state=overlay-loading&mode=oled`

Settings examples include a section selector. Use `tab=categories`, `tab=analysis`,
`tab=categorization`, `tab=recurring`, or `tab=access` together with `state=empty`
to inspect data-backed empty panels directly; `tab=general` and `tab=notifications`
remain available. Example:
`/?frame=true&example=page-settings&tab=categories&state=empty&mode=light`.
The production Settings route validates the tab, and comparison frames receive the
same section. Unknown tabs fall back to General.

## Chart gesture checks

Use the Home or history example for chart interaction changes. On touch devices, tap selects immediately; horizontal scrubbing tracks the nearest point and keeps the selection after release. The touch tooltip stays above the chart while a vertical guide marks the point. Outside presses, vertical scrolling, cancellation and data/range changes dismiss inspection. Verify that masking remains intact and yearly labels include the year.

Check mouse hover/click/drag and keyboard arrows/Escape separately. Tooltip position should update without a transition lag. Use native touch input in a mobile browser or emulated device rather than treating a mouse click as proof of touch behavior. Workbench fixtures cover interactions; also test real Home data when changing chart selection or range handling.

## Tint and interaction review

`/?frame=true&example=interaction-surfaces&mode=dark&accent=%23ce9a7e`
puts the real Home period control alongside shared secondary actions, menus,
inputs, a picker, navigation, tabs and segmented controls. Use `state=extended`
for the selected More trigger and `state=disabled` for disabled sample controls.
Hover an unselected period beside the selected period, hover the selected period,
open the menu and move with arrow keys, then Tab through controls. Repeat in
Light/Dark/OLED with Neutral and a warm/cool accent. Use `account-overview` for
real account cards and row hovers. Status badges/destructive actions are comparison
anchors and retain semantic colors. These are live interactions, not simulated
hover classes; loading the URL alone does not verify them.

The compact `page-transactions` example renders the page list edge-to-edge:
date header backgrounds, row hit areas and dividers reach the shell edges, while
rows remain transparent and their text and actions retain the previous inset. Check ready and refresh-error
with Bulk edit enabled. Dialog/drilldown examples remain contained. Desktop keeps
its table layout. This is part of the existing real-page fixture, not a replica.

Input border experiment: `editors` and `controls` now show borderless resting
inputs. Focus still shows the accent border; `state=error` preserves validation
borders. Check ready/error/pending against each base mode. Border width remains
reserved to avoid a layout shift on focus.

Bordered default/outline buttons and action icons also use transparent borders;
keyboard focus rings remain. Compare these in controls and interaction-surfaces.

The `page-accounts` real-page example now uses subtle Sync all, Backfill and Add
account buttons. Inspect these alongside the existing subtle row actions.

## All pages side by side

Choose **View → All pages side by side**, or open
`/?view=pages&mode=dark&accent=%2386aee0&width=390`.
Home, Accounts, Transactions, Analysis and Settings render in separate interactive
frames. Shared theme, accent, width, masking, motion and API controls apply to
all five. Settings section also works here. Unsupported component states fall
back to each page's first state. Theme comparison is disabled in this view.

## Shared page layout checks

Home account sections and Accounts institution sections share
`SectionToggle.module.css`: hovering, pressing or keyboard-focusing a section
brightens its chevron without filling the header background.

Use `view=pages` to compare the non-Home headers. Accounts: one icon plus More on
phones; three labeled actions on desktop (a lone overflow action is promoted).
Transactions: Add and Bulk edit are both directly visible; Bulk edit
replaces filters; toggling the header action again restores them. Settings: mobile section selector replaces
tabs, and Categories/rule/Recurring Add actions appear in the page header. Switch
sections to check that old actions and filters disappear. General/Access forms
retain their own submission controls. Analysis keeps Audit in the title row and
dates in the toolbar. Existing Home examples are unchanged by this layout pass.

Validated September 7, 2026: Accounts in Dark/Warm clay at 390, 744 and
1280px; Transactions in Dark/Warm clay at 390px and Light/Slate blue at 320
and 1280px; Analysis in OLED/Slate blue at 390px; Settings in Light/Slate blue
and Dark/Warm clay at phone and desktop widths. Checked action overflow,
bulk selection/Done, full-width mobile rows, section navigation, and removal
of section actions/filters. Real local Accounts opened its Add dialog; real
Settings changed from Categories to General with the route updating. No data
was saved. PageActions tests cover action limits, pending overflow and section
unmount cleanup.

The workbench uses `node_modules/.vite-workbench` for dependency optimization.
Keep its cache separate from the main app so simultaneous dev servers do not
invalidate each other's optimized imports.

## Compact touch target review

Open `/?example=touch-controls&mode=dark&width=390` (ready or disabled), or
`/?frame=true&example=touch-controls` at the actual viewport. Toggle Show target
boundaries, tap checkbox padding, clear/reselect inputs, open the menu and inspect
focus. Check 1280px with a coarse pointer as well as a normal desktop mouse.
The dedicated example intentionally includes xs controls: shared defaults must
keep them tappable. Use page-accounts to check the single touch action menu,
page-transactions for table actions, page-home for range/graph interactions, and
page-settings for row and form density. See the [touch audit](../docs/touch-interaction-audit.md).

## Typography

`/?example=typography&mode=dark&width=390` renders every production type role and
its canonical metrics, plus a section/row/input composition. The role definitions
are the source of the sample labels too. Compare 390px and 1280px for page-title
responsiveness, and use the all-pages view to evaluate hierarchy. See
`../docs/typography-audit.md` for the migration, size choices and actual checks.
New typography must be a named role; `yarn tokens:check` rejects local overrides.

## Page density review

The all-pages view remains the maintained comparison of production compositions.
Accounts, Settings and Analysis now support `state=long-content` in addition to
ready/empty. General uses its real form; Settings lists share SettingsRowActions.
Useful captures (add `frame=true` for an actual browser viewport):

- `/?example=page-accounts&state=long-content&mode=dark&width=320` — manual, linked,
  disconnected and long names; open the menu to rename or inspect confirmation.
- `/?example=page-settings&tab=general&mode=light&width=390&failure=writes` — failed
  saves retain drafts. Use `latency=600` to inspect pending actions.
- `/?example=page-settings&tab=categorization&state=long-content&width=390` — long
  conditions/results, archive/restore, and menu-to-editor focus. Also use tabs
  categories, analysis and recurring for selection, matching window and schedules.
- `/?example=page-analysis&state=long-content&mode=oled&width=320` — large totals
  and category drilldown. Use `latency=10000` for initial loading, `failure=reads`
  for initial error and `state=empty` for a zero-value period.
- `/?view=pages&mode=dark&accent=%23ce9a7e&width=390&motion=reduce&masked=true` —
  compare all five pages. Masking hides Home balances; Analysis and Transactions
  amounts have never consumed that preference and remain visible.

Validated September 7, 2026: 320/390px phones, 744px Accounts, 1280px desktop
Settings/Analysis, and 1280px coarse-pointer row menus. Light, Dark, OLED, warm
clay, slate blue and neutral were represented. Inspected long content, loading,
empty and read errors, failed save/rename drafts, category selection, archive and
restore, collapse, category drilldowns and editor focus/return. Tested retained
refresh errors in the existing route/section behavior suites. No new browser
runtime errors; local Accounts, General Settings and empty Analysis were also
smoke-checked without writing real data. This was Chromium validation, not a
physical-device test. See the density plan for test/build results and screenshots.

Asset group percentages in `account-overview` and `page-home` reveal the group
amount on hover/tap (including Other), using the same PercentAmountPopover as
change percentages. Verify keyboard activation and dismissal, converted currency
totals and masking. Mixed currencies without conversion retain a plain percentage
rather than showing a misleading combined amount. Shared behavior and exact sums
are covered by AccountSection.test.tsx and ChangePercentPopover.test.tsx.

Account modal tabs are ordered History, Details, then Holdings/Activity where
available. The account-dialogs example and its loading skeleton use these labels;
existing account-type defaults are retained.

Amount font preference: General exposes “Use monospace font for amounts” below
Hide zero balances on Home. It previews immediately and follows Save/Cancel;
`failure=writes` retains the draft and restores the saved preview after failure.
The workbench's Monospace amounts checkbox (`monospace=true`) sets the same
appearance field in every frame for side-by-side review. It defaults off. Check
Typography, Home, dialogs, percentages and numeric inputs with either font.
Saving in a fixture remains isolated from real user preferences.

Home headline net worth uses whole-currency formatting, including hovered history
values; percentage popovers retain exact cents. The comparison percentage and
its period label use a 6px gap. Review in page-home or all-pages.

Home period loading: use `/?frame=true&example=page-home&latency=1500&width=390`
and select an uncached period. The comparison row reserves its touch-target
height while loading, showing zero/no change, or inspecting a chart point, so
the chart and period controls stay anchored. Compare the initial state at
`/?frame=true&example=page-home&state=ready&hold=reads` and release reads in that
same document; its comparison placeholder uses the real frame. Repeat with a
desktop pointer and a wide coarse pointer, since touch geometry follows input
capability as well as viewport width.

## Home edge-to-edge accounts

`page-home` now places the balance visibility toggle in the app header before the
notification bell. On compact screens the Home heading occupies no visible space;
account rows and dividers extend to the shell edges with transparent group and row
backgrounds. Text retains a safe-area-aware inset. Desktop keeps its heading and
account cards. `account-overview` uses the same real AccountSection, and
the held/released `page-home` pair exercises its compact panel treatment. Toggle masking in `page-home`
to check the headline, rows, chart and account details together.

Historical Home edge-to-edge validation, before the skeleton migration:
validated this change in Chromium: OLED/Warm clay at 390×844, Light at 320×800,
and Dark/Warm clay at 1280×900. Inspected transparent full-width compact panels,
content truncation, desktop cards, navbar order and masking. Real local Home also
confirmed masking through the shared preference. Targeted Home, shell, account
and workbench suites passed (67 tests); typecheck, lint (existing warnings), token
guards and both builds passed.

This historical result is preserved as recorded. Current loading ownership,
retired standalone examples, and migration verification status live in the
[loading-state inventory](../docs/loading-state-ownership.md).

## Loading fidelity pairs

Skeletons live with their production owner. Use the actual page or dialog example
for both phases; isolated shape tiles have been retired. Keep frames, known copy,
column definitions, responsive grouping, and surfaces shared with loaded content.
See [the loading contract](../docs/ui-conventions.md#loading-preparation-and-stable-layouts)
and [ownership inventory](../docs/loading-state-ownership.md).

Use the same URL, theme, viewport, masking, and fixture data while releasing a held
phase. These controls are deterministic and scoped to the workbench document:

- `hold=reads` holds data reads while letting `/user/me` resolve.
- `hold=user` holds only session reads; `hold=series` holds Home series only.
- `hold=/exact/api/path` holds a specific nested read without freezing its parent.
- `holdModules=true` holds feature imports independently of data. Account dialog
  and manual editor examples also exercise their real deferred shell this way.
- `holdModule=<loader name>` holds only that feature, allowing its parent to
  resolve first. For example, use `holdModule=loadAnalysisAuditDrawer`,
  `loadCategoryTransactionsModal`, `loadManualBrokerageHoldingsModal`, or
  `loadDonutChart` (one exact loader name). Open the corresponding real control
  before capturing an overlay. Release with `workbench:release-modules`.
- `sankey=false` sets the fixture user to alternate donut Analysis. It changes
  only fixture data. For a module pair use
  `/?frame=true&example=page-analysis&state=ready&sankey=false&holdModule=loadDonutChart`;
  for the initial data pair use the same URL with `hold=reads` instead of
  `holdModule`. Keep `sankey=false` in the ready comparison too.
- `holdRoute=true` holds the page route before loading to show its real destination
  fallback, including navigation and toolbar. Combine holds to inspect each phase.

Release a phase from the browser console or agent-browser `eval`:

```js
window.dispatchEvent(new Event('workbench:release-route'))
window.dispatchEvent(new Event('workbench:release-modules'))
window.dispatchEvent(new Event('workbench:release-reads'))
```

For example, compare
`/?frame=true&example=page-home&state=ready&hold=reads&holdModules=true&mode=dark`
with its own released state at 390px and 1440px. Settings uses the same controls
with `example=page-settings&tab=categories` (or another section). Dialog pairs use
`example=account-dialogs&state=add|backfill|account|holdings`; manual editor pairs
use `example=manual-save&state=ready`. Reload resets every hold and fixture store.
For nested audit/recommendation/holdings states, open the relevant production
control before capturing; a page URL alone does not establish that coverage.

Record screenshots/filmstrips of all visible phases and inspect them. Measure
known anchors and separately check backgrounds, borders, text hierarchy, ordering,
grouping, and action placement. CLS alone misses nonrepresentative placeholders.
Unknown row counts and user text wrapping may legitimately change content height.
Actual production browser checks still establish code splitting, SSR/hydration,
and service-worker/cache behavior; fixture module holds do not prove those.
