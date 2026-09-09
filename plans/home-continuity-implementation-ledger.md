# Home Continuity Implementation Ledger

### 1. Remove Intermediate App Launch Flashes
- verified: Add minimal inline canvas styling to the generated public shell before external CSS/JavaScript. Resolve appearance from the existing lightweight presentation preference mechanism, with the established fallback when preferences are absent or unreadable. Reuse design-system appearance values; never inject private data into cached HTML. Ensure stylesheet and React startup do not briefly replace the chosen canvas with a white/default body.
- verified: Start one bounded snapshot read as early as practical in the local client bootstrap, concurrently with session validation. Share its state with root preparation and `CachedHomeLaunch`, rather than performing another mount-effect read. Preserve epoch checks on both resolution and consumption; storage failure must still resolve to a cache miss.
- verified: Distinguish snapshot reading from confirmed absence. While reading, retain the appearance-matched canvas without mounting the branded launch screen. A usable snapshot becomes the first meaningful app content. Show the existing actionable launch/login/recovery fallback once no usable snapshot is known, without adding an artificial minimum splash duration.
- verified: Give the local launch presenter immediate ownership instead of waiting for the general 150 ms route pending threshold. Keep ordinary navigation's pending behavior unchanged and do not wait for authentication before rendering an eligible read-only snapshot.
- verified: Keep launch presentation continuous through `DocumentShell`, current cookie preferences, saved snapshot preferences, and verified user preferences. Preserve masking from first private paint. Pending logout, anonymous confirmation, and identity mismatch always suppress saved content.
- verified: Audit iOS startup-image registration separately. Retain existing native artwork for this iteration unless physical-device evidence warrants a change; deleting startup images is not proof that iOS can skip its launch phase. Document app-controlled and OS-controlled frames separately.
- verified: A production controlled cold launch with an existing snapshot paints no white app frame and no `LaunchScreen` before saved Home, with session and dashboard responses held.
- verified: Missing, expired, corrupt, denied, or stalled storage reaches the appropriate fallback within the existing bounded read deadline; network session validation starts independently.
- verified: Light, Dark, and OLED canvas/preview/live handoff agree with saved preferences; logout, identity switching, rollback-disabled mode, and normal SSR remain correct.

### 2. Refresh Home Once On Each Foreground Return
- verified: Track actual hidden-to-visible transitions in `use-page-refresh.ts`; initial visible mount and focus events while already visible are not additional foreground events. Pass a dedicated intent into `createPageRefreshCoordinator`.
- verified: On foreground while the displayed route is Home, refresh its current enabled, observed dashboard summary and series regardless of their age. Use the current period, date, and reporting currency. Keep other pages on the hourly schedule and do not prefetch Home when another page is visible.
- verified: Deduplicate visibility/focus/reconnect bursts and join existing launch or refresh requests instead of canceling/restarting them. Every distinct subsequent foreground return remains eligible; do not accidentally apply the hourly or failure-backoff age gate to an explicit new return.
- verified: When offline, record at most one pending Home foreground refresh and consume it on reconnect, even if its cached reads are fresh and not marked failed. Discard this intent if identity changes, logout starts, or the user leaves Home.
- verified: Reconcile midnight/timezone changes before selecting query keys. Keep the foreground intent pending until updated observers mount; do not consume it by refreshing yesterday's keys or force a duplicate of a newly started date-key request.
- verified: Preserve editor deferral. If an account/editor modal is active, coalesce pending intent and perform the eligible refresh when editing ends while still visible on Home. Cleanup timers/listeners and pending intent on unmount/logout.
- verified: Continue using the centered header pulse and retained-data failure detail. No bank/provider sync, mutation, notification, credential, or unrelated detail-query refresh is added by the foreground trigger.
- verified: A Home foreground return refreshes fresh summary and series exactly once; repeated focus while visible does not. Other pages retain hourly behavior.
- verified: Offline return followed by reconnect refreshes once. Date rollover, open editors, in-flight requests, rapid repeated events, navigation, and cross-tab logout behave as specified without stale requests or lost intent.

### 3. Preserve Chart Continuity Across Handoff And Refresh
- verified: Instrument the production synthetic harness to distinguish chart instance/DOM replacement, data changes, and animation restarts during saved-to-live handoff and ordinary background refresh. Capture SVG paths and their intermediate frames; mocked chart props alone cannot prove smooth motion.
- verified: In `Chart.tsx`, initialize immediately from available real points. Use decorative placeholders only when real data is absent; never impose the 120 ms decorative phase on already available saved/live series.
- verified: Introduce a stable Home presentation host at the launch/verified boundary, using `CachedHomeLaunch`, `HomeContent`, `HomePage`, and the root/layout composition. Keep the actual chart instance mounted while its input changes from saved data to verified data. Keep private query observers and financial actions inside the verified auth boundary; retaining presentation must not retain permission to act. Do not place a second hidden live chart behind the preview.
- verified: Preserve the last actual plotted geometry until matching refreshed series is ready. Summary-only updates, header status changes, masking changes, and structurally identical series must not restart graph animation. Reuse equivalent point data without hiding legitimate currency/date/period changes or invalidated snapshots.
- verified: For same-period value changes, interpolate from the displayed curve to the new curve using the existing short chart motion timing. Keep domain handling coherent during interpolation so small balance changes do not rescale the entire graph abruptly; settle to the correct final domain after the transition.
- verified: Handle added/removed dates and period changes explicitly. Align same-period points by date before interpolation rather than relying on index matching when counts differ. For genuinely different periods, use a deliberate bounded transition without drawing the unrelated decorative curve.
- verified: Handle a second response arriving mid-animation from the currently displayed geometry. Respect reduced motion, prevent stale hover values, and preserve keyboard/touch interactions. Empty/error/missing-series states stay local and actionable; logout or identity mismatch removes private geometry immediately.
- verified: Update real-component workbench scenarios for unchanged refresh, small value change, new endpoint/date, period change, and saved-to-live handoff. Maintain catalog entries and paired loading states. Preserve the uncommitted centered-gradient pulse implementation.
- verified: With identical saved and live series, handoff does not replay an entrance animation, decorative curve, or visible graph movement. The chart retains its DOM identity across the intended handoff.
- verified: Small same-period changes move smoothly from the old curve to the new one; response bursts and changed point counts do not whip across the graph or show incorrect final data.
- verified: Reduced motion updates immediately. Chart inspection, masking, period selection, local errors, and auth invalidation remain correct.

