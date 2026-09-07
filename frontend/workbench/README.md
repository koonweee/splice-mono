# Splice component workbench

Current delivery status: all 84 rendered components and registered state choices have reviewed coverage. Nonvisual helper exclusions and tests are documented in `catalog.md`. Final checks pass (590 frontend tests, typecheck, token guard, app/workbench builds; lint has three existing warnings). `../docs/appearance-visual-validation.md` records the final matrix and supersedes historical pending notes below.

Run from `frontend/`:

```sh
yarn workbench        # localhost:4001, no backend required
yarn workbench:build  # static output in .workbench/
```

The workbench contains 35 examples, including real Home, Accounts, Transactions,
Analysis, Settings and landing routes; account dialogs; controls/status;
interactive rows/retained errors; editors/nested pickers/confirmation; and chart
compositions. `catalog.json` maps 84 rendered components to examples. Registration
is checked against exported JSX components in `src/components`; the complete
visual/state review remains in progress. Catalog membership alone is not proof
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
