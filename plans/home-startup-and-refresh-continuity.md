# Home Startup And Refresh Continuity

## Status

Implemented and verified; production release in progress.

## Goal

Make returning Home launches visually continuous: no app-controlled white flash or brief branded splash before a usable saved Home, one Home refresh whenever the app returns to the foreground, and a smooth transition from the previous graph to updated data. Identical data should produce no graph movement.

This follows [Cached Home Launch And Periodic Refresh](./cached-home-launch-and-periodic-refresh.md). Preserve its identity checks, read-only saved preview, durable logout invalidation, bounded storage, offline behavior, and rollback switch. The centered header pulse correction already exists as uncommitted work; preserve it and include it in integration validation.

## Current Behavior

- `frontend/vite.config.ts` generates a public `pwa-shell-<buildId>.html` with an empty body and no explicit canvas background or initial appearance. `theme-color` does not paint the document background. This is a code-supported explanation for a possible white first frame, not a device reproduction.
- `src/client.tsx` mounts the local shell with `createRoot(document)`. `router.tsx` has a 150 ms pending threshold. `routes/__root.tsx` starts a snapshot read alongside session validation, but `CachedHomeLaunch.tsx` starts a separate read in an effect and initially returns `LaunchScreen` because its snapshot state is null.
- `DocumentShell` defaults to OLED until presentation is ready. Saved preview uses snapshot appearance; current masking cookies override the snapshot. Appearance must agree across the public shell, preview, and verified app.
- `lib/pwa/startup-images.ts` and root head links configure separate iOS startup images. They use artwork generated from `LaunchScreen`. Native startup happens outside React and has not been tested on a physical device in this task.
- `use-page-refresh.ts` routes visibility and focus events to the same `wake()` method. `page-refresh.ts` refreshes eligible observed queries only when an hour old, except explicit Retry and failed-read reconnect. It already deduplicates in-flight reads, pauses hidden/offline work, and defers around editors.
- Saved Home and verified Home currently occupy separate React trees. Shared `HomeContent` code does not preserve a chart instance across that handoff.
- `NetWorthCard.tsx` always passes `placeholder` and `animate`. `Chart.tsx` starts uninitialized whenever placeholder is enabled, paints decorative points even when real data is available, then switches after 120 ms. This can replay an unrelated curve at handoff.
- The live `useBalanceData.ts` memoizes display points and retains prior period data. `Chart.tsx` recalculates its vertical domain on every series change. Installed Recharts interpolates previous points by index, so changed dates/counts and domain rescaling need explicit coverage. A normal React render alone is not evidence of a remount or unwanted animation.

## Target Data Shape

No backend, API, database, or generated-client changes. Keep the persisted Home snapshot schema unchanged unless implementation proves a migration is necessary.

Add frontend-only launch state that distinguishes `reading`, `available`, and `missing` instead of treating an unresolved read as a cache miss. Any shared launch resource or presentation handoff state is scoped to the current document and authentication epoch, with explicit invalidation. It must not persist another copy of financial data or hold an authenticated user object.

The refresh coordinator should accept an explicit foreground trigger, separate from ordinary focus/hourly wake-ups. A queued foreground intent is scoped to the active identity and Home route, and is consumed once or discarded on logout/navigation.

## Milestones

### 1. Remove Intermediate App Launch Flashes

Implementation tasks:

- [x] Add minimal inline canvas styling to the generated public shell before external CSS/JavaScript. Resolve appearance from the existing lightweight presentation preference mechanism, with the established fallback when preferences are absent or unreadable. Reuse design-system appearance values; never inject private data into cached HTML. Ensure stylesheet and React startup do not briefly replace the chosen canvas with a white/default body.
- [x] Start one bounded snapshot read as early as practical in the local client bootstrap, concurrently with session validation. Share its state with root preparation and `CachedHomeLaunch`, rather than performing another mount-effect read. Preserve epoch checks on both resolution and consumption; storage failure must still resolve to a cache miss.
- [x] Distinguish snapshot reading from confirmed absence. While reading, retain the appearance-matched canvas without mounting the branded launch screen. A usable snapshot becomes the first meaningful app content. Show the existing actionable launch/login/recovery fallback once no usable snapshot is known, without adding an artificial minimum splash duration.
- [x] Give the local launch presenter immediate ownership instead of waiting for the general 150 ms route pending threshold. Keep ordinary navigation's pending behavior unchanged and do not wait for authentication before rendering an eligible read-only snapshot.
- [x] Keep launch presentation continuous through `DocumentShell`, current cookie preferences, saved snapshot preferences, and verified user preferences. Preserve masking from first private paint. Pending logout, anonymous confirmation, and identity mismatch always suppress saved content.
- [x] Audit iOS startup-image registration separately. Retain existing native artwork for this iteration unless physical-device evidence warrants a change; deleting startup images is not proof that iOS can skip its launch phase. Document app-controlled and OS-controlled frames separately.

