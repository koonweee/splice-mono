# PWA implementation ledger

Source: [implementation plan](./pwa-reliability-privacy-and-experience.md).

Base: clean `origin/main` at `5eeacb6`. Worktree: `/Users/jtkw/projects/splice-mono/.worktrees/pwa-reliability`.

Statuses: pending, in_progress, implemented, verified, blocked. Implementation status does not imply verification.

## 1. Bound Push Delivery And Preserve Ownership Serialization

Status: verified

- **1.task.1 — verified:** Update `backend/src/notification/web-push.adapter.ts` with a 3-second socket inactivity timeout and a 5-second total request deadline, including response-body completion. The total deadline must destroy/abort the underlying request; a `Promise.race` that leaves the socket running is insufficient.
- **1.task.2 — verified:** The installed `web-push` API exposes only a socket timeout. Use its `generateRequestDetails` for encryption/VAPID, with a small `https.request` transport that retains the request handle and abort signal. Preserve status/error classification, do not follow redirects, bound response capture, and never log endpoints, keys, payload bodies, or response bodies.
- **1.task.3 — verified:** Replace the sequential processor loop with a pool of at most four independent sends. Keep bounded batches and existing retry/404/410 handling; one rejected job must not skip remaining claimed jobs.
- **1.task.4 — verified:** Add a per-claim UUID to `NotificationPushDeliveryEntity`; claim, send, retry, and finalization predicates must match it. An old process waking after a reclaimed lease must neither send nor overwrite the new owner's result.
- **1.task.5 — verified:** Retain the current subscription ownership locks around the bounded send for this implementation. This deliberately refines the audit's initial suggestion to move I/O outside transactions: the source already relies on these locks to prevent old-owner sends. Bound lock waits as well, and reschedule contention without an unbounded worker wait.
- **1.task.6 — verified:** Capture structured outcome, duration, attempt, backlog age, and stale-claim metrics using record IDs and coarse provider labels only.
- **1.acceptance.1 — verified:** A mock/local test endpoint that connects but never completes, or drips bytes, is actually aborted by the total deadline. Subsequent healthy deliveries complete and the next processor tick can run.
- **1.acceptance.2 — verified:** Concurrent processors do not send the same current claim. Crash-after-acceptance can still cause at-least-once delivery; preserve the notification ID as a stable display tag rather than promising exactly once.
- **1.acceptance.3 — verified:** Existing endpoint reassignment, revoked-subscription, and tombstone tests still pass. PostgreSQL tests verify lock release after timeout, competing revocation, and stale-claim fencing.
- **1.acceptance.4 — verified:** Run the notification backend tests and backend lint/typecheck.

## 2. Make Logout Authoritative For Browser Push

Status: verified

