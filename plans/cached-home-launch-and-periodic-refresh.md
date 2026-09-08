# Cached Home Launch And Periodic Refresh

## Status

Implemented and verified; release in progress. See [implementation ledger](./cached-home-implementation-ledger.md) for evidence and physical-device limitation.

## Goal

Returning users see their last saved Home immediately on a cold PWA launch while Splice checks their session and refreshes data. A subtle animated line at the header's bottom edge indicates refresh activity. Offline or failed refreshes stop the animation and show a small icon with a tooltip beside the Splice title. Open, visible pages refresh their displayed data hourly without replacing content, resetting scroll, or disturbing editors.

Accepted product behavior:

- Cache the last successful Home view locally and display it before network session validation. Until validated, it is a read-only preview of the previously signed-in user's data, not proof of authentication. Respect saved balance masking from the first paint. Do not add an opt-in or onboarding step in this scope.
- Use the header-edge design selected in the conversation: a 1px, low-contrast accent line along the existing header divider, with restrained indeterminate animation and no progress percentage. No spinner beside the title during normal refresh.
- Use a muted `WifiOff` icon for offline and a muted `CircleAlert` icon for failed refresh beside Splice. Tooltip content identifies the state and last successful update; it is accessible on hover, focus, and tap. Provide an explicit Retry action in the tap/focus detail surface.
- Periodic reads update Splice data, not financial-provider synchronization. No offline write queue or provider-sync schedule is introduced.
- Cold-start persistence is limited to Home. Other pages keep their existing data in memory while open and participate in hourly refreshes.

This plan intentionally supersedes the no-financial-snapshot scope in `pwa-shell-and-offline-state.md` and `pwa-reliability-privacy-and-experience.md` for this bounded Home snapshot only. Keep their historical completion records intact. Authenticated HTML, credentials, drafts, notification contents, and general API response caching remain outside persistent storage.

## Current Behavior

- `frontend/src/sw.ts` caches approved static requests through `lib/pwa/static-cache.ts`. `handlePwaNavigation` in `lib/pwa/offline-page.ts` uses the network and an eight-second headers deadline, then returns a public recovery document. It cannot currently boot Home offline.
- `frontend/vite.config.ts` builds the worker and tracks essential versioned assets. `lib/pwa/service-worker.ts` and `static-cache.ts` manage build transitions and retained asset versions.
- `routes/__root.tsx` disables SSR at `/`, shows `LaunchScreen`, and awaits session resolution. Direct private routes retain authenticated SSR. `_authed.tsx` enforces the session and mounts `PrivateSessionBoundary` before private content.
- `router.tsx` creates a fresh QueryClient. `lib/session.ts` and `auth-generation.ts` treat successful `/user/me` data as identity evidence. Do not hydrate an unverified persisted user into this query.
- `routes/_authed/home.tsx`, `lib/queries/dashboard.ts`, and `hooks/useBalanceData.ts` own Home summary and series queries keyed by period and end date. `lib/queries/loader.ts` already retains matching cached results during background refresh.
- `components/pages/HomePage.tsx` mixes data hooks/navigation with reusable `HomePageFrame`, `NetWorthCard`, and `AccountSection` presentation. Extract shared rendering rather than constructing a second visual Home implementation.
- `components/AppShellLayout.tsx` owns header geometry and the Splice title. `DataState.tsx` currently renders an overlay for retained-data failures. Header-owned background failures need a scoped alternative; initial/no-data failures must remain actionable in their owning component.
- `lib/query-policy.ts` sets 30-second financial staleness and five-minute session staleness. It does not define an hourly scheduler or override general focus/reconnect behavior. Notification queries explicitly opt into focus/reconnect refresh.
- `lib/presentation-preferences.tsx` owns masking, appearance, and the presentation date. A long-running document needs date rollover reconciliation before refreshing date-keyed queries.
- Logout already uses `auth.ts`, `auth-generation.ts`, and durable `lib/pwa/logout-state.ts`; new snapshot invalidation must join these boundaries. Existing worker control storage has a separate purpose and must remain separate.
- Workbench examples `page-home`, `launch-screen`, and `pwa-lifecycle`, plus the PWA launch/lifecycle scripts, cover the main integration seams.

## Target Data Shape

No backend schema, API contract, or generated-client changes are planned. Add versioned frontend-only types. Reuse generated dashboard response types rather than copying money or account schemas.