Exit criteria:

- [x] A production controlled cold launch with an existing snapshot paints no white app frame and no `LaunchScreen` before saved Home, with session and dashboard responses held.
- [x] Missing, expired, corrupt, denied, or stalled storage reaches the appropriate fallback within the existing bounded read deadline; network session validation starts independently.
- [x] Light, Dark, and OLED canvas/preview/live handoff agree with saved preferences; logout, identity switching, rollback-disabled mode, and normal SSR remain correct.

### 2. Refresh Home Once On Each Foreground Return

Implementation tasks:

- [x] Track actual hidden-to-visible transitions in `use-page-refresh.ts`; initial visible mount and focus events while already visible are not additional foreground events. Pass a dedicated intent into `createPageRefreshCoordinator`.
- [x] On foreground while the displayed route is Home, refresh its current enabled, observed dashboard summary and series regardless of their age. Use the current period, date, and reporting currency. Keep other pages on the hourly schedule and do not prefetch Home when another page is visible.
- [x] Deduplicate visibility/focus/reconnect bursts and join existing launch or refresh requests instead of canceling/restarting them. Every distinct subsequent foreground return remains eligible; do not accidentally apply the hourly or failure-backoff age gate to an explicit new return.
- [x] When offline, record at most one pending Home foreground refresh and consume it on reconnect, even if its cached reads are fresh and not marked failed. Discard this intent if identity changes, logout starts, or the user leaves Home.
- [x] Reconcile midnight/timezone changes before selecting query keys. Keep the foreground intent pending until updated observers mount; do not consume it by refreshing yesterday's keys or force a duplicate of a newly started date-key request.
- [x] Preserve editor deferral. If an account/editor modal is active, coalesce pending intent and perform the eligible refresh when editing ends while still visible on Home. Cleanup timers/listeners and pending intent on unmount/logout.
- [x] Continue using the centered header pulse and retained-data failure detail. No bank/provider sync, mutation, notification, credential, or unrelated detail-query refresh is added by the foreground trigger.

Exit criteria:

- [x] A Home foreground return refreshes fresh summary and series exactly once; repeated focus while visible does not. Other pages retain hourly behavior.
- [x] Offline return followed by reconnect refreshes once. Date rollover, open editors, in-flight requests, rapid repeated events, navigation, and cross-tab logout behave as specified without stale requests or lost intent.

### 3. Preserve Chart Continuity Across Handoff And Refresh

Implementation tasks:

- [x] Instrument the production synthetic harness to distinguish chart instance/DOM replacement, data changes, and animation restarts during saved-to-live handoff and ordinary background refresh. Capture SVG paths and their intermediate frames; mocked chart props alone cannot prove smooth motion.
- [x] In `Chart.tsx`, initialize immediately from available real points. Use decorative placeholders only when real data is absent; never impose the 120 ms decorative phase on already available saved/live series.
- [x] Introduce a stable Home presentation host at the launch/verified boundary, using `CachedHomeLaunch`, `HomeContent`, `HomePage`, and the root/layout composition. Keep the actual chart instance mounted while its input changes from saved data to verified data. Keep private query observers and financial actions inside the verified auth boundary; retaining presentation must not retain permission to act. Do not place a second hidden live chart behind the preview.
- [x] Preserve the last actual plotted geometry until matching refreshed series is ready. Summary-only updates, header status changes, masking changes, and structurally identical series must not restart graph animation. Reuse equivalent point data without hiding legitimate currency/date/period changes or invalidated snapshots.
- [x] For same-period value changes, interpolate from the displayed curve to the new curve using the existing short chart motion timing. Keep domain handling coherent during interpolation so small balance changes do not rescale the entire graph abruptly; settle to the correct final domain after the transition.
- [x] Handle added/removed dates and period changes explicitly. Align same-period points by date before interpolation rather than relying on index matching when counts differ. For genuinely different periods, use a deliberate bounded transition without drawing the unrelated decorative curve.
- [x] Handle a second response arriving mid-animation from the currently displayed geometry. Respect reduced motion, prevent stale hover values, and preserve keyboard/touch interactions. Empty/error/missing-series states stay local and actionable; logout or identity mismatch removes private geometry immediately.
- [x] Update real-component workbench scenarios for unchanged refresh, small value change, new endpoint/date, period change, and saved-to-live handoff. Maintain catalog entries and paired loading states. Preserve the uncommitted centered-gradient pulse implementation.