- **2.task.1 — verified:** Add `browser-session.entity.ts`, `browser-session.service.ts`, and a small `browser-session.module.ts` under `backend/src/auth/`. The module owns low-level session/push revocation using repositories and transaction managers; it must not depend on `UserService` or `NotificationService`. Import it from auth and notification modules to avoid the existing `NotificationModule -> UserModule -> AuthModule` cycle.
- **2.task.2 — verified:** Add stable `sessionId` references to refresh tokens and push subscriptions, plus enrollment/rebind fields. Create sessions at login/local bypass, preserve their identity through rotation, and extend expiry with the current refresh lifetime. No access-token format change is needed for this push association.
- **2.task.3 — verified:** Migrate existing live refresh-token chains into sessions without invalidating logins. A valid rotated predecessor and its replacement must map to the same session; expired/revoked chains must not become active. Backfill against replacement links, not user IDs or user-agent strings. Cover rotation-grace and partially cleaned chains explicitly.
- **2.task.4 — verified:** Stage session references as nullable during the compatible rollout. Resolve any live unbound token family under locks when the upgraded server first encounters it, including tokens issued by an old instance during migration. Validate the final backfill after old auth instances drain; do not interpret a missing session as permission to send push. Session cleanup must preserve live refresh families and cannot make a revoked enrollment eligible again.
- **2.task.5 — verified:** Mark previously active, unbound push rows `rebindRequired=true` and ineligible for sends. Keep their endpoint/owner so the next upgraded app can identify a migration rebind. Previously disabled or expired subscriptions must not be silently enabled. Invalidate pending legacy deliveries; do not replay a migration backlog on reenrollment.
- **2.task.6 — verified:** Make normal logout revoke its session, its refresh-token family, and that session's push subscriptions atomically, then clear cookies. Logout-all revokes every session and push subscription for the user. Cookie clearing remains idempotent for a missing/invalid token; an arbitrary endpoint in a body must never revoke another user/device.
- **2.task.7 — verified:** Serialize enrollment/rotation/send/revocation consistently. Sends and enrollment validate a live session under a session lock before subscription/delivery locks; logout takes the corresponding exclusive session lock. Preserve deterministic endpoint locking and ownership rechecks. Account for the bounded already-started send before confirming revocation.
- **2.task.8 — verified:** On frontend logout, immediately block private UI/cancel old identity work through `auth-generation.ts`. Dispatch the actual logout without waiting on optional badge or push cleanup; use a dedicated logout request path if necessary so the old generation's interceptor does not prevent it. Always attempt local unsubscribe and close displayed notifications, even after a failed server revoke.
- **2.task.9 — verified:** Store a minimal pending-logout control marker before a network-dependent signout and keep private UI blocked across reloads until logout is acknowledged or the user deliberately signs in again. Retry pending server logout on reconnect before any automatic push rebind. Do not claim remote logout-all succeeded while unreachable.
- **2.task.10 — verified:** Tell the worker to disable the current enrollment before cleanup. New enrollment receives a fresh opaque identifier; old queued pushes cannot expose private content after logout/account switch. If the platform requires a visible notification for a late push, use a generic content-free fallback and retire the stale subscription rather than showing old bank details.
- **2.acceptance.1 — verified:** Failed or stalled push cleanup and rejected badge promises cannot prevent the logout HTTP request or local privacy boundary.
- **2.acceptance.2 — verified:** Normal logout affects only its browser session; logout-all affects all user devices. Refresh rotation, concurrent tabs, and token cleanup do not detach a live device or revive a revoked session.
- **2.acceptance.3 — verified:** No new private push send starts after confirmed revocation. Already accepted provider messages and already displayed notifications are explicitly covered by worker cleanup/fencing; do not promise the backend can recall a message accepted by an external push provider.
- **2.acceptance.4 — verified:** Opening the upgraded app rebinds only migration-eligible, previously enabled subscriptions for that authenticated owner. No permission prompt appears unless the browser actually requires renewed enrollment.
- **2.acceptance.5 — verified:** Migration, ownership, offline logout, and PostgreSQL race tests pass; no auth token or push key appears in fixtures or logs.

## 3. Make Notification Setup Recoverable

Status: verified

- **3.task.1 — verified:** Refactor `frontend/src/lib/pwa/service-worker.ts` into an explicit registration state machine: unsupported, registering, ready, failed, and update-waiting. Resolve readiness only after a usable active registration exists. Reset failed promises and ignore callbacks from superseded attempts.
- **3.task.2 — verified:** Use controlled registration/lifecycle events rather than the virtual helper's automatic reload behavior. Retain `/sw.js`, the same scope, production-only registration, and workbench substitution; do not introduce a second worker or enable production PWA side effects in development fixtures.
- **3.task.3 — verified:** Bound readiness to 10 seconds. Failed installation, missing script, import failure, and unsupported APIs must produce a recoverable error, not an eternally pending toggle. A retry starts a fresh attempt.
- **3.task.4 — verified:** Preload push configuration and readiness while Settings loads. In `enableCurrentDeviceNotifications`, request permission directly from the user's action before network awaits. Do not impose a timeout on the user's native permission decision; bound subsequent registration and API work instead.
- **3.task.5 — verified:** Reconcile actual browser subscription, VAPID key, server owner/session/enrollment, and revoked/rebind state. Preserve explicit off/denied choices. Handle failed POST after browser subscribe as a recoverable partial state rather than falsely showing enabled.
- **3.task.6 — verified:** Automatically rebind migration-eligible enrollments from `PwaLifecycle` after session verification and pending-logout resolution. Deduplicate concurrent tab attempts. Never automatically request permission or enable a subscription for a different signed-in owner.
- **3.task.7 — verified:** Update `SettingsPage` and `workbench/notification-boundary.ts` for registering, enabling, migration-rebind, denied, unconfigured, failed, and retry states. For supported iOS environments needing Home Screen context, explain the prerequisite; a general install funnel remains out of scope.
- **3.acceptance.1 — verified:** A delayed configuration response cannot consume the permission gesture; registration failures reliably settle and a later retry succeeds without reloading the page.
- **3.acceptance.2 — verified:** Double taps, concurrent tabs, existing subscriptions, key changes, failed enrollment POST, and repeated disable operations are idempotent and show accurate state.
- **3.acceptance.3 — verified:** Workbench interactions never request native permission or create real subscriptions. Browser validation covers a production build because the dev-mode worker stub cannot establish real registration correctness.
- **3.acceptance.4 — verified:** Focused helper, lifecycle, auth, and Settings tests pass with frontend lint/typecheck.

