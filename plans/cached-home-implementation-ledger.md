# Cached Home Implementation Ledger

All scope from the plan is tracked below. Statuses: pending, in_progress, implemented, verified, blocked.


### 1. Establish A Locally Bootable Launch Path
- verified: Add a generic, versioned PWA launch shell and a client bootstrap seam under `frontend/src/lib/pwa/`, wired through `vite.config.ts`, `sw.ts`, and `static-cache.ts`. The shell contains no private data or serialized authentication state.
- verified: Prove the installed TanStack Start version's client mounting path against a production build before expanding the feature. Use a client-rendered launch path with a separate preview boundary; do not call hydration against arbitrary cached server HTML. Document the actual bootstrap entry and mount ownership selected in this milestone.
- verified: Serve the locally bootable shell on controlled eligible root/Home navigations, without awaiting a network response. Preserve search parameters. Exclude OAuth/auth endpoints, recovery endpoints, other private deep links, and pending logout. Noncontrolled launches and direct private SSR continue to work.
- verified: Cache the shell and its complete required JS/CSS dependency set coherently by build. Missing assets or incompatible builds take the existing recovery/network path; never mix an old shell with incompatible new chunks.
- verified: Integrate preview-to-live transition in the same document. Keep the preview mounted while authenticated routing prepares; remove it only when the live destination is ready, without a second full-document reload or flash of the validating screen. Ensure only the verified tree can run private observers or mutations.

### 2. Persist And Restore A Read-Only Home Snapshot
- verified: Add bounded IndexedDB snapshot storage, runtime validation, and a durable invalidation epoch separate from worker push control. Storage reads must have a bounded timeout and must not delay network validation; storage errors are a cache miss, not a broken launch.
- verified: Save only successful, verified, non-placeholder Home data from `useBalanceData`/dashboard queries. Preserve separate summary/series freshness and parameters. Coalesce writes; never save drafts, full user/session objects, provider credentials, or errors.
- verified: Extract Home presentation for use by live `HomePage` and a read-only cached preview. Share frames, chart rendering, styling, and balance masking. Disable period changes, account drill-down, navigation, and financial writes until validation; retain a usable sign-out path and local masking control.
- verified: Display the saved period and date truthfully. On a new local day or changed currency/settings, retain a clearly identified saved preview until matching live data is ready; never seed an old response under today's query key. Put saved-as-of context in accessible status/detail rather than a persistent banner.
- verified: On verified matching identity, seed only allowlisted dashboard queries with exact keys and original timestamps, without overwriting newer live data. Refresh on launch even if snapshot data appears fresh. Load current preferences and reconcile before presenting live content.
- verified: On confirmed logout, identity mismatch, or explicit sign-out, immediately remove private preview/live content and invalidate persistent eligibility before asynchronous cleanup. Cancel writes and reject late reads/writes using the durable epoch, including across tabs and while offline. If durable invalidation cannot be recorded, ensure snapshot deletion succeeds or disable future preview restoration rather than claiming successful cleanup.
- verified: Keep a snapshot on transient session/network failure, with read-only interaction and status detail. Confirmed anonymous responses remove it and route to sign-in. Pending logout always overrides restoration.

### 3. Add Header Refresh And Failure Presentation
- verified: Add a presentational refresh-status input to `AppShellLayout` and a colocated status component/CSS. Keep networking ownership with the caller/coordinator; the cached launch and live app share this presentation.
- verified: Draw the selected 1px animated header-edge indicator without adding height or moving content. Delay appearance by 200 ms to avoid flashing; stop promptly after completion/failure. Use existing appearance/accent tokens for Light, Dark, and OLED. Reduced motion uses a static edge treatment.
- verified: Show the offline/failure icon beside Splice only when relevant, with a reserved slot and a nonoverlapping touch target. Tooltip/detail text: “Offline · Showing saved data from …” or “Couldn't refresh · Last updated …”; omit an unknown timestamp. Hover/focus reveals the tooltip; tap opens equivalent detail with Retry. Escape dismisses and returns focus.
- verified: Add a polite accessible announcement for phase changes without duplicate announcements from every query. Keep actual data freshness visible in status detail, including partial failures.
- verified: Extend `DataState` with an explicit owner-selected background-error mode so coordinated retained-data failures use the header icon instead of duplicate overlays. Keep initial-load errors, missing chart data, failed new-filter loads, and mutation errors local and actionable.
- verified: Update real-component workbench states and `catalog.json`/`catalog.md` together: cached validating, hourly refreshing, fresh, offline, refresh failure, retrying, masked, empty, missing series, and no snapshot. Update UI conventions to document the scoped exception to retained-data error overlays.

