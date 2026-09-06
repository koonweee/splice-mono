# Earlier loading, skeletons, and stable layouts

## Status

Planned. Implements the user's requested loading UX: prepare likely destinations
before clicks, prefer skeletons, eliminate loading-induced layout shifts, and
remove Home's redundant “Updating period… Showing … results” line.

Grounded in released frontend `0.0.109` / production commit `82510ad` and source
commit `8c5c1f7`, inspected in `/tmp/splice-navigation-style-fix`. This plan is saved
in the main project for discovery. Its existing unrelated working changes must be
preserved; implementation should start from current main in an isolated worktree.

## Goal

Make primary navigation feel ready when selected, and make unavoidable loading
look like the final page taking shape in place. Keep controls, headings, cards,
rows, and scroll position stable as code and data arrive.

Preserve server-rendered essential content, the hydration fix, persistent component
styles, exact financial values, mutation reconciliation, and the existing
30-second in-tab cache. A useful page must not wait for optional charts or editors.

## Current Behavior

| Surface / files                                                                                                                      | Current behavior and audit target                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `frontend/src/router.tsx`, `routes/_authed.tsx`                                                                                      | Navigation links use intent preloading. Quick taps give little lead time; there is no idle preparation of primary destinations. The generic pending component is a small text line.                                      |
| `lib/queries/loader.ts`, `lib/queries/primary.ts`, `lib/queries/dashboard.ts`                                                        | Client loaders start requests without blocking navigation; matching cached results render immediately. These shared query options are the required reuse point for prefetching. Transactions is a 50-row infinite query. |
| `components/LazyChart.tsx`, `components/NetWorthCard.tsx`, `routes/_authed/analysis.tsx`                                             | Nested chart modules start loading when rendered, which can be after data arrives. Home's chart has a hydration-safe, 200px placeholder. Analysis has separate category and cashflow chart boundaries.                   |
| `components/pages/SettingsPage.tsx`, `lib/queries/settings.ts`                                                                       | Sections are lazy modules; the selected section's essential list loads through a shared function. Access-token inventory intentionally has zero stale time.                                                              |
| `components/DeferredFeature.tsx`, `components/DataState.tsx`, `components/MobileTableList.tsx`                                       | Generic spinners/text replace differently sized content. Error alerts can insert rows above existing data. Mobile lists inherit the generic data-state fallback.                                                         |
| `components/pages/HomePage.tsx`, `hooks/useBalanceData.ts`                                                                           | Period changes retain the previous summary but insert a status line above it. The line appears/disappears in normal flow. Cold summary loads still use a centered spinner.                                               |
| `components/PageHeader.tsx`, `lib/responsive.ts`                                                                                     | Page heading size changes from `h1` to `h3` after the media-query hook updates on phones. Audit the actual displacement; make visual sizing agree from first paint.                                                      |
| `components/TransactionsTable.tsx`, `routes/_authed/transactions.tsx`                                                                | Desktop/mobile render paths differ; desktop virtualization starts with an assumed 1000×600 rectangle. Audit initial hydration, row skeletons, progress bars, totals, toolbar wrapping, and scroll restoration.           |
| `components/AccountModal.tsx`, `components/accounts/*`, `components/settings/*`, `components/investments/*`, `components/analysis/*` | Several data and module boundaries use spinners or content of unrelated dimensions. Include history, holdings, activity, filters, drawers, editors, and previews in the inventory.                                       |

These are code-grounded candidates, not measured shift totals. The initial audit
must identify actual causes and record both clean and failing surfaces.

## Target Data Shape

No API, database, or generated-client contract changes. Query keys, pagination,
financial types, and cache ownership remain authoritative in the existing shared
query modules. New frontend-only APIs may add typed loading fallbacks,
comparison-loading props, and a shared registry of code/data preload functions.

## UX decisions

- Skeletons are the default for initial page, section, chart, and read-only data
  loading. Their layout follows the real responsive content, including margins,
  row density, chart height, and toolbar footprint.
- Matching cached content remains visible during background refresh, with no new
  status row, spinner replacement, or loading-induced resizing.
- On a Home period change, keep period-independent balances, account identities,
  rows, and expanded/collapsed state. Skeleton only period-dependent deltas,
  percentages, comparison text, and the chart in their existing slots until the
  requested results are available. Propagate this state through `AccountSection`
  and `CompactAccountRow`, including popovers. Do not expose old comparisons as
  the newly selected period.
- Remove the visible “Updating period… Showing … results” line completely. Do not
  replace it with another banner or permanent blank status row. Use `aria-busy`
  and one visually hidden announcement per relevant loading boundary.