## 4. Provide Authoritative Counts And A Safe Inbox API

Status: verified

- **4.task.1 — verified:** Extract/reuse a count-only method in `backend/src/transaction/transaction-query.service.ts` using the same owner joins and `categoryId = UNCATEGORIZED` semantics as `readPage`. Do not add a second definition of which transactions count, return transaction rows just for a total, or silently exclude archived-account history if the existing list includes it.
- **4.task.2 — verified:** Add the summary and inbox APIs defined above. Return summary counts and `computedAt` from one database snapshot. Compute unread alerts from active retained business notifications; exclude `system.test` from the inbox and unread indicator.
- **4.task.3 — verified:** Reuse backend rendering for safe titles/bodies/destinations. Do not return `statusBody`, dedupe keys, account/transaction ID arrays, or raw provider payloads in inbox responses. Reads and mutations remain authenticated, owner-scoped, and `private, no-store`.
- **4.task.4 — verified:** Add indexes for the owner/active/createdAt/id feed and active unread count. Keep current 90-day notification retention and 30-day terminal-delivery cleanup; archived/read operations must not break foreign-key retention.
- **4.task.5 — verified:** Compute push badge totals at delivery time, not notification creation time. Keep the visible notification body describing the new sync batch. Include the current total and timestamp separately in V2 payloads; unrelated/test pushes must not turn the badge into a dot or reset it.
- **4.task.6 — verified:** Add appropriate bounded push TTLs (24 hours for transaction alerts, one hour for connection alerts, five minutes for tests). Recheck whether a bank connection still needs attention before sending a delayed connection alert. Inbox history remains historical and labels when the event occurred.
- **4.task.7 — verified:** Regenerate and format the Orval client after the contracts are available.
- **4.acceptance.1 — verified:** Summary count equals the unfiltered-date Transactions view filtered to uncategorized, including zero, manual/provider rows, category changes/undo, and the existing account-history semantics.
- **4.acceptance.2 — verified:** Inbox pagination is stable with equal timestamps and concurrent inserts. Reading/dismissing is idempotent, cannot mutate another user's alert, and updates unread count correctly.
- **4.acceptance.3 — verified:** A batch of two new transactions with ten already outstanding displays a batch message of two and a badge of twelve. An unrelated alert does not replace twelve with a dot.
- **4.acceptance.4 — verified:** DTO/privacy tests, service/controller tests, count reconciliation tests on PostgreSQL, and generated-client validation pass.

## 5. Add The Inbox And Synchronize Badges

Status: verified