Exit criteria:

- [x] With identical saved and live series, handoff does not replay an entrance animation, decorative curve, or visible graph movement. The chart retains its DOM identity across the intended handoff.
- [x] Small same-period changes move smoothly from the old curve to the new one; response bursts and changed point counts do not whip across the graph or show incorrect final data.
- [x] Reduced motion updates immediately. Chart inspection, masking, period selection, local errors, and auth invalidation remain correct.

### 4. Integration Verification And Release Preparation

Implementation tasks:

- [x] Extend `scripts/verify-cached-home.mjs` with first-frame launch checks, shared-read/fallback behavior, foreground event coverage, and chart identity/geometry assertions. Use production builds and real service worker/IndexedDB with synthetic data.
- [x] Run `$agent-browser` against the real production fixture and updated workbench states at 320px/390px and desktop width, across Light/Dark/OLED and reduced motion. Inspect multiple animation frames, layout anchors, keyboard/touch behavior, and console errors. Run browser commands escalated and close sessions started for this work.
- [x] Exercise launch tests, existing worker lifecycle tests, auth/logout cases, missing shell dependencies, and rollback mode. Rebuild normally after rollback verification. Use the documented isolated benchmark database for the full lifecycle suite.
- [x] Update frontend README, PWA validation notes, workbench documentation, and this plan with actual evidence. Record physical installed-iOS termination/relaunch/resume as pending if no device is available; do not certify the reported native sequence with desktop emulation.
- [x] Complete independent review of launch ownership, foreground intent, chart continuity, and privacy boundaries. Record the outstanding device limitation and deployment readiness; use the normal protected deployment workflow only when deployment is authorized.

Exit criteria:

- [x] Required checks pass and browser evidence covers intermediate frames, not only final screenshots. No duplicate refreshes, blank/brand app frames on usable cached launch, or placeholder animation on data arrival remain.
- [x] Rollback and missing-cache recovery work; release notes distinguish verified browser behavior from physical-iOS unknowns.

## Tests

### Backend

No backend behavior changes or new backend tests. Existing lifecycle-suite backend auth/session tests remain part of integration validation.

### Frontend

- Launch resource/epoch tests: one shared read, bounded failure, late resolution after logout, identity mismatch, preference/masking handoff, and rollback disabled.
- Coordinator/hook tests: fresh Home foreground, initial mount, focus duplication, in-flight deduplication, offline pending intent, reconnect, editor defer/release, route/identity cleanup, and date rollover.
- Chart/NetWorthCard and Home tests: real data on initial mount, unchanged data/reference churn, retained live chart, updates during interaction, and reduced motion. Avoid tests that merely assert CSS strings.
- Workbench and real-browser geometry tests: initial/saved/live handoff, unchanged and small changes, changing domains, added/removed dates, rapid responses, and period switches.

## Validation Commands

Run from `frontend`, using targeted patterns first:

```bash
yarn test src/lib/page-refresh.test.ts src/components/Chart.test.tsx src/components/NetWorthCard.test.tsx src/hooks/useBalanceData.test.tsx
yarn test src/lib/pwa src/lib/session.test.ts src/routes/_authed/home.test.tsx
yarn test workbench --maxWorkers=2
yarn lint
yarn typecheck
yarn tokens:check
yarn workbench:build
VITE_API_BASE_URL='' yarn build
yarn pwa:check
yarn pwa:launch-test
yarn pwa:cached-home-test
# Use the documented isolated benchmark database environment:
yarn pwa:test --channel=chromium
```

Include any new launch/hook test files in targeted runs. Run the full frontend suite after integration. Verify `VITE_CACHED_HOME=false` with a production build and launch checks, then restore the normal enabled build. Browser/PWA server commands require the documented sandbox escalation; never print database credentials.

## Overall Exit Criteria

- [x] A returning controlled launch with a usable snapshot goes from an appearance-matched canvas directly to saved Home, then verified Home without an app splash or graph restart.
- [x] Every real foreground return on Home requests current data once while preserving content and edits; other pages retain hourly refresh.
- [x] Identical chart data stays still, changed data transitions smoothly, and final geometry/values are correct.
- [x] Session/auth boundaries, masking, logout, offline/failure recovery, SSR, cache compatibility, and rollback remain intact.
- [x] Checks and browser validation pass; physical-iOS limitations and release status are recorded honestly.

## Implementation Evidence

See the [implementation ledger](./home-continuity-implementation-ledger.md) for verification and release evidence. All implementation milestones and automated/browser gates pass. Physical installed-iOS process termination/relaunch/resume remains a device-only validation limitation; native startup artwork was retained, and desktop checks do not certify OS-controlled frames.