### 4. Refresh Visible Pages Hourly
- verified: Add a per-document refresh coordinator under `lib/`, mounted from authenticated layout and scoped to the active identity. Share in-flight work through QueryClient; clean up timers/listeners on logout/unmount.
- verified: Explicitly mark eligible page-read query options in `lib/queries/` (and route-local options where necessary). Refresh enabled, observed reads for the displayed page and its open detail views; exclude inactive prefetches, token/credential lists, mutations, and provider sync calls. Do not fetch new infinite-query pages or reset loaded pagination.
- verified: Schedule from successful data timestamps, not “one hour after mount.” Add a visible-page sweep for queries at least 60 minutes old. Only successful reads advance their freshness; partial success must not mark failed data fresh. Initial data fetching, changed filters, and post-mutation invalidation retain existing immediate behavior and the 30-second navigation reuse policy.
- verified: Pause scheduled work while hidden/offline. On visibility or focus return, run one deduplicated catch-up for overdue data. On reconnect, also retry a previously failed/interrupted refresh without waiting a full hour. Prevent focus + visibility + reconnect bursts; bounded failure backoff must not produce a tight retry loop.
- verified: Override default focus/reconnect triggers only for coordinator-owned queries so they do not independently refetch every stale query after 30 seconds. Preserve session validation, notification-specific freshness, and other explicitly separate policies. Audit prefetch observers so background preparation does not drive the header line.
- verified: Reconcile presentation timezone/date rollover before date-dependent refreshes. A midnight or timezone change creates correct query parameters without relabeling old financial comparisons.
- verified: Aggregate status only from launch work and current-page reads, not all global fetching. Existing matching data remains mounted; preserve selection, scroll, drafts, and focus. Respect existing editor initialization rules and defer any read whose reconciliation would overwrite an active draft.
- verified: Stop tracking superseded page requests in the current header; their late failures cannot change another page's status. Each visible tab may refresh its own observed data; hidden tabs do not poll, and cross-tab logout remains authoritative.

### 5. Validate Lifecycle, Document, And Prepare Rollback
- verified: Extend `scripts/verify-launch.mjs` and `scripts/test-pwa-lifecycle.mjs` with synthetic users and persisted storage. Close/reopen a page or browser context while retaining its profile to prove a cold start, rather than relying on a warm QueryClient.
- verified: Cover successful/held/expired sessions, server failure, offline restart, reconnect, pending offline logout, account switching, worker upgrade, storage eviction, shell asset failure, and stale date/period data. Keep current push and worker lifecycle checks.
- verified: Use `$agent-browser` for the real app and affected workbench states. Run agent-browser outside the sandbox as required and close only sessions started for this work. Use the local-dev skill/auth bypass when a local authenticated environment is needed; preserve existing servers.
- verified: Record visual checks at 320px and approximately 390px phone widths plus a desktop viewport, all three appearance modes, representative accent, and reduced motion. Compare header/content anchors before/during/after refresh and inspect console errors and tooltip touch/focus behavior.
- verified: Add a physical installed-iOS check for process termination/relaunch and resume scheduling; record it as pending if device validation cannot be performed. Browser emulation does not certify native splash or iOS process lifecycle.
- verified: Update `frontend/README.md`, `docs/pwa-validation.md`, and workbench documentation with local persistence, expiry, read-only prevalidation behavior, refresh scheduling, and actual evidence. Add a build-time rollback switch: disable snapshot writes/restoration and shell interception, purge the snapshot store when the updated client runs, and return to existing network launch. Explain that already-offline old clients require an update/online visit to receive a rollback.