- **5.task.1 — verified:** Add proposed `frontend/src/lib/queries/notifications.ts` and `frontend/src/components/notifications/NotificationInbox.tsx`. Keep requests/invalidation in the query layer, with a header control supplied to the visual `AppShellLayout` from `_authed.tsx`.
- **5.task.2 — verified:** Use a header bell with an accessible unread indicator and a bounded list panel: side drawer on desktop and full-height drawer on phones. Show loading, empty, retained-read-error, read/dismiss pending, and mutation-error states. Opening an item marks only that item read and follows its approved destination; dismiss removes it only after success.
- **5.task.3 — verified:** Add `notifications`/summary query families in `query-invalidation.ts`. Refresh summary after category changes, bulk/undo, manual transaction changes, relevant syncs and inbox mutations. Preserve the existing 30-second financial cache policy; use deduplicated foreground/reconnect refreshes rather than independent focus and visibility requests.
- **5.task.4 — verified:** Route foreground badge updates through one serialized writer in the active worker, using the verified enrollment and snapshot timestamp; importing the same helper into several tabs is not cross-context serialization. Ignore older arrivals, define equal-timestamp handling, prevent a pre-logout response from setting a post-logout badge, and clear on a confirmed zero. Persist only ordering/control metadata, not financial counts. If no worker is usable, defer badge writes until registration/foreground reconciliation rather than creating competing writers.
- **5.task.5 — verified:** Refresh the inbox/summary on a worker message indicating a new relevant push while the app is visible. Do not add continuous polling or silent push solely to update a badge. A suspended device may show its last delivered count until another visible push or foreground refresh; document that platform limit.
- **5.task.6 — verified:** Add explicit fixture handlers and an inbox example in `frontend/workbench/`, updating `catalog.json` and `catalog.md` together. Workbench counts and mutation state must remain isolated per frame.
- **5.acceptance.1 — verified:** Reading an alert changes the bell indicator but not the uncategorized badge. Categorizing the last outstanding transaction clears the app badge; failed reads do not falsely clear it.
- **5.acceptance.2 — verified:** Old-user responses/pushes, out-of-order pushes, tab switching, reconnect, and unsupported badging cannot leak data or break inbox navigation.
- **5.acceptance.3 — verified:** Keyboard focus enters/restores correctly; Escape closes the topmost drawer; phone layouts remain usable with text zoom and reduced motion.
- **5.acceptance.4 — verified:** Validate real-component fixtures with `$agent-browser`, then authenticated integration in the real app. Relevant tests, workbench checks, and frontend lint/typecheck pass.

## 6. Make Releases Discoverable Without Losing Work

Status: verified

- **6.task.1 — verified:** Generate one opaque `buildId` per production build and use it consistently in the application bundle, worker, and `/version.json`. Include it in worker bytes so a UI-only release changes the worker. Do not expose environment values or credentials through version metadata.
- **6.task.2 — verified:** Check version on initial readiness and visible/online resume, throttled to at most once per minute. Explicitly call `registration.update()` as needed. Surface detection/check/apply failures separately and keep retry available; a failed version request must not log the user out.
- **6.task.3 — verified:** Add a small in-memory app-transition guard under `frontend/src/lib/pwa/`. Register open `EditorModal` instances, dirty `SettingsPage` state, and pending saves. Audit other inline editors for unsubmitted local drafts. Updates wait until guards clear; there is no persistent draft store in this plan.
- **6.task.4 — verified:** Stop relying on the plugin's automatic controller-change reload. Only the tab whose user chose Update may reload after activation and a final local guard check. Other tabs receive update state and continue with their current hashed assets.
- **6.task.5 — verified:** In `sw.ts`, replace unconditional notification-click `client.navigate` with a focus/message/acknowledgment path for running clients. The app routes immediately if safe or displays a deferred Open action while editing. With no client, open the existing same-origin deep link and preserve it through login. Validate destinations against the allowed application routes.
- **6.task.6 — verified:** Preserve useful `DeferredFeature` reload recovery and TanStack's existing missing-module handling, but ensure recoverable chunk errors cannot silently destroy an active draft or create a reload loop. Handle failed imports with an explicit update/retry surface while blocked.
- **6.task.7 — verified:** Retain available immutable assets for the previous release as described in milestone 7. Do not claim this preserves an old lazy chunk that was never cached or is already gone from the server: those cases need the guarded recovery flow.
- **6.acceptance.1 — verified:** An A/B production-build test changes UI only, observes different worker/version metadata, and shows an actionable update in the A client within one foreground check after B is served.
- **6.acceptance.2 — verified:** In two tabs, Update in a clean tab does not reload a tab with a manual transaction editor or dirty Settings. The blocked tab can later update without losing a submitted save or restoring private drafts from storage.
- **6.acceptance.3 — verified:** A notification click during editing preserves the draft and exposes the pending destination; a cold click opens the correct page through authentication.
- **6.acceptance.4 — verified:** Offline update attempts, failed worker installs, missing old lazy chunks, server rollback, and repeated clicks recover without reload loops or mixed-version asset substitution.