- For other filter changes, retain stable page structure and skeleton the affected
  results if there is no matching cache. Never relabel previous filtered rows or
  totals as new results. Switching to a cached filter should be immediate.
- Saving, syncing, deleting, or submitting may keep an existing button's progress
  indicator; preserve its dimensions and label footprint. This is distinct from
  skeletons for loading content. Keep actionable failures and Retry controls.
- Do not add artificial delays or hold useful content until every optional section
  finishes merely to make them appear simultaneously.

## Milestones

### 1. Audit the complete loading surface and establish a short baseline

Implementation tasks:

- [x] Inventory mounted data states, dynamic imports, route fallbacks, and
      responsive post-hydration changes across all five primary pages, all seven
      Settings tabs, and the reachable dialogs/drawers/editors listed above. Record
      location, cold/warm/refresh/filter behavior, placeholder geometry, evidence,
      resolution, and verification status in `frontend/docs/loading-layout-audit.md`.
- [x] Use a production build with the isolated synthetic browser fixture. Reuse
      `backend/test/helpers/serve-browser-fixture.cjs` and normal dev-login cookies;
      do not benchmark real financial accounts or call external sync/providers.
- [x] Extend the existing `frontend/scripts/performance-browser.mjs` and
      `performance-interactions.mjs`, or factor a focused sibling harness. Replace
      their hardcoded `localhost:430` target selection with the supplied origin and
      explicit task-owned tab. Existing fixture endpoints/selectors must be updated
      for the current compact queries. Keep existing benchmark artifact readers
      compatible rather than silently changing their seven-sample assumptions.
- [x] Capture route/data/code request timing, click-to-useful-content,
      click-to-chart-ready, transferred bytes, and hydration/runtime errors.
- [x] Install a `PerformanceObserver` before page scripts for layout-shift entries.
      Record ordinary CLS and a separate interaction-shift trace **including entries
      with `hadRecentInput`**. Track bounding rectangles of visible headings, controls,
      card edges, list origins, and scroll positions; CLS alone misses many click-time
      jumps. Separate deliberate user scrolling/expansion from asynchronous loading.
- [x] Save a new baseline from this released code. Do not reuse the older SSR
      migration's historical bundle sizes or timings as the current baseline.

Exit criteria:

- Every in-scope surface has an audit row and a reproducible check. Each observed
  loading shift has a source component and a planned correction.
- Three runs per key benchmark scenario are recorded with raw samples and medians;
  one visual pass per additional surface is enough unless a failure needs retesting.

### 2. Prepare primary code and data before navigation

Implementation tasks:

- [x] Add a browser-only coordinator, for example `lib/navigation-preload.ts`,
      activated by the authenticated layout after the current route's essential
      content is usable. Use idle scheduling with a bounded fallback, not an arbitrary
      mandatory delay. Prioritize foreground navigation over queued speculation.
- [x] Prepare the code for Home, Transactions, Analysis, Accounts, Settings, and
      shared chart modules. Use the installed router's typed route-chunk loading API
      for code-only preparation; do not use a full route preload and assume it cannot
      run loaders. Keep route-module splitting intact and avoid static imports that
      pull every destination into the initial entry bundle.
- [x] Warm default Home summary/series, the first Transactions page, default
      Analysis range, and Accounts after the current page settles. Reuse shared query
      options and the presentation context's day/date range. Do not copy query keys or
      maintain a second speculative cache. Factor Analysis's default range if needed
      so the loader, page, and coordinator use identical parameters.
- [x] Limit the idle queue to two tasks in flight and one background data task at
      a time. Run once per authenticated document; opening navigation or explicit
      intent can prepare the likely target again under normal Query freshness rules.
      Do not periodically poll, preload all time periods, or fetch extra transaction
      pages speculatively.
- [x] Skip discretionary idle work when the tab is hidden or Save-Data is enabled;
      keep explicit navigation functional. Cancel queued work on logout, account
      identity replacement, and auth-generation changes. Do not cancel a shared
      in-flight query now needed by foreground navigation. Preserve existing currency
      invalidation and the authoritative session boundary.
- [x] Keep access-token/security inventory out of speculative data warming.
      Selected Settings lists may prefetch on section intent through
      `loadSettingsSection`; preserve their existing freshness and authorization rules.

Exit criteria:

- Traces show primary code and likely data can be ready before a quick click/tap;
  warm navigation does not require an avoidable new module or duplicate API fetch.
- Background work respects its bounds and cannot delay a foreground route behind
  the speculative queue. Failures stay local and a normal navigation can retry.
- No private data persists to disk or survives an identity/cache boundary.

### 3. Remove data-then-code waits within pages and sections

Implementation tasks:

- [x] Introduce shared promise-deduplicated import functions, e.g.
      `lib/feature-loaders.ts`, consumed both by `React.lazy` and preparation paths.
      Code-only module promises may be shared; never put user data in this registry.
- [x] Start Home and Analysis chart imports alongside their data requests, rather
      than only after `hasChartData` becomes true. Preload the actual nested chart
      modules, not just their tiny lazy wrappers.
- [x] Start selected Settings section code and its essential data together on
      keyboard, pointer, and touch intent or selection. Prepare dialog code on trigger
      intent where useful; data requests remain tied to the selected entity/context.
      Rare editors keep separate chunks.
- [x] Retain Home's hydration-safe boundary and SSR of summary/accounts. Any
      independently streamed query branch must have matching server/first-client
      markup. Do not suppress hydration warnings or await all optional data in SSR.

Exit criteria:

- Network traces show chart/section code begins before its data response completes
  on a cold interaction. Warm imports add no second loading phase.
- Initial SSR still contains useful financial content. Existing real hydration
  regression tests pass without recoverable errors or summary-node replacement.

### 4. Standardize skeletons and correct layout geometry

Implementation tasks:

- [x] Extend `DataState`, `DeferredFeature`, and `MobileTableList` with typed,
      caller-supplied skeleton fallbacks. Add a small set of reusable shapes under
      `components/loading/` for summaries, chart regions, rows/tables, and forms.
      Module-loading and data-loading fallbacks for the same surface must share shape
      so users do not see spinner → different skeleton → content.
- [x] Give cold route fallbacks a stable shell and route-appropriate skeleton
      structure. Keep persistent navigation and page controls usable. Avoid a tiny
      text fallback that becomes a full-height page a moment later.
- [x] Replace the read-only content spinners identified in the audit across Home,
      Analysis, Accounts, Transactions, Settings, account details, holdings/activity,
      and relevant previews/dialogs. Work through every audit row, not just defaults.
- [x] Remove Home's status line and implement the period-specific skeleton policy
      through `HomePage`, `useBalanceData`, `NetWorthCard`, `AccountSection`, and
      `CompactAccountRow`. Keep period/date/currency matching and cache-clear guards.
- [x] Make `PageHeader` visual sizing CSS-responsive from first paint while retaining
      its `h1` semantics. Audit desktop/mobile table switching and other media-query
      hooks for hydration-time changes; use responsive CSS or stable shells instead
      of mismatched browser-only first renders.
- [x] Reserve chart dimensions, image/avatar slots, form controls, summary lines,
      table viewport/row geometry, and scrollbar space where evidence shows movement.
      Correct chart fallback versus final margins and virtualizer initial sizing.
      Avoid enormous fixed blank areas, clipped data, or hiding content to pass checks.
- [x] Render initial empty/error states in the stable content frame. Render refresh
      failures and retries in a reserved control slot or bounded overlay that does not
      push existing results down, steal focus, or cover important actions. Preserve
      drafts, selected rows, disclosure state, and scroll position across refreshes.
- [x] Keep skeletons noninteractive and hidden from assistive technology; expose a
      concise loading state on their container. Respect reduced motion and masking.
      Do not skeleton or overwrite an active editable draft during a background fetch.

Exit criteria:

- The redundant timeframe status row is gone; the selected control changes
  immediately and stale comparisons are neither visible nor interactable as new.
- All audited read-only loading surfaces use appropriately shaped skeletons.
- Every audit finding is corrected and verified. Loading/unloading indicators do
  not move visible headings, controls, card/list origins, or retained rows by more
  than 1 CSS pixel at a fixed viewport/scroll position. Explicitly changed result
  content and deliberate expansion are classified separately, not used to excuse
  transient loading shifts.
- Empty, error, retry, masked, reduced-motion, and narrow-screen states remain usable.

### 5. Verify improvements, publish evidence, and prepare release

Implementation tasks:

- [x] Re-run the same short baseline matrix with identical data, throttling, browser,
      and build mode. Cover cold direct loads, immediate clicks before warmup, warmed
      navigation, cached returns, stale refresh, and period/filter changes.
- [x] Compare module/data ordering and first-useful/full-section timings; count extra
      background requests and bytes. Warming must not move the delay onto the initial
      page. Investigate a cold useful-content median regression greater than both
      10% and 50ms; do not claim a win based solely on an earlier heading or spinner.
- [x] Use agent-browser on desktop, phone, and tablet portrait/landscape. Include
      pointer, keyboard, and touch flows; four-second delayed requests; rapid period
      changes and out-of-order responses; slow/failed code imports; empty/error/retry;
      and before/after hydration. Record screenshots or a short filmstrip during loads.
