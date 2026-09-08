# Skeleton Colocation and Visual Fidelity Migration

## Status

Implementation and validation complete; release pending.

The [ownership ledger](../frontend/docs/loading-state-ownership.md) records the final source inventory and phase coverage. The [validation report](../frontend/docs/skeleton-migration-validation.md) records browser findings, responsive/theme coverage, local production SSR/hydration checks, and remaining release gates.

## Goal

Colocate every content skeleton with the component that owns its final layout. Loading and loaded states must share structural layout, surface treatment, responsive behavior, and known content so that startup, navigation, lazy module loading, and data loading do not introduce avoidable visual churn.

Measure two separate outcomes: displacement of surrounding content, and visual mismatch even when element dimensions do not change. A filled skeleton panel becoming a transparent chart is a failure even if CLS is zero.

Update agent guidance and the component workbench workflow so future UI changes maintain this contract. This is a frontend refactor; preserve data fetching, masking, navigation, authentication, and financial behavior.

## Original Audit Baseline

The implementation is grounded in the Home changes at commit `f884f5422c435fcda5aa66d9cae27b6a5d876b69`. The completed migration is reconciled against the current checkout in the ownership ledger; the following observations describe the original baseline.

- `frontend/src/components/loading/LoadingSkeleton.tsx` combines an accessible loading boundary, generic shapes, and page/domain skeletons. Several consumers use a generic table or row shape that differs from their rendered content.
- `HomeSkeleton.tsx`, `ChartSkeleton.tsx`, `AccountDialogSkeletons.tsx`, and `RoutePendingSkeleton.tsx` also live in that central directory. There are two differently purposed components named `ChartSkeleton`, including the rectangle exported by `LoadingSkeleton.tsx`.
- `DataState.tsx`, `DeferredFeature.tsx`, and `DeferredOverlay.tsx` provide implicit generic fallbacks. Nested data and module boundaries can therefore show different skeletons consecutively. `DataState` also uses an invisible fallback to reserve empty/error geometry, so changing a fallback affects more than initial loading.
- Some skeletons are already inline with their owner, including comparison loading in `CompactAccountRow.tsx`. Colocation does not require moving these into separate files.
- `frontend/docs/ui-conventions.md` currently recommends centralized shapes. The workbench has standalone loading examples, but those alone do not prove fidelity to the final component or intermediate loading phases.

The preceding audit found these concrete mismatches in local production/workbench rendering. Authenticated deployed behavior was not verified; do not label this evidence as a live production audit.

| Surface                                 | Mismatch to resolve                                                                                                                                                                                                              |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home                                    | Skeleton chart has a filled panel background; the final `NetWorthCard` is transparent. Account placeholders omit known Assets/Liabilities grouping. The reported chart defect concerns its background, not its decorative curve. |
| Transactions and reused table fallbacks | Generic bordered avatar rows do not represent desktop columns or mobile date groups, category details, and row hierarchy. Different tables have different legitimate surface treatments.                                         |
| Settings module loading                 | Skeleton actions and filters occupy body positions before final actions/filters move into page portals; mobile full-width placeholder actions become header icons.                                                               |
| Analysis                                | Loading stacks Outflows then Inflows; desktop content places Inflows first in a two-column layout. A generic lazy-chart fallback introduces another intermediate shape.                                                          |
| Account details and investments         | Skeleton omits a comparison row when its presence is already known, moving the tabs. Holdings/activity require their actual desktop/mobile structure.                                                                            |
| Access tokens                           | Avatar rows become bordered token cards with metadata and actions; placeholder helper lines do not follow the known text wrapping.                                                                                               |
| Notification inbox                      | Compact amount-style rows become icon, title, multiline message, timestamp, and action rows.                                                                                                                                     |

Accounts institution grouping, Add Account provider cards, and Backfill form scaffolding are useful existing matches to preserve during relocation. Top-level Settings user-loading and route-pending branches also need coverage, but were not established as common navigation failures. The initial audit was not an exhaustive inventory of nested editors and previews.

## Target Data Shape

No backend, database, API, generated client, or shared financial data shape changes. Do not run migrations or regenerate API clients for this refactor.