## 7. Cache Useful Static Assets And Reduce Startup Overhead

Status: verified

- **7.task.1 — verified:** Rework `frontend/vite.config.ts` precache selection around the generated client entry graph: core JS/CSS, minimal icons, and the small offline recovery asset. Exclude SSR HTML, API URLs, `/version.json`, all-device splash downloads, charts/deferred feature bundles not needed for startup, and source maps.
- **7.task.2 — verified:** Keep splash links working so the browser can request the matching image when needed. Optimize existing icon/splash encodings without changing branding; verify any maskable icon's safe zone rather than treating a manifest label as sufficient.
- **7.task.3 — verified:** Cache successful same-origin, content-hashed `/assets/` responses on use, restricted to expected JS/CSS/font/image content types. Never cache HTML, redirects, missing-asset responses, or arbitrary URLs. Preserve `server/routes/assets/[...path].ts` returning non-cacheable 404s.
- **7.task.4 — verified:** Keep current and previous static-release caches, bounded to 20 MiB combined and at most seven days for an unused previous release. Coordinate cleanup with controlled clients and use network/recovery when an asset cannot be retained. Cache failure or quota exhaustion must not prevent online use or logout.
- **7.task.5 — verified:** Ensure cache migration removes legacy authenticated app-shell caches without indiscriminately deleting the newly introduced static caches from another tab.
- **7.task.6 — verified:** Enable navigation preload for supported workers and consume `event.preloadResponse` before falling back to `fetch`. Preserve streaming server responses and existing `private, no-store` headers; enabling preload without consuming it would double requests.
- **7.task.7 — verified:** Record a baseline before changes using the same production routes, data, viewport, cache state, and network/CPU profile. Compare at least five runs each of first visit, warm reopen, and first navigation after a suspended worker; report medians and transfer sizes.
- **7.acceptance.1 — verified:** Generated artifacts contain useful core static assets and zero authenticated HTML/API payloads. A newly registered desktop client does not fetch every Apple splash image.
- **7.acceptance.2 — verified:** Set the essential precache budget before implementation: at most 2.5 MiB raw / 1 MiB compressed. Keep first-visit transfer and median content-ready time within 5% of baseline and show the measured warm/reopen result; do not claim a speedup from cache membership alone.
- **7.acceptance.3 — verified:** Navigation preload causes exactly one navigation request, with authentication/cookies/redirects intact. Already cached unchanged static assets require no body transfer on warm reopen.
- **7.acceptance.4 — verified:** Test quota failure, cache cleanup with another tab on the previous release, missing old assets, offline asset use, and rollback. PWA artifact validation and both production/workbench builds pass.

## 8. Add Offline Recovery And Explicit Save Failure States

Status: verified