```ts
type HomeSnapshot = {
  schemaVersion: 1
  identity: string
  authEpoch: string
  savedAt: number
  period: TimePeriod
  endDate: string
  presentation: {
    currency: string
    timezone: string
    appearance: AppearancePreference
    maskBalances: boolean
    hideZeroBalanceAccounts: boolean
  }
  summary: { data: DashboardSummaryResponse; updatedAt: number }
  // Optional; preserve its own timestamp and exact query parameters.
  series: { data: DashboardSeriesResponse; updatedAt: number } | null
}

type RefreshStatus = {
  phase: 'idle' | 'refreshing' | 'offline' | 'error'
  lastSuccessfulAt: number | null
}
```

Implementation defaults: retain one latest Home snapshot per browser profile for at most seven days, with a 2 MiB serialized size ceiling. These are local retention limits, not freshness claims. Failed or partial requests never advance the affected data's timestamp. Validate shape, identity epoch, parameters, timestamps, and size on restore; corrupt, incompatible, expired, or inaccessible storage falls back to the existing launch behavior. A valid empty Home is cacheable.

## Milestones

### 1. Establish A Locally Bootable Launch Path

Implementation tasks:

- [x] Add a generic, versioned PWA launch shell and a client bootstrap seam under `frontend/src/lib/pwa/`, wired through `vite.config.ts`, `sw.ts`, and `static-cache.ts`. The shell contains no private data or serialized authentication state.
- [x] Prove the installed TanStack Start version's client mounting path against a production build before expanding the feature. Use a client-rendered launch path with a separate preview boundary; do not call hydration against arbitrary cached server HTML. Document the actual bootstrap entry and mount ownership selected in this milestone.
- [x] Serve the locally bootable shell on controlled eligible root/Home navigations, without awaiting a network response. Preserve search parameters. Exclude OAuth/auth endpoints, recovery endpoints, and other private deep links. The public shell may boot during pending logout; its client must suppress all saved content and mount the existing logout recovery path. Noncontrolled launches and direct private SSR continue to work.
- [x] Cache the shell and its complete required JS/CSS dependency set coherently by build. Missing assets or incompatible builds take the existing recovery/network path; never mix an old shell with incompatible new chunks.
- [x] Integrate preview-to-live transition in the same document. Keep the preview mounted while authenticated routing prepares; remove it only when the live destination is ready, without a second full-document reload or flash of the validating screen. Ensure only the verified tree can run private observers or mutations.

Exit criteria:

- A production-built controlled launch paints the local shell while all network responses are held, and the supported client mount has no hydration/runtime errors.
- Direct private-route SSR, logged-out sign-in, OAuth return, recovery, worker updates, and missing-asset fallback remain functional.
- `pwa:check` and focused launch/lifecycle assertions verify versioned shell dependency coverage and that no authenticated document entered Cache Storage.

### 2. Persist And Restore A Read-Only Home Snapshot

Implementation tasks:

- [x] Add bounded IndexedDB snapshot storage, runtime validation, and a durable invalidation epoch separate from worker push control. Storage reads must have a bounded timeout and must not delay network validation; storage errors are a cache miss, not a broken launch.
- [x] Save only successful, verified, non-placeholder Home data from `useBalanceData`/dashboard queries. Preserve separate summary/series freshness and parameters. Coalesce writes; never save drafts, full user/session objects, provider credentials, or errors.
- [x] Extract Home presentation for use by live `HomePage` and a read-only cached preview. Share frames, chart rendering, styling, and balance masking. Disable period changes, account drill-down, navigation, and financial writes until validation; retain a usable sign-out path and local masking control.
- [x] Display the saved period and date truthfully. On a new local day or changed currency/settings, retain a clearly identified saved preview until matching live data is ready; never seed an old response under today's query key. Put saved-as-of context in accessible status/detail rather than a persistent banner.
- [x] On verified matching identity, seed only allowlisted dashboard queries with exact keys and original timestamps, without overwriting newer live data. Refresh on launch even if snapshot data appears fresh. Load current preferences and reconcile before presenting live content.
- [x] On confirmed logout, identity mismatch, or explicit sign-out, immediately remove private preview/live content and invalidate persistent eligibility before asynchronous cleanup. Cancel writes and reject late reads/writes using the durable epoch, including across tabs and while offline. If durable invalidation cannot be recorded, ensure snapshot deletion succeeds or disable future preview restoration rather than claiming successful cleanup.
- [x] Keep a snapshot on transient session/network failure, with read-only interaction and status detail. Confirmed anonymous responses remove it and route to sign-in. Pending logout always overrides restoration.

Exit criteria:

- A previously loaded Home, including chart when saved, appears before a held session response and transitions to fresh data without a blank screen or geometry reset.
- No saved user is inserted into `/user/me`; cached preview cannot authorize API activity or accept an identity.
- Logout/account switching, cross-tab clear, delayed writes, quota failures, expiry, invalid JSON/shape, and date/period mismatch have behavioral tests. No old identity can be restored after a successful local clear.

### 3. Add Header Refresh And Failure Presentation

Implementation tasks:

- [x] Add a presentational refresh-status input to `AppShellLayout` and a colocated status component/CSS. Keep networking ownership with the caller/coordinator; the cached launch and live app share this presentation.
- [x] Draw the selected 1px animated header-edge indicator without adding height or moving content. Delay appearance by 200 ms to avoid flashing; stop promptly after completion/failure. Use existing appearance/accent tokens for Light, Dark, and OLED. Reduced motion uses a static edge treatment.
- [x] Show the offline/failure icon beside Splice only when relevant, with a reserved slot and a nonoverlapping touch target. Tooltip/detail text: “Offline · Showing saved data from …” or “Couldn't refresh · Last updated …”; omit an unknown timestamp. Hover/focus reveals the tooltip; tap opens equivalent detail with Retry. Escape dismisses and returns focus.
- [x] Add a polite accessible announcement for phase changes without duplicate announcements from every query. Keep actual data freshness visible in status detail, including partial failures.
- [x] Extend `DataState` with an explicit owner-selected background-error mode so coordinated retained-data failures use the header icon instead of duplicate overlays. Keep initial-load errors, missing chart data, failed new-filter loads, and mutation errors local and actionable.
- [x] Update real-component workbench states and `catalog.json`/`catalog.md` together: cached validating, hourly refreshing, fresh, offline, refresh failure, retrying, masked, empty, missing series, and no snapshot. Update UI conventions to document the scoped exception to retained-data error overlays.

Exit criteria:

- Header status changes do not shift title, actions, content, or chart; no normal refresh spinner appears beside Splice.
- Failure stops animation, retains existing content, exposes useful accessible detail and Retry, and never replaces initial/mutation error handling.
- Workbench browser inspection covers phone/desktop, Light/Dark/OLED, reduced motion, keyboard focus, and touch detail behavior.

### 4. Refresh Visible Pages Hourly

Implementation tasks:

- [x] Add a per-document refresh coordinator under `lib/`, mounted from authenticated layout and scoped to the active identity. Share in-flight work through QueryClient; clean up timers/listeners on logout/unmount.
- [x] Explicitly mark eligible page-read query options in `lib/queries/` (and route-local options where necessary). Refresh enabled, observed reads for the displayed page and its open detail views; exclude inactive prefetches, token/credential lists, mutations, and provider sync calls. Do not fetch new infinite-query pages or reset loaded pagination.
- [x] Schedule from successful data timestamps, not “one hour after mount.” Add a visible-page sweep for queries at least 60 minutes old. Only successful reads advance their freshness; partial success must not mark failed data fresh. Initial data fetching, changed filters, and post-mutation invalidation retain existing immediate behavior and the 30-second navigation reuse policy.
- [x] Pause scheduled work while hidden/offline. On visibility or focus return, run one deduplicated catch-up for overdue data. On reconnect, also retry a previously failed/interrupted refresh without waiting a full hour. Prevent focus + visibility + reconnect bursts; bounded failure backoff must not produce a tight retry loop.
- [x] Override default focus/reconnect triggers only for coordinator-owned queries so they do not independently refetch every stale query after 30 seconds. Preserve session validation, notification-specific freshness, and other explicitly separate policies. Audit prefetch observers so background preparation does not drive the header line.
- [x] Reconcile presentation timezone/date rollover before date-dependent refreshes. A midnight or timezone change creates correct query parameters without relabeling old financial comparisons.
- [x] Aggregate status only from launch work and current-page reads, not all global fetching. Existing matching data remains mounted; preserve selection, scroll, drafts, and focus. Respect existing editor initialization rules and defer any read whose reconciliation would overwrite an active draft.
- [x] Stop tracking superseded page requests in the current header; their late failures cannot change another page's status. Each visible tab may refresh its own observed data; hidden tabs do not poll, and cross-tab logout remains authoritative.

Exit criteria:

- Fake-clock tests establish hourly refresh, no early focus refetch for managed data, resume catch-up, reconnect recovery, deduplication, failure backoff, date rollover, and timer cleanup.
- Browser tests show open Home, Accounts, Transactions, Analysis, and Settings refreshing their eligible data without reset or provider synchronization; notification/session policies remain intact.
- Slow and partial responses produce truthful header status and do not erase cached data or mark failed queries current.