### 4. Integration Verification And Release Preparation
- verified: Extend `scripts/verify-cached-home.mjs` with first-frame launch checks, shared-read/fallback behavior, foreground event coverage, and chart identity/geometry assertions. Use production builds and real service worker/IndexedDB with synthetic data.
- verified: Run `$agent-browser` against the real production fixture and updated workbench states at 320px/390px and desktop width, across Light/Dark/OLED and reduced motion. Inspect multiple animation frames, layout anchors, keyboard/touch behavior, and console errors. Run browser commands escalated and close sessions started for this work.
- verified: Exercise launch tests, existing worker lifecycle tests, auth/logout cases, missing shell dependencies, and rollback mode. Rebuild normally after rollback verification. Use the documented isolated benchmark database for the full lifecycle suite.
- verified: Update frontend README, PWA validation notes, workbench documentation, and this plan with actual evidence. Record physical installed-iOS termination/relaunch/resume as pending if no device is available; do not certify the reported native sequence with desktop emulation.
- verified: Complete independent review of launch ownership, foreground intent, chart continuity, and privacy boundaries. Record the outstanding device limitation and deployment readiness; use the normal protected deployment workflow only when deployment is authorized.
- verified: Required checks pass and browser evidence covers intermediate frames, not only final screenshots. No duplicate refreshes, blank/brand app frames on usable cached launch, or placeholder animation on data arrival remain.
- verified: Rollback and missing-cache recovery work; release notes distinguish verified browser behavior from physical-iOS unknowns.

## Overall Exit Criteria
- verified: A returning controlled launch with a usable snapshot goes from an appearance-matched canvas directly to saved Home, then verified Home without an app splash or graph restart.
- verified: Every real foreground return on Home requests current data once while preserving content and edits; other pages retain hourly refresh.
- verified: Identical chart data stays still, changed data transitions smoothly, and final geometry/values are correct.
- verified: Session/auth boundaries, masking, logout, offline/failure recovery, SSR, cache compatibility, and rollback remain intact.
- verified: Checks and browser validation pass; physical-iOS limitations and release status are recorded honestly.

## Delivery
- verified: Independent source review/fix loop and all required pre-release verification. Final delivery review follows rollout.
- pending: Commit and push implementation.
- pending: Protected deploy workflow, image build, live rollout and health verification.

## Verification evidence (2026-09-08)

- Full frontend suite: `yarn test --run` passed 898 tests in 124 files. `yarn lint` passed with 0 errors and 25 warnings; `yarn typecheck`, `yarn tokens:check`, and `yarn workbench:build` passed.
- Final isolated lifecycle run: `yarn pwa:test --channel=chromium` passed all 18 real-browser checks, including update activation, auth/logout, missing shell dependencies and old lazy chunks.
- Workbench agent-browser checks: 320px Light, 390px OLED, and desktop Dark; unchanged data stayed at one path across 41 frames, small changes produced 26 intermediate geometries, response bursts 32, and added endpoint 27. All retained SVG identity, settled without gaps, and reduced motion updated immediately. No browser runtime errors; sessions closed.
- Production fixture inspected at 390×844 with synthetic data, including saved offline Home; no runtime errors. The expanded production harness verifies first frames, one snapshot read, retained SVG identity at handoff, foreground requests, reconnect, held period responses, privacy invalidation and failure recovery.
- Review/fix rounds covered startup ownership/provider continuity, retained live content during period changes, and a first-install service-worker waiting-state regression. The rollback launch harness now isolates immutable auth scenarios so a previous scenario's late401 redirect cannot cancel another launch.
- Physical installed-iOS termination/relaunch/resume remains unverified because no physical device is available. Native startup artwork is retained. Desktop evidence covers app-controlled frames, not the OS launch surface; this is a documented device limitation, not a claim that iOS can omit its native launch phase.

- Final normal production build, `pwa:check` (15 essentials), and `pwa:launch-test` passed. `VITE_CACHED_HOME=false` production build, artifact checks and launch suite also passed; normal build restored.
- Final `pwa:cached-home-test` passed in20.77s, including no transient first-install Update notice, synthetic Dark first-frame sampling, shared snapshot read, SVG retention/interpolation, foreground deduplication and all existing auth/storage/offline cases. Light/Dark/OLED canvas selection has executable unit coverage; multi-theme layout/motion evidence comes from workbench inspection rather than claiming automated first-frame sampling in every theme.
- Independent whole-source review found no major release-blocking issue. Three review/fix rounds addressed startup/provider ownership, live period retention, and worker first-install state; release verification remains below.
