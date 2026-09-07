# Non-Home Page Density

## Status

Completed

## Goal

Implement the approved density proposals for Accounts, General Settings, Settings
lists, and Analysis. Use Home and Transactions as the density references: one
content inset, related information grouped together, and compact actions. Preserve
existing typography roles, touch targets, financial meaning, and feature behavior.

The user approved the before/after comparisons on September 7, 2026, with one
revision: the **Manual badge occupies its own final row beneath account type**.
The final approved visual reference is
[/Users/jtkw/.codex/visualizations/2026/09/06/01a07786-1bbf-7880-8634-0d91a397310b/density-comparison-badge-row.html](/Users/jtkw/.codex/visualizations/2026/09/06/01a07786-1bbf-7880-8634-0d91a397310b/density-comparison-badge-row.html).
Its source screenshots are in the sibling `density-audit/` directory. The written
specification below remains sufficient if those local artifacts are unavailable.

Scope boundaries:

- Preserve Home and Transactions layout and interactions.
- Retain canonical type roles, 44px minimum touch actions, 48px touch inputs,
  focus feedback, and existing neutral/tinted surface tokens.
- Reuse `PageLayout`, section toggles, settings primitives, and responsive rules.
  Do not replace the shared page-header abstraction or globally reduce spacing.
- Preserve the existing dirty checkout, including earlier UI standardization and
  unrelated plan changes. Review diffs before edits; do not revert other work.
- Implement and validate locally; leave the app and workbench running for review.
  Commit, push, and deployment are outside this goal.

## Baseline Before Implementation

- `frontend/src/components/accounts/InstitutionSection.tsx` wraps both its
  heading and rows in a padded Paper, with another inset inside `AccountRow` and
  gaps between rows. `AccountRow.tsx` puts secondary actions inside the title row
  and status in a separate right column, reducing name width and increasing height.
  `SectionToggle.module.css` already supplies the approved chevron-only feedback.
- `frontend/src/components/pages/SettingsPage.tsx` General uses a 20px padded
  Paper, repeated headings/descriptions, a separate Reset appearance row, and a
  timezone field sharing width with Use browser. `settings/AppearanceControl.tsx`
  owns custom-color drafts, validity, reset behavior, and swatch controls.
- Mobile renderers in `settings/CategorizationRulesSection.tsx`,
  `AnalysisRulesSection.tsx`, `CustomCategoriesSection.tsx`, and
  `RecurringManualTransactionsSection.tsx` use stacked content with a separate
  status/action footer. Each owns real editing, archive/restore, or other actions.
  Categorization rules were visually prototyped; the other three were identified
  in the code audit as consumers of the same compact-list pattern.
- `frontend/src/routes/_authed/analysis.tsx` renders summary totals in wrapping
  Groups. `components/analysis/AnalysisSankeyChart.tsx` repeats the inflow/outflow
  totals above the category list. Its CSS already distinguishes compact lists
  from the desktop Sankey. Compact category rows have nested horizontal padding.
- The approved proposals are browser-only prototypes. Production source and
  workbench fixtures were unchanged when this plan was written.
- Workbench real-page examples are in `frontend/workbench/page-examples.tsx`;
  shared examples, fixture stores, `catalog.json`, and `catalog.md` live alongside
  them. The all-pages view renders the actual five page compositions.

## Target Data Shape

No API, database, persisted settings, financial representation, or generated-client
changes. Any new shared action descriptor or layout prop is frontend-only and
must keep feature handlers and mutation state with their existing owners.

## Milestones

### 1. Compact Accounts sections and rows

Implementation tasks:

- [x] In `accounts/InstitutionSection.tsx`, place the section heading outside the
  bordered list, remove the nested outer inset, and use an 8px heading-to-list gap.
  Keep collapse behavior and chevron-only hover/press/focus feedback.
- [x] Give the list one raised surface with a border/radius, no inter-row gaps,
  subtle separators, and no trailing separator. Use approximately 12px row padding
  through existing spacing tokens rather than new global dimensions.
- [x] In `accounts/AccountRow.tsx` and its CSS, keep account text in a flexible
  column and position the action group/menu beside the whole row. Render name,
  account type, then Manual status badge on its own final line with a small gap.
  Keep badges content-width. Do not reserve a blank badge line when absent.
- [x] Apply the same structure to linked accounts without dropping connection
  state, synced-name information, timestamps, or relevant provider/status details.
  Keep desktop actions available and existing touch menus accessible.