- **8.task.1 — verified:** Extract the safe fallback from `frontend/src/sw.ts` into a small offline-page module with a precached recovery script. It must render without the React authenticated root or `/user/me` succeeding.
- **8.task.2 — verified:** Add a keyboard-accessible Retry button, visible retry/pending/error status, and recovery on `online` and visible resume. Keep the original path/search/hash; reload only after a bounded successful same-origin GET probe. Deduplicate probes and prevent reconnect/reload loops. The page contains no financial data.
- **8.task.3 — verified:** Validate that recovery probes reached Splice and establish a valid application/authentication outcome. Static `/version.json` availability alone cannot prove a protected route's backend has recovered; captive-portal HTML or an API outage must not trigger repeated reloads. A confirmed expired session can lead to login while preserving the destination.
- **8.task.4 — verified:** Bound navigation waiting for response headers to eight seconds, then show the recoverable unavailable page. Preserve valid authentication redirects and distinguish a network failure from a server response where possible; do not buffer SSR streams just to impose the timeout.
- **8.task.5 — verified:** Update `PwaLifecycle` and reuse `DataState` to distinguish browser-offline from temporarily unavailable reads. Retain identity-matched loaded results and refresh active reads after recovery; treat `navigator.onLine` as a hint rather than proof the backend is reachable.
- **8.task.6 — verified:** Make known-offline financial saves fail promptly with a retained draft and actionable message. Test the actual TanStack mutation path so a click does not silently become a paused mutation that automatically executes after reconnect. Preserve the special local/server logout behavior from milestone 2.
- **8.task.7 — verified:** Do not automatically replay a write whose response was lost, since it may already have committed. Preserve the draft, explain the uncertainty, and offer read reconciliation before another submission. This plan does not introduce a general offline mutation queue.
- **8.acceptance.1 — verified:** Browser-worker launch evidence; physical installed behavior remains covered by blocked 9.acceptance.2. An installed app launched offline shows the safe recovery page and returns to its original destination after reconnect without requiring force-close/relaunch.
- **8.acceptance.2 — verified:** Browser-online/API-down, captive/non-app responses, failed retry, and repeated online events produce stable states rather than login redirects or loops.
- **8.acceptance.3 — verified:** A manual transaction save attempted offline sends no delayed mutation after reconnect. A failed online save retains input; reconnect refresh does not reset that input or submit it twice.
- **8.acceptance.4 — verified:** Validate warm-open and cold-launch paths in a production build with `$agent-browser`; workbench-only offline events do not establish worker correctness.

## 9. Polish Installed Layout And Add Shortcuts

Status: in_progress

- **9.task.1 — verified:** Coordinate `frontend/src/routes/__root.tsx`, `AppShellLayout.tsx/.module.css`, `PwaLifecycle.module.css`, `DataState.module.css`, and `forms/EditorModal.module.css` around `viewport-fit=cover` and shared safe-area variables. Extend header/main offsets together; avoid double-padding already inset editor footers.
- **9.task.2 — verified:** Cover top, bottom, and landscape side insets; preserve `100dvh`/scrolling behavior and make save actions reachable with the software keyboard. Apply shared design-system tokens and maintain theme/status-bar contrast in Light, Dark, and OLED.
- **9.task.3 — verified:** Review the header bell, logout, navigation trigger, lifecycle alerts, drawers, and fixed actions at narrow widths and 200% text zoom. Keep tap targets and focus restoration consistent with existing primitives.
- **9.task.4 — verified:** Add manifest shortcuts for `/transactions?categoryId=UNCATEGORIZED` and `/accounts`, with short labels and suitable existing icons. Keep `id`, `scope`, and `start_url` stable so existing installations retain identity.
- **9.task.5 — verified:** Update the maintained `page-home`, `page-settings`, `page-transactions`, `editors`, and `pwa-lifecycle` workbench examples for affected states, plus the inbox example from milestone 5.
- **9.acceptance.1 — verified:** No important controls are obscured by the status area, home indicator, keyboard, drawer, or lifecycle banner on representative phone portrait/landscape and desktop layouts.
- **9.acceptance.2 — blocked:** Real installed iOS and Android checks cover launch, keyboard, notification setup/click, and safe areas. Browser emulation is useful additional evidence but cannot certify these OS behaviors; record any unavailable device validation explicitly.
- **9.acceptance.3 — verified:** Manifest and authenticated URL destinations verified in production Chromium; native installed-menu behavior remains covered by blocked 9.acceptance.2. Shortcuts open the correct filtered/authenticated destination in supported installed browsers and degrade harmlessly where unsupported. Manifest identity is unchanged.
- **9.acceptance.4 — verified:** `$agent-browser` theme/viewport/focus checks, token guard, workbench catalog tests, lint/typecheck, and app/workbench builds pass.

## 10. Validate Upgrade, Privacy Cutover, And Rollback

Status: in_progress