- [x] Assert zero attributable loading-induced layout-shift entries in the controlled
      cases, including the interaction trace, and verify the anchor/scroll checks.
      Investigate every nonzero result instead of accepting an aggregate “good CLS”.
      Natural new result sizes, user scrolling, and viewport resizing must be identified
      separately in the report; no unclassified shift can be signed off.
- [x] Update `frontend/docs/ui-conventions.md` with skeleton, preparation, stable
      error, responsive SSR, and truthful filtered-data rules. Finalize
      `frontend/docs/loading-layout-audit.md` and a concise before/after report under
      `frontend/docs/performance/loading-ux/` with sample counts and limitations.
- [x] Run relevant quality gates once the final implementation is stable. Prepare
      one normal frontend release with rollback to the preceding image; no staged
      rollout or migrations are needed. Deployment is a separate explicit action.

Exit criteria:

- All inventory items and overall criteria are verified, with no unresolved
  loading-induced shift or hydration regression in the controlled coverage.
- Warmed primary navigation and section loading improve against the new baseline;
  observed timing gains and extra prefetch cost are reported honestly.
- No production deployment is implied merely by completing this plan.

## Tests

### Backend

No backend implementation or contract changes planned. Use the real local backend
with synthetic fixtures for request counts, permissions, and API timing. Do not
repeat the earlier database benchmark suite for this frontend-only work.

### Frontend

- Coordinator: deduplication, bounded concurrency, foreground priority, default
  parameter parity, hidden tab/Save-Data behavior, failed preload retry, and auth
  generation/currency changes. Assert no speculative pagination or token fetching.
- Query/loader integration: same query keys/cache shape; 30-second reuse; stale
  background refresh and mutation invalidation; rapid navigation and cancellation.
- UI: skeleton versus cached-content behavior; no visible status row; truthful
  period deltas/popovers; empty/error/retry; preserved drafts, selection, focus,
  and scroll. Update existing Home, Analysis, Accounts, Transactions, Settings,
  DataState, MobileTableList, AccountModal, and CompactAccountRow tests as relevant.
- Preserve and extend `NetWorthCard.hydration.test.tsx`, loader tests, and existing
  auth-boundary tests. Shared primitives require integration coverage for callers.
- Use browser measurements for layout and CSS behavior. Do not add tests that only
  assert CSS declarations, constant dimensions, or implementation strings.

## Validation Commands

Run in the isolated implementation worktree; commands below use repository-relative
paths. New test filenames should follow the proposed modules or their final names.

```bash
cd frontend
yarn test src/lib/navigation-preload.test.ts src/lib/queries/loader.test.ts src/lib/queries/primary.test.ts src/hooks/useBalanceData.test.tsx
yarn test src/components/NetWorthCard.hydration.test.tsx src/components/NetWorthCard.test.tsx src/components/DataState.test.tsx src/components/MobileTableList.test.tsx src/components/AccountModal.test.tsx src/components/CompactAccountRow.test.tsx src/routes/_authed/home.test.tsx src/routes/_authed/analysis.test.tsx src/routes/_authed/accounts.test.tsx src/routes/_authed/transactions.test.tsx src/routes/_authed/settings.test.tsx
yarn lint
yarn typecheck
yarn build
```

Record exact final browser-harness commands and fixture configuration in the audit.
Use production builds and task-owned agent-browser sessions; close them and clean
up synthetic servers/schemas afterward. Preserve existing user dev services.
Format the final generated route tree only through the normal router build/plugin.

Implementation and validation completed; per-criterion evidence is recorded in
`plans/loading-ux-ledger.json`. User separately authorized deployment, tracked in
`plans/loading-ux-release.md`.

## Overall Exit Criteria

- [x] Primary page/code/data preparation removes avoidable post-click waits, without
      increasing the critical initial-load dependency chain or creating a request burst.
- [x] Charts and selected Settings sections load code and data in parallel.
- [x] Skeletons are the standard for audited read-only loading states, with stable
      responsive geometry through success, empty, and failure transitions.
- [x] Home period changes have no “currently showing” banner, no transient page
      displacement, no stale comparisons masquerading as the selected period, and no
      scroll/disclosure reset.
- [x] All loading-induced layout shifts identified across the inventory are fixed;
      the defined browser measurements pass, including interaction-time shifts.
- [x] SSR usefulness, hydration correctness, persistent styles, masking, cache
      ownership, authorization, exact money, and mutation behavior are preserved.
- [x] Short before/after evidence and quality gates pass, with API/byte costs shown.
- [x] Changes remain frontend-only. No direct MCP/backend speed improvement is claimed.