- [x] Preserve rename validation, pending guards, reset-to-synced-name, archive
  confirmation, and link/reconnect behavior. Keep editable inputs and their actions
  usable when long text or inline errors increase height.
- [x] Update real account examples for manual, linked, disconnected, long-name,
  editing/error, and collapsed sections; reuse fixture stores.

Exit criteria:

- [x] The 390px Accounts page matches the revised approved composition; the Manual
  badge is below account type, and text gains width without smaller type/targets.
- [x] Collapse, rename/save/cancel, menu and confirmation behaviors pass relevant
  existing tests and focused browser checks. Narrow and desktop layouts fit.

### 2. Compact General Settings without changing form state

Implementation tasks:

- [x] In `pages/SettingsPage.tsx`, remove the General panel's nested card inset,
  retain a sensible desktop maximum width, and separate groups with subtle lines
  and approximately 12px spacing. Preserve the shared title/navigation layout.
- [x] Move Reset appearance beside the Appearance heading using a supported React
  composition in `settings/AppearanceControl.tsx`; keep reset of both custom draft
  and validity in one owner. Do not reproduce the prototype's DOM reparenting.
- [x] Keep the mode selector full-width. Align Accent with the swatches when it
  fits, and align the Custom accent label beside its field. Allow narrow layouts
  to wrap gracefully without shrinking swatch targets or error text.
- [x] Keep currency and timezone fields full-width. Place concise helper text below
  fields and Use browser beside the Timezone heading. Show the detected browser
  timezone when it differs from the selection; omit the redundant matching value.
- [x] Replace the separate Home dashboard heading/description with the explicit
  switch label “Hide zero balances on Home”. Preserve its native label/input and
  touch behavior. Keep Cancel/Save with the form and retain error/success feedback.
- [x] Preserve appearance preview, cancel/reset, invalid custom hex handling,
  asynchronous saved-baseline updates, pending state, and failed-save drafts.

Exit criteria:

- [x] At 390×900, the normal General fixture includes the Home switch and form
  actions without the previous nested-card overflow. Added validation/errors may
  legitimately increase height and remain reachable.
- [x] Appearance modes, swatches, custom color, reset/cancel/save, currency, timezone,
  and the Home switch retain their existing semantics and accessible names.

### 3. Standardize compact Settings list rows and actions

Implementation tasks:

- [x] Start with `CategorizationRulesSection.tsx`: combine name, status, and one
  trailing action menu on the heading row; use compact condition/result lines;
  place priority with the result when it fits. Remove the dedicated action footer.
- [x] Use an accessible result label (visible or screen-reader text); an arrow
  alone must not replace category meaning. Preserve complete rule details and
  established drill-in access when summaries are truncated.
- [x] Consolidate mobile actions with a small shared menu/row-action primitive if
  existing primitives do not fit. Reuse action definitions for inline desktop and
  compact menus to avoid handler drift. A single available action appears directly;
  multiple actions use a labeled More menu. Preserve disabled/loading states,
  destructive meaning, preparation handlers, keyboard navigation and focus return.
- [x] Apply the same compact structure where appropriate to `AnalysisRulesSection`,
  `CustomCategoriesSection`, and `RecurringManualTransactionsSection`. Keep category
  selection, origin/status, rule effects, schedule account/amount, cadence, and next
  occurrence visible or in their existing detail surfaces. Do not force every row
  to a fixed height or hide essential metadata to match the short prototype.
- [x] Preserve desktop table presentation and all existing mutations/dialogs.
  Align compact behavior with the existing responsive/touch policy, including wide
  coarse-pointer devices where actions otherwise rely on hover.
- [x] Extend Settings examples with multiple rows, long names/conditions/categories,
  archived/disabled states, and realistic action availability. Register any new
  rendered shared primitive in both workbench catalogs and a real example.

Exit criteria:

- [x] The categorization example matches the approved compact hierarchy, and all
  actions still invoke the correct row and existing confirmation/editor flow.
- [x] Categories, analysis rules and recurring schedules gain density without lost
  selection controls, dates, amounts, statuses or permissions. Content wraps at
  320px; 44px action targets do not collide with text or adjacent controls.
- [x] Behavior tests protect menu action dispatch, single-action promotion, disabled
  actions, and focus/overlay transitions where newly introduced.

### 4. Align Analysis totals and tighten its compact list

Implementation tasks:

- [x] Replace wrapping summary Groups in `routes/_authed/analysis.tsx` with three
  aligned label/value columns for Inflows, Outflows and Net. Keep the share bar,
  exact formatting, masking and positive/negative semantics. Drop redundant arrow
  decoration as in the approved proposal.