- **10.task.1 — verified:** Add an automated production-build lifecycle harness under proposed `frontend/scripts/test-pwa-lifecycle.mjs`. Serve A and B from one isolated test origin and drive real service-worker/cache events; do not equate Vitest mocks with release validation. Use the production local-auth flow for authenticated checks, with synthetic users/data.
- **10.task.2 — verified:** Add proposed `frontend/scripts/check-pwa-artifacts.mjs` to verify cache contents, build-ID agreement, byte budgets, shortcut destinations, and no-store public version/worker headers. Wire these focused commands into `frontend/package.json` and the relevant frontend CI job.
- **10.task.3 — verified:** Use `backend/test/helpers/isolated-postgres.ts` for migrations and concurrency tests. The dedicated loopback benchmark database is mandatory; a skipped PostgreSQL suite is not a passing acceptance check.
- **10.task.4 — pending:** Roll out additive schema and compatible server support first. Stop/drain old push processors before the one-time legacy pause so an old binary cannot keep selecting unbound rows. Deploy the new frontend/worker, then enable only session-bound V2 sends. Rebind migration-eligible devices on open without replaying old deliveries.
- **10.task.5 — verified:** Retain compatibility for existing auth tokens and top-level worker payload fields. Record that a suspended old page may need one reload to obtain the enrollment protocol; keep server-side privacy enforcement authoritative throughout.
- **10.task.6 — verified:** On rollback, disable push processing rather than running an old processor against session-bound/revoked data. Preserve the new columns and revocations; do not resurrect subscriptions with a destructive down migration. Use a frontend rollback built with the new lifecycle/privacy protocol, or require worker recovery before re-enabling sends.
- **10.task.7 — pending:** Record actual validation and operational handoff in `frontend/docs/pwa-validation.md` and `backend/docs/pwa-delivery-and-logout.md`. Live rollout follows `/Users/jtkw/projects/stack/AGENTS.md` under the user's explicit implementation/deployment authorization.
- **10.acceptance.1 — verified:** A/B update, rollback, multi-tab editor protection, legacy rebind, offline logout/reconnect, and user A -> user B push isolation all pass against real built assets and isolated backend data.
- **10.acceptance.2 — verified:** Dead sockets release resources, another healthy endpoint progresses, and shutdown/restart cannot let an old claim overwrite or send a newer claim.
- **10.acceptance.3 — pending:** Verification evidence distinguishes automated checks, browser emulation, installed-device checks, and remaining platform limitations. Required checks have no unexplained skips.

## Integration and release

- **baseline — verified:** Record pre-change production build, startup measurements, and focused test baseline.
- **contracts — verified:** Regenerate API clients; verify all generated changes.
- **full-validation — pending:** Complete every Tests and Validation Commands requirement in the plan and record actual evidence.
- **independent-review — pending:** Read-only review against this ledger; fix all major findings and repeat.
- **merge — pending:** Commit, open PR, pass required CI, merge to main.
- **deploy — pending:** Execute documented Deploy workflow and verify production rollout/migration health.
- **installed-device — verified:** Record actual iOS/Android validation or specific unavailable-device dependency.

## Evidence and review log

Worktree created clean before carrying in the plan. No original checkout files were changed.

- Integrated backend run: 25 of 26 suites passed (195/196 tests); remaining inbox fixture timestamp race assigned for correction. Backend lint/typecheck passed. Privacy/auth PostgreSQL evidence remains valid; aggregate gate stays open.
- Browser observations: compact Dark phone rows and Light desktop failed-dismiss state inspected; unread decrements independently of transaction count; OLED tablet empty state inspected. Unread-dot ARIA violation assigned for correction.

- Frontend focused integration: 18 files, 132 tests passed. Independent review fixes: 29/29 tests passed, covering conflicting logout stores and failed notification cleanup. Header 200% text layout corrected and visually reinspected. Inbox axe has zero confirmed violations.
- PNG recompression saved 629,927 bytes with byte-identical inflated image streams; misleading maskable purpose removed after safe-zone inspection.