### 5. Validate Lifecycle, Document, And Prepare Rollback

Implementation tasks:

- [x] Extend `scripts/verify-launch.mjs` and `scripts/test-pwa-lifecycle.mjs` with synthetic users and persisted storage. Close/reopen a page or browser context while retaining its profile to prove a cold start, rather than relying on a warm QueryClient.
- [x] Cover successful/held/expired sessions, server failure, offline restart, reconnect, pending offline logout, account switching, worker upgrade, storage eviction, shell asset failure, and stale date/period data. Keep current push and worker lifecycle checks.
- [x] Use `$agent-browser` for the real app and affected workbench states. Run agent-browser outside the sandbox as required and close only sessions started for this work. Use the local-dev skill/auth bypass when a local authenticated environment is needed; preserve existing servers.
- [x] Record visual checks at 320px and approximately 390px phone widths plus a desktop viewport, all three appearance modes, representative accent, and reduced motion. Compare header/content anchors before/during/after refresh and inspect console errors and tooltip touch/focus behavior.
- [x] Add a physical installed-iOS check for process termination/relaunch and resume scheduling; record it as pending if device validation cannot be performed. Browser emulation does not certify native splash or iOS process lifecycle.
- [x] Update `frontend/README.md`, `docs/pwa-validation.md`, and workbench documentation with local persistence, expiry, read-only prevalidation behavior, refresh scheduling, and actual evidence. Add a build-time rollback switch: disable snapshot writes/restoration and shell interception, purge the snapshot store when the updated client runs, and return to existing network launch. Explain that already-offline old clients require an update/online visit to receive a rollback.

Exit criteria:

- All required frontend/PWA checks pass, browser evidence is recorded, and any device-only validation gap is explicitly documented.
- Rollback exercises the original launch path without breaking worker updates, logout, push, or authenticated SSR.

## Tests

### Backend

- No backend changes expected; preserve existing auth/refresh and provider-sync contracts. Verify through frontend integration that periodic reads do not invoke sync/write endpoints.

### Frontend

- Snapshot serialization/restoration: exact types/keys/timestamps, empty Home, optional series, size/age bounds, corrupt or unavailable storage, masking, date rollover, and no session query restoration.
- Identity lifecycle: pending logout, anonymous versus transient auth failure, cross-tab changes, stale async writes after clear, and logout without a network connection.
- Scheduler: successful timestamps, visibility/offline pauses, focus and reconnect coordination, partial failure, bounded retries, active query selection, infinite-query retention, and unmount cleanup.
- Components: phase transitions, header-owned errors versus initial/filter/mutation errors, retry, accessible tooltip/detail, and preserved drafts/selection. Do not add tests that merely assert CSS strings or line thickness.
- Extend existing `session-hydration.test.tsx`, `auth-generation.test.ts`, `auth.test.ts`, relevant `lib/pwa/*.test.ts`, and Home/query tests where they own the behavior. Add colocated tests for new snapshot and scheduler modules.

## Validation Commands

Run from `frontend/`. Use focused Vitest files during milestones, then the relevant complete checks before final review:

```bash
yarn test
yarn lint
yarn typecheck
yarn tokens:check
yarn test workbench --maxWorkers=2
yarn workbench:build
yarn build
yarn pwa:check
yarn pwa:launch-test
yarn pwa:test
```

Follow `frontend/docs/pwa-validation.md` and the scripts' documented environment requirements for production-build lifecycle runs. Browser validation uses the workbench stable URLs and the real app; screenshots alone are not interaction verification.

## Overall Exit Criteria

- [x] A returning controlled PWA launch shows a valid saved Home without waiting for session or dashboard network responses; no-snapshot launches retain a functional fallback.
- [x] Cached preview remains read-only until identity is verified, displays saved values/periods honestly, honors masking, and cannot survive explicit logout or an observed identity change.
- [x] Header-edge animation is subtle and layout-stable; offline/failure uses an accessible icon and tooltip/detail beside Splice with Retry.
- [x] Visible pages refresh hourly, catch up on overdue resume, and recover on reconnect while preserving content and edits; no offline writes or provider-sync scheduling is introduced.
- [x] Build compatibility, SSR/auth paths, worker updates, notification behavior, and recovery remain sound. No private HTML or credentials are persisted.
- [x] Required tests/checks and real-browser validation pass; physical-device evidence or its outstanding limitation is recorded. Rollback behavior is documented and exercised.