### Backend

### Frontend

## Overall Exit Criteria
- verified: A returning controlled PWA launch shows a valid saved Home without waiting for session or dashboard network responses; no-snapshot launches retain a functional fallback.
- verified: Cached preview remains read-only until identity is verified, displays saved values/periods honestly, honors masking, and cannot survive explicit logout or an observed identity change.
- verified: Header-edge animation is subtle and layout-stable; offline/failure uses an accessible icon and tooltip/detail beside Splice with Retry.
- verified: Visible pages refresh hourly, catch up on overdue resume, and recover on reconnect while preserving content and edits; no offline writes or provider-sync scheduling is introduced.
- verified: Build compatibility, SSR/auth paths, worker updates, notification behavior, and recovery remain sound. No private HTML or credentials are persisted.
- verified: Required tests/checks and real-browser validation pass; physical-device evidence or its outstanding limitation is recorded. Rollback behavior is documented and exercised.

## Delivery
- verified: Independent review and fix loop.
- in_progress: Commit and push verified implementation.
- pending: Run Deploy workflow, verify required CI and production rollout.

## Milestone 4 Evidence

- `page-refresh.test.ts`: 10 passing fake-clock behavioral tests cover successful timestamp scheduling, early focus suppression, hidden/offline pause, reconnect deduplication, failed-read backoff, inactive/disabled/token exclusions, editor defer, date reconciliation ordering, timer cleanup, detached late failures, newly observed pages, infinite pagination retention, partial-success timestamps, and auth/notification policy separation.
- `presentation-preferences.test.tsx`: 6 passing tests, including midnight and timezone reconciliation. Accounts retained-data test updated and passing; initial no-data Retry remains local.
- Transactions page (10), primary query (2), and investment activity hook (2) tests passed. Targeted ESLint passes with the existing require-await warning in presentation preferences.
- Scheduler and hook are nonvisual helpers covered by behavioral tests; no standalone workbench tile. Production browser scheduling and stable header checks passed; editor deferral and retained pagination are covered by behavioral tests.

## Final Verification Evidence (2026-09-08)

- Full frontend `yarn test`: 119 files, 870 tests passed. `yarn typecheck`, `yarn lint` (0 errors, 22 warnings), and `yarn tokens:check` passed. Production and workbench builds passed; 57 workbench tests passed.
- `VITE_API_BASE_URL='' yarn build`, `yarn pwa:check`, `yarn pwa:launch-test`, and `yarn pwa:cached-home-test` passed. The dedicated cached-Home harness owns new profile/IndexedDB scenarios instead of expanding the existing launch harness. It covers held cold launch and same-document handoff, masking changes during preparation, offline restart, transient session failure/Retry, stale-date failure retention, identity switch, pending logout, anonymous purge, denied storage, hourly refresh without provider sync, and a held period change after handoff.
- Full `yarn pwa:test --channel=chromium` passed all 18 worker lifecycle browser checks with an isolated benchmark database/schema. Full Chromium avoids a headless-shell BadgeService crash; assertions remain intact.
- Rollback build with `VITE_CACHED_HOME=false` passed artifact checks and original launch verification; normal enabled build restored and retested afterward.
- Agent-browser checked real production synthetic Home and workbench at 320px, 390px, and 1440px, across Light/Dark/OLED and reduced motion. Tooltip/tap/Retry/Escape, masking, inert preview controls, layout anchors, and console health passed. Sessions started for verification were closed.
- Independent implementation and review/fix work used three subagents. Three substantive review/fix passes plus final regression review addressed launch retention, masking handoff, identity invalidation, durable cleanup, read deadlines, and offline chart dependencies. Final source review found no major issues.
- Physical installed-iOS termination/relaunch and native splash remain unverified because no physical device is connected. The plan's requirement to document this limitation is satisfied; browser emulation is not claimed as device evidence.