- [x] Use approximately 12px summary padding and a 16px gap before Cashflow.
  Long currency values must fit through responsive layout/wrapping, not smaller
  locally defined type or concealed significant digits.
- [x] In `analysis/AnalysisSankeyChart.tsx` and its CSS, remove duplicate headline
  totals when composed with the page summary; use an explicit prop if standalone
  consumers still need them. Preserve desktop Sankey geometry and drilldowns.
- [x] Tighten compact card inset and category-group gaps to approximately 12px.
  Remove the second horizontal row inset and use small text-to-bar spacing while
  maintaining 44px minimum category hit areas and clear focus/press feedback.
- [x] Keep loading/error/empty geometry representative and preserve data retention,
  audit actions, category clicks, transaction drilldown and balance masking.

Exit criteria:

- [x] Compact Analysis has three aligned totals and no repeated total line; category
  rows are visibly tighter without compromised targets or truncated money.
- [x] Phone category drilldown and desktop chart interaction still work. Test
  large/signed/zero values and existing masking scope, not only the short approved fixture.

### 5. Cross-page verification and durable guidance

Implementation tasks:

- [x] Update `frontend/workbench/README.md`, catalog entries as needed, and
  `frontend/docs/ui-conventions.md` with the implemented density rules and links
  to actual examples. Keep the all-pages view maintained rather than adding a
  parallel mock implementation. Record actual checks and limitations.
- [x] Use agent-browser for real-component validation: 320px and 390px phones,
  744px tablet, and 1280px desktop; include coarse-pointer and keyboard checks for
  changed menus. Run commands escalated per repository guidance and close only
  sessions started for this work.
- [x] Inspect changed compositions in Light, Dark, and OLED, using warm/cool accents
  and neutral checks for any shared surface changes. Compare Home and Transactions
  in the all-pages view to catch accidental global changes.
- [x] Cover ready/empty/initial-loading/error plus relevant pending, refresh-error,
  masking and reduced-motion states. Inspect long-content and portal boundaries;
  capture settled screenshots and check console/runtime errors.
- [x] Smoke-check the local app for Accounts, General Settings, and Analysis where
  available, without changing real financial data. Use fixture-backed workbench
  interactions for save/archive/apply tests. Leave app/workbench servers running.
- [x] Run the checks below, resolve new failures, record unrelated baseline issues
  accurately, and mark milestones complete only after their criteria are met.

Exit criteria:

- [x] Approved before/after comparisons are realized in production components and
  reflected by the real workbench; evidence covers the listed responsive risks.
- [x] Required checks pass, no new runtime/interaction failures remain, and plan
  status/index are updated with a concise validation record.

## Tests

### Backend

No backend work or backend tests required; existing contracts remain unchanged.

### Frontend

- Reuse `components/accounts/AccountRow.test.tsx`,
  `routes/_authed/accounts.test.tsx`, `routes/_authed/analysis.test.tsx`,
  `components/analysis/AnalysisSankeyChart.test.tsx`, and the affected Settings tests.
- Add behavioral coverage only for changed action composition, reset ownership,
  or accessible interactions not already covered. Avoid tests asserting CSS
  strings, pixel constants, or implementation-only markup.
- Workbench tests cover registry consistency, fixture isolation, and stateful
  settings/rule/account interactions. Update fixtures rather than bypassing their
  real mutation adapters.

## Validation Commands

Run in `frontend/`:

```bash
yarn test src/components/accounts src/components/settings src/components/analysis src/routes/_authed/accounts.test.tsx src/routes/_authed/analysis.test.tsx src/routes/_authed/settings.test.tsx --maxWorkers=2
yarn test workbench --maxWorkers=2
yarn lint
yarn typecheck
yarn tokens:check
yarn build
yarn workbench:build
```

Include any added shared-component test file in the targeted run. Run focused
checks during each milestone; do the combined builds after integration rather
than repeatedly building unchanged code. Stable browser entry points include:

- `http://localhost:4001/?view=pages&mode=dark&accent=%23ce9a7e&width=390`
- `http://localhost:4001/?frame=true&example=page-accounts&mode=dark&width=390`
- `http://localhost:4001/?frame=true&example=page-settings&tab=general&mode=light&width=390`
- `http://localhost:4001/?frame=true&example=page-settings&tab=categorization&mode=dark&width=390`
- Settings list variants: `tab=categories`, `tab=analysis`, and `tab=recurring`.
- `http://localhost:4001/?frame=true&example=page-analysis&mode=oled&width=390`