Local presentation contracts may change: explicit boundary fallbacks, lightweight shared frames, and workbench state metadata. Use existing summary metadata to determine known layout variants; do not fetch extra data solely to guess skeleton geometry.

## Ownership and Design Contract

1. **Primitives own primitive geometry.** Keep neutral text/amount/icon/control placeholders and the accessible loading boundary reusable. Add a helper only where multiple owners need the same contract. These primitives must not import page CSS or domain components.
2. **Components own content skeletons.** Use an inline loading variant for small components, or an adjacent `<Owner>.skeleton.tsx` companion for larger ones. A transaction row owns transaction placeholders; a token card owns token placeholders. A generic `TableSkeleton` cannot represent unrelated tables.
3. **Share the actual structural frame.** Extract lightweight frames or layout descriptors used by both states: surfaces, padding, columns, grouping, breakpoints, and optional slots. Moving duplicate JSX beside its owner is insufficient. Avoid a universal schema that attempts to describe every screen.
4. **Render known UI immediately.** Keep headings, explanatory copy, labels, table columns, and known controls in their final positions. Disable unavailable actions as appropriate. Skeletons replace unknown content, not known page structure. Preserve masked values and never fabricate financial data.
5. **Use the same structure across loading phases.** Route pending, feature-module pending, and initial data pending compose the same lightweight owner frames and skeletons. These imports must not pull chart libraries, full settings sections, or editors into the initial bundle. Avoid barrels that defeat code splitting.
6. **Keep cached content mounted.** Matching background refetches retain rows, selection, drafts, focus, and scroll. A changed query identity must not label stale results as current. Preserve existing empty/error/retry semantics and explicit scroll ownership.
7. **Match what is knowable.** Preserve conditional slots when their presence is known from summary data. Unknown row counts and wrapped user content can change intrinsic height; document those expected changes. Do not impose arbitrary fixed heights to conceal them.

The ownership families below guided implementation; the ownership ledger records exact final companion paths. Choose names consistently within each directory; route orchestration may remain in route files while reusable frames live under `components/`.

| Current skeleton/fallback family              | Final owner                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Home composition and decorative chart         | `pages/HomePage`, `NetWorthCard`, `AccountSection`, and the chart presentation they compose                                       |
| Accounts institution groups and rows          | `accounts/InstitutionSection` and `accounts/AccountRow`                                                                           |
| Transactions table/mobile list                | `TransactionsTable` and `transactions/TransactionsMobileList`                                                                     |
| Analysis page, flow summaries, cashflow chart | Lightweight analysis page/section frames alongside `analysis/AnalysisSankeyChart` and relevant chart owners                       |
| Settings sections and their lists             | Each owning file under `components/settings/`; page scaffolding belongs to `pages/SettingsPage` and shared page layout primitives |
| Account details, holdings, activity           | `AccountModal`, `investments/InvestmentHoldingsTable`, `investments/InvestmentActivityTable`                                      |
| Add Account, Backfill, other deferred editors | Respective dialog components; shared dialog shell stays with `DeferredOverlay`/editor primitives                                  |
| Notifications                                 | `notifications/NotificationInbox` and its row component if extracted                                                              |
| Route pending                                 | Lightweight dispatcher composing destination-owned frames; no independent page imitation                                          |
| Loading announcement and neutral shapes       | Shared loading primitives, colocated with their own implementation/examples                                                       |

## Milestones

### 1. Inventory every boundary and establish the guidance contract

Implementation tasks:

- [x] Inventory all exported and inline skeletons, direct Mantine `Skeleton` usage, `DataState`/`MobileTableList` fallbacks, `DeferredFeature`, `DeferredOverlay`, `Suspense`, `ClientOnly`, and router pending components. Inspect callers using implicit defaults as well as explicitly named skeletons.
- [x] Record the migration checklist in `frontend/docs/loading-state-ownership.md`: consumer, final owner, current fallback, code/data loading phases, responsive variants, workbench example, and unresolved mismatch. Include nested previews, audit drawers, editors, and user/session loading branches. Classify spinners, intentional launch screens, and mutation progress separately; do not turn them all into skeletons.
- [x] Update the loading section in `frontend/docs/ui-conventions.md` to replace its centralized-shape recommendation with the contract above. Keep the existing masking, reduced-motion, retained-data, and empty/error requirements.
- [x] Add a concise rule and link in root `AGENTS.md` and `CLAUDE.md`; put the actionable workflow in `frontend/CLAUDE.md`. Require agents changing layout to locate the owner, update loaded and loading states together, inspect code-loading intermediates, and update paired examples. Do not add a new permission gate.
- [x] State that exceptions need a concrete reason in the change description (for example, genuinely unknowable row count), not silent reuse of a generic row or filled rectangle. A passing CLS measurement or catalog entry alone is insufficient evidence.

Exit criteria:

- Every discovered loading boundary has an owner and migration/check disposition; no implicit fallback consumer is omitted.
- Guidance no longer directs new domain skeletons into the central file. Existing unmigrated consumers are explicitly tracked as temporary debt.
- The checklist separates verified findings from source-only concerns and intentional non-skeleton loading UI.

### 2. Establish shared primitives and migrate Home as the reference implementation

Implementation tasks:

- [x] Isolate the accessible boundary and genuinely neutral shape primitives from domain skeleton exports. Retain temporary compatibility exports only while callers migrate.
- [x] Share Home/NetWorth/account-section structural frames between loaded and loading paths. Preserve transparent chart surroundings, the existing chart footprint and period-control layout, known group labels, and compact edge treatment.
- [x] Colocate the Home and chart skeletons with their owners. Give the two existing chart skeleton concepts unambiguous names. Keep chart implementation imports lazy.
- [x] Extend the workbench with paired loading/loaded owner examples and deterministic held/released data responses. Include partial Home readiness (summary available, series pending), masking, empty results, and period changes. Reuse production components and styles; fixtures remain under `workbench/`.
- [x] Document paired-state capture conventions in `frontend/workbench/README.md` and update both catalogs. Avoid creating a second workbench-only copy of any production frame.

Exit criteria:

- Home loading-to-ready preserves background treatment and known anchors on phone and desktop; no filled panel flashes behind the transparent chart.
- Data and chart-module loading use the same frame. Background fetching retains valid content.
- Agent-browser inspection of paired examples and a local production Home load confirms the result; relevant tests, lint/typecheck, and workbench checks pass.

### 3. Stabilize page scaffolding and make fallback ownership explicit

Implementation tasks:

- [x] Refactor `DataState`, `MobileTableList`, `DeferredFeature`, and `DeferredOverlay` contracts so content-bearing boundaries require an explicit owner fallback. Use a typed explicit opt-out only for intentionally neutral status or no-placeholder behavior. During transition, keep unmigrated defaults tracked; remove them in milestone 6.
- [x] Preserve one accessible loading announcement per region and noninteractive decorative skeletons. Preserve dialog close/Escape/focus behavior and error recovery.
- [x] Keep `PageLayout`, `PageActions`, `PageToolbar`, and `SettingsToolbar` structure stable through loading. Resolve action/filter portal placement before displaying the section; do not render temporary body-level copies that later relocate.
- [x] Replace `SettingsSkeleton` composition with section-owned frames for General, Notifications, Access, Categories, Analysis, Categorization, and Recurring. Render known helper copy and labels directly. Keep Recurring's actual surface treatment rather than applying a blanket transparency rule.
- [x] Make `RoutePendingSkeleton` a lightweight destination-aware composition using those owners. Cover direct URLs and relevant settings selection without importing heavy sections. Do not change navigation timing just to hide mismatches.

Exit criteria:

- Cold route, feature-module, and data loading keep heading/action/filter positions consistent with the destination at each viewport.
- Browser evidence includes independently delayed modules and data, including Settings section switching; workbench-only user-loading coverage is labeled accordingly.
- No new eager feature imports or focus/scroll regressions; boundary behavior tests pass, including empty/error states affected by reserved fallback geometry.

### 4. Migrate domain lists, tables, and rows

Implementation tasks:

- [x] Replace generic Transactions placeholders with owner-specific desktop columns and mobile grouped rows. Share column sizing/layout metadata where needed without requiring row data or loading the full table module early.
- [x] Migrate Accounts institution/row placeholders while preserving their existing representative structure. Keep inline comparison placeholders colocated and aligned with their loaded slots.
- [x] Migrate each settings list and nested application/recommendation preview in `CustomCategoriesSection`, `AnalysisRulesSection`, `CategorizationRulesSection`, and `RecurringManualTransactionsSection`. Share structural primitives where the final layouts actually match.
- [x] Add token-card placeholders alongside `PersonalAccessTokenSection` and notification-row placeholders alongside `NotificationInbox`; preserve known copy, card boundaries, metadata hierarchy, and action slots.
- [x] Update each boundary and workbench catalog as its owner moves. Add paired short/long-content and empty/error fixtures where content wrapping or reserved geometry matters.

Exit criteria:

- These consumers no longer rely on generic avatar/amount rows or generic table chrome.
- Agent-browser comparisons show representative column/group structure, surface treatment, and responsive ordering; desktop and mobile use the correct respective presentation.
- Existing selection, sorting, pagination, row actions, notifications, and token interactions retain their behavior. Relevant behavior tests and catalog checks pass.

### 5. Migrate analysis, account details, and every remaining overlay

Implementation tasks:

- [x] Share Analysis summary, chart, and drilldown frames. Preserve Inflows/Outflows order and desktop columns; replace the intermediate generic cashflow rectangle with the same chart-owned fallback used for data loading. Preserve intentionally different compact layouts.
- [x] Colocate `AccountDetailsSkeleton` with `AccountModal`; reserve the comparison slot when available summary metadata establishes its presence. Cover investment/cash accounts, currency conversion, history, and selected tabs.
- [x] Migrate holdings/activity fallbacks to their respective investment table/mobile owners, including nested loading within an already-open account dialog.
- [x] Relocate Add Account and Backfill skeletons alongside their dialogs, sharing their already representative scaffolding. Complete the inventory for all other deferred editors, `CategoryTransactionsModal`, `AnalysisAuditDrawer`, and nested previews; every fallback needs a disposition even if it already looks correct.
- [x] Keep lightweight overlay/section frames outside lazy implementations, without mounting hidden working forms or duplicate interactive controls.

Exit criteria:

- Analysis no longer alternates between incompatible page/chart skeletons before rendering data.
- Known account comparison content does not insert a previously omitted row and move tabs; holdings/activity match the correct viewport structure.
- Every overlay opens in its final shell and preserves accessible closing, focus restoration, error handling, and form state. Paired examples and production browser checks cover these transitions.

### 6. Remove compatibility paths and finish regression coverage

Implementation tasks:

- [x] Remove migrated domain exports, compatibility reexports, unused mixed CSS, and misleading standalone examples from the central loading directory. Retain only genuine shared loading utilities there; intentional startup UI need not move merely because it is not a skeleton.
- [x] Remove implicit generic content fallbacks from shared boundaries. Make TypeScript surface any missed caller and rerun the exhaustive source inventory, including direct primitive usage.
- [x] Extend the existing workbench registry validation to require loading/ready coverage for cataloged skeleton owners. Add a narrowly scoped import/dependency guard against retired centralized domain exports and eager feature imports where existing tooling can support it. Do not substitute source-string assertions for visual tests.
- [x] Reconcile the ownership checklist, catalogs, `frontend/workbench/README.md`, and agent guidance with the final implementation. Keep one authoritative design contract and link to it rather than repeating divergent rules.
- [x] Run the complete validation matrix below and record actual URLs, states, viewport/theme, observations, and unresolved limitations in a durable frontend validation document. Mark each inventory item complete only with owner and coverage evidence.

Exit criteria:

- No domain skeleton remains centrally owned, no temporary reexport remains, and no content boundary silently falls back to an unrelated shape.
- All seven audited mismatch families are resolved and remaining inventory entries are verified or explicitly classified as intentional non-skeleton UI.
- Required checks pass; evidence distinguishes local production, workbench, and deployed checks. Release can follow the normal repository deployment process as separately requested.