- Final whole frontend suite: 104 files / 708 tests passed. Final backend: 26 suites / 208 tests passed, including all required PostgreSQL suites with zero skips; lint, typecheck and build passed. Backend metric/transport/snapshot/HTTP privacy coverage completed.
- Physical installed iOS/Android validation unavailable: no physical devices connected. See frontend/docs/pwa-validation.md for exact manual checks; browser emulation is not OS certification.
- Production prerequisite: fresh 873,361-byte database dump created, SHA-256 14f30e387dfbf903f3064dec4d3ee2d94d086eafc923d8bdf24bb162677be334, restored successfully into a temporary verification database and that copy dropped. Komodo operations 6a9f0a49d28c58b2ef4195dd and 6a9f0aa3d28c58b2ef4195f0 completed successfully. No live migration/app cutover yet.

- Browser/review follow-up: 200% header and banner spacing corrected; production A/B preserves other-tab drafts. Remaining discovered defects in pending-probe recovery and superseded staging-cache cleanup are assigned; their ledger tasks returned to in_progress until verified. Synchronous worker disable passed45 focusedtests and final frontendtypecheck.

- Final frontend source gate: 105 files / 721 tests passed; strict typecheck passed. Final production build, browser lifecycle and release gates remain in progress.

- Independent worker review found that SESSION_READY reused the badge epoch across enrollment changes; previous-account queued badge messages could cross the new session boundary. Worker handshake/channel fix and regression coverage assigned; affected badge ledger entries reopened.

- Environment restart removed the temporary worktree before commit. Source was recovered into the persistent worktree from saved file-edit history. Prior verification remains historical evidence; fresh source gates and lifecycle validation are required before release.

### Final recovery validation (supersedes interim gates above)

- Fresh complete frontend: 106 files / 753 tests, typecheck, lint (0 errors /21 warnings), token guard, production/workbench builds, and HTTP artifact check passed. Fresh backend26 suites /208 tests with zero skips plus lint/typecheck/build passed.
- Current14-case production A/B/C lifecycle run passed. The expanded16-case production run subsequently passed, including missing old lazy imports and offline/repeated Update actions.
- Final independent two-window replay verified authoritative account-scope handshakes converge and stale badge work is fenced across account change/logout. BroadcastChannel logout fallback remains effective when localStorage fails.
- Fresh15 baseline +15 final startup observations are committed under frontend/docs/pwa-evidence. First-visit body transfer falls43.8%; readiness rises4.2%, within5%budget. Warm and suspended timing regressions are reported honestly in the validation doc.

- Final independent source review found no new P0/P1. Documentation review recomputed all30 startup rows and clarified browser-versus-installed evidence, staging cache retention, and recovery-scope rollback compatibility. Final expanded harness/CI and live release gates remain pending.
- Refreshed production backup restored into a temporary database with27 public tables and was dropped successfully. Operation6a9f19e4d28c58b2ef419909; dump873,356bytes; SHA256912400849ac69acc4750ae98097ebd715ce6f3ef8f9984f34575f9e66f9ed696; path/var/lib/postgresql/data/pwa-backups/pre-pwa-cutover-20260907.dump.

- Expanded production16-case run passed against identical retained A/B/C binaries (494production/config source files match final source). Native push injection now identifies the worker controlling the exact page target across contexts. Final full Chromium CI remains a release gate.

- Linux CI652001c passed full Chromium worker activation (native headless-shell crash avoided) but failed automatic cold-offline reconnect. Explicit Retry works; automatic recovery is reopened for investigation/fix before release. No merge, live migration, or app cutover occurred.

- Final startup remeasurement on5a3a95a: first2381ms versus2349ms (+1.4%); body2,309,813B versus4,108,738B (−43.8%). Warm319ms versus171ms; suspended288ms versus279ms. All30 baseline/latest observations retained.
- Final fresh whole frontend757 tests passed with typecheck/lint (0errors/21warnings), production build and artifact check. Fresh A/B/C Chromium153 suite16 passed; unchanged deadlines/assertions. The harness clock now advances so recovery throttles can expire. Independent review requires a startup-only cooldown guard against repeated failing-route reloads; focused fix underway.

- Independent cooldown replay verified: one initial recovery; the next failing fallback schedules no timers and stays stable after120s; explicit Retry and a later native online event still work. Focused offline suite17/17 passes. All implementation source gates are verified; final CI, merge and live rollout remain pending.