## Overall Exit Criteria

- [x] Accounts follows the revised approved layout, including the separate final
  Manual badge row and chevron-only section feedback.
- [x] General Settings, compact Settings lists and Analysis implement the approved
  density principles, with realistic content and all existing actions intact.
- [x] No regressions to Home, Transactions, financial display, form state,
  accessibility, canonical typography, or touch geometry.
- [x] Maintained workbench examples, browser evidence, behavioral checks, lint,
  typecheck, token guard, and both builds establish completion.
- [x] No API/schema changes, unrelated reversions, commits, pushes or deployments;
  local app/workbench remain available for user review.


## Implementation and Validation Record — September 7, 2026

Implemented the production layouts, loading compositions and shared
SettingsRowActions; maintained the real page examples and both catalogs.
Manual status occupies its own final row. Long institution headings keep the
chevron beside the heading; large Analysis values wrap whole summary columns.

Browser evidence is saved in
[/Users/jtkw/.codex/visualizations/2026/09/06/01a07786-1bbf-7880-8634-0d91a397310b/density-implementation/](/Users/jtkw/.codex/visualizations/2026/09/06/01a07786-1bbf-7880-8634-0d91a397310b/density-implementation/).
The `all-pages-final.png` capture compares the five production page compositions.

Actual checks:

- Accounts: Dark/Warm clay at 320, 390 and 744px; long manual and linked names,
  disconnected status details, final badge row, collapse/expand, rename/cancel,
  failed rename draft and error layout. Existing tests cover rename validation,
  pending guards, archive confirmation/retry, synced-name reset and link contracts.
- General Settings: Light/Slate blue at 320px, Dark/Warm clay at 390px and neutral
  Dark at 1280px. Reset/invalid color/cancel, failed save with a retained switch
  draft, reachable errors and form actions. Existing form tests cover preference
  controls, asynchronous saved baselines, cancel/reset and mutation semantics.
- Settings lists: Light and Dark categorization at 390px, long rules and
  archive/restore; Dark long categories and recurring schedules at 320px; OLED
  Analysis settings at 320px; Light desktop categories at 1280px. Category
  checkbox selection and row menu stay independent. Long merchant/category text,
  huge schedule amounts and next occurrence remain readable. Wide coarse-pointer
  emulation produces the touch menu with a 44px trigger.
- Keyboard: native Chromium key dispatch verifies Enter opens the first action,
  Escape returns to the row, and choosing Edit transfers focus to the editor and
  back on close. Fixed a discovered menu-return-focus race and added a behavior
  test protecting editor focus. Account menus use the same handoff approach.
- Analysis: OLED phone, Light/Slate blue desktop Sankey, Dark long values at320,
  mobile category and desktop node drilldown. Zero values were checked on the real
  local route; signed and retained-error cases remain covered by existing tests.
  Read errors and delayed initial loading were visually inspected. While the user
  preference is unknown the placeholder uses Cashflow; known donut preferences
  retain their corresponding skeleton.
- All-pages comparison: Dark/Warm clay, 390px frames, reduced motion and masking.
  Home and Transactions retain their prior layouts. Masking correctly applies to
  Home balances; Analysis and Transactions never consumed that preference. This
  pass preserves that behavior rather than claiming cross-page privacy coverage.
- Retained refresh errors and retry are covered by the Analysis and Settings
  behavior suites; initial read errors and write failures were inspected in the
  browser. There is no new dedicated Analysis refresh-error workbench state.
- Authenticated local Accounts, General Settings and Analysis were smoke-checked;
  no real financial data was changed. Chromium reported no new runtime errors.
  This was browser/emulated-pointer validation, not physical iOS/Android testing.

Automated checks:

- 26 targeted test files, **171 tests passed**, including affected Accounts,
  Settings, Analysis, route and workbench behavior suites.
- The final Analysis loading adjustment and focus regression test also passed a
  focused 2-file / 13-test rerun; TypeScript passed afterward.
- Token ownership passed (26 typography roles); frontend lint passed with zero
  errors and three pre-existing require-await warnings in presentation preferences
  and API-client server tests.
- Production app and standalone workbench builds passed. Existing chunk-size
  advisory remains; no new build failure.

No API/schema changes, commit, push or deployment. The backend, app (4000) and
workbench (4001) are left running. Agent-browser validation sessions are closed
when finishing; existing user browser tabs are preserved.