## Tests

### Backend

No backend changes or new backend tests are required. Use the existing local API and documented local authentication for production browser checks; do not alter real account data to create loading fixtures.

### Frontend

- Add or update meaningful boundary behavior tests: initial load, held module then held data, success, empty, initial error/retry, and background refresh failure. Verify retained component identity/focus and that interactive placeholders or duplicate announcements are not introduced.
- Cover known conditional comparison slots, responsive table/list presentation, and portal placement with browser evidence and focused behavioral assertions where useful. Avoid tests that assert CSS declarations, arbitrary heights, or implementation strings.
- Maintain paired workbench states for every migrated owner; use deterministic hold/release controls instead of timing-dependent screenshot races. Module-delay fixtures must not ship in production; independently verify real lazy chunks in a production build.
- Run agent-browser against startup/direct entry and navigation among Home, Accounts, Transactions, and every Settings/Analysis section. Include cold cache/modules, warm navigation, partial responses, empty/error, and matching-data refetch. Inspect every intermediate visible frame, not just the first and last screenshots.
- Capture before/after pairs or filmstrips and anchor measurements. Assess surface/background/border differences, text hierarchy, ordering, alignment, grouping, and control placement separately from CLS. Report expected changes from unknown content rather than claiming all transitions must have zero displacement.
- Baseline phone 390px and desktop 1440px; shared responsive frames also cover 320px and a tablet breakpoint. Cover Light/Dark/OLED and a representative accent for shared primitives, then representative affected states per family. Include reduced motion, masking, keyboard focus, and relevant touch behavior.
- Read the agent-browser skill when implementing. Start CLI sessions with the escalation required by `AGENTS.md`, close sessions created for validation, and preserve pre-existing servers. Use production browser checks to cover SSR/hydration, portals, service-worker/cache effects, and lazy chunk loading that workbench fixtures cannot establish. Inspect runtime/console errors.

## Validation Commands

Backend: none for this frontend-only migration.

Run focused affected behavior tests during each milestone. After registry/fixture/shared styling changes, run the workbench tests, token check, and workbench build. Complete the full suite at migration completion:

```bash
cd frontend
yarn test --maxWorkers=2
yarn lint
yarn typecheck
yarn test workbench --maxWorkers=2
yarn tokens:check
yarn build
yarn workbench:build
```

Inspect production build output/dependencies to confirm route fallback imports have not pulled previously lazy charts/settings/editors into initial chunks. Run `yarn workbench` for fixture inspection; follow the repository's local development skill for authenticated app setup. A build does not replace the browser validation above.

## Rollout and Constraints

Ship independently reviewable owner-family slices in milestone order. Temporary reexports permit migration without breaking unrelated consumers, but must not become a supported long-term API. Revert an affected slice using normal version control if necessary; there is no data rollback. Do not combine this work with a visual redesign, new loading delays, authentication changes, or a chart-library migration.

Keep extracted frames lightweight and free of data fetching. Preserve SSR/hydration behavior, stable portal targets, scroll containers, and cached content identity. Specifically review `DataState` empty/error reservation after each fallback change so message layouts do not inherit unsuitable skeleton dimensions. Do not force data-dependent panels to a captured sample height.

## Overall Exit Criteria

- [x] Every content skeleton is inline with or adjacent to its owning component; shared primitives own only reusable primitive geometry and loading semantics.
- [x] Loading and loaded states share structural frames instead of separately maintained layout copies.
- [x] Startup, main-page navigation, nested module/data loading, and overlays no longer show the audited avoidable background, hierarchy, ordering, or anchor mismatches.
- [x] No implicit unrelated fallback or temporary centralized domain export remains; the exhaustive ownership checklist and paired workbench coverage are complete.
- [x] Accessibility, masking, cache/refetch behavior, dialogs, responsive layout, empty/error recovery, and code splitting are preserved.
- [x] Agent entry-point guidance links to the new contract and requires paired-state maintenance and appropriate visual validation during future UI work.
- [x] Required tests/builds/checks pass and browser evidence records both layout shift and visual fidelity, with any unavailable deployed validation stated explicitly.
