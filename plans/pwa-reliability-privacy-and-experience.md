# PWA Reliability, Privacy, And App Experience

## Status

Done — implemented and deployed September 7, 2026. All automatable acceptance
checks passed; physical installed iOS/Android checks remain blocked by unavailable
devices. See the [task ledger](./pwa-implementation-ledger.md) and
[release validation](../frontend/docs/pwa-validation.md) for evidence and limits.

## Goal

Implement the nine areas selected from the September 7, 2026 PWA audit: push delivery reliability, logout privacy, app updates, faster startup, offline recovery, notification setup, trustworthy badges and notifications, installed-app layout polish, and app shortcuts.

Users should receive relevant notifications on the correct signed-in device, recover from network and registration failures, notice releases without losing work, and reach common tasks quickly from an installed app.

| Selected area                        | Planned outcome                                                                               | Milestones |
| ------------------------------------ | --------------------------------------------------------------------------------------------- | ---------- |
| P1 reliability                       | A stalled push times out and other deliveries keep moving.                                    | 1, 10      |
| P1 privacy                           | Logout revokes that browser session's push; legacy devices securely rebind on reopen.         | 2, 10      |
| App updates                          | UI releases trigger an update prompt that protects editors and other tabs.                    | 6, 10      |
| Faster startup                       | Cache useful app assets, stop downloading every splash image, and measure reopen performance. | 7          |
| Offline recovery                     | Provide Retry and reconnect recovery while preserving open drafts in memory.                  | 8          |
| Dependable notifications             | Permission and registration failures settle clearly and can be retried.                       | 3          |
| Trustworthy badges and notifications | Use authoritative transaction totals and a small inbox with its own unread indicator.         | 4, 5       |
| App layout polish                    | Keep headers, drawers, and actions usable around safe areas and the keyboard.                 | 9          |
| App shortcuts                        | Open uncategorized transactions or accounts directly from supported installed-app menus.      | 9          |

### Settled product decisions

- Include a small in-app inbox: a header bell with an unread indicator, transaction-sync and bank-connection alerts, and mark-read/dismiss actions. The user explicitly selected this scope during the interview.
- Approved inbox design: compact notification rows, icon-only read/dismiss actions with accessible labels, and no retention-period footer.
- The installed app badge represents the total uncategorized transaction count. Inbox unread state is independent: reading an alert does not categorize transactions or clear that badge.
- Pause legacy push subscriptions until each device next opens the upgraded app and securely rebinds. The user explicitly accepted this one-time transition. Preserve logins, notification preferences, and existing browser permission; do not require a fresh permission prompt when the browser can reuse enrollment.
- Retain the existing offline privacy boundary. Do not persist authenticated HTML, financial API responses, notification contents, or financial drafts in browser storage. Already loaded, identity-matched data can remain in memory while the app is open.
- Updates are prompted. They must not reload another tab or interrupt an open editor, dirty settings, or an in-flight save. Notification clicks must respect the same protection.
- Layout work refines the existing Mantine shell and editors; it does not redesign primary navigation. Shortcuts are **Review uncategorized transactions** and **Accounts**.

### Scope boundaries

- Installation marketing/onboarding, general install prompts, offline snapshots, offline write replay, share targets/file handlers, and Declarative Web Push are outside this plan.
- The separate P1 audit finding about unrestricted backend push destinations is also outside the user's selected scope. Delivery deadlines do not resolve that finding; track it separately rather than claiming this is a complete push-security remediation.
- The user authorized implementation and deployment on September 7, 2026, from an isolated worktree based on clean main. Follow the documented deployment and migration gates; synthetic notification tests must not send to real users.

## Current Behavior

The audit ran 53 focused tests and two isolated production builds. Both builds passed; a UI-only edit left `sw.js` byte-identical while replacing 89 assets. Those checks establish the starting point, not acceptance of the future implementation. Physical-device and live deployment behavior were not validated.

| Area         | Current code and consequence                                                                                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Delivery     | `backend/src/notification/web-push.adapter.ts` calls `webPush.sendNotification` without a timeout. `NotificationPushProcessor` awaits up to 25 deliveries sequentially and skips later ticks while processing. `NotificationService.sendPushDelivery` holds subscription/delivery row locks during the send. |
| Ownership    | `NotificationService` already serializes endpoint reassignment and revocation, tombstones the previous owner's subscription, and rechecks ownership before sending. Preserve these protections. Simply moving the send outside its transaction would introduce a revocation/reassignment race.               |
| Logout       | `frontend/src/lib/auth.ts` awaits notification cleanup and badge clearing before clearing private caches and dispatching logout. `browser-push.ts` skips local unsubscribe when server revocation fails. Backend logout endpoints revoke refresh tokens and clear cookies, but do not revoke push.           |
| Sessions     | `RefreshTokenEntity` has rotation/replacement metadata but no stable session identity. Push subscriptions have a user and endpoint but no browser-session association. An existing subscription cannot safely be assigned to a particular legacy refresh token from stored data.                             |
| Registration | `frontend/src/lib/pwa/service-worker.ts` resolves its setup promise before actual registration success, leaves callback failures latched, and can wait forever on `navigator.serviceWorker.ready`. `enableCurrentDeviceNotifications` fetches configuration before requesting permission.                    |
| Updates      | `vite.config.ts` precaches only branding and the manifest. UI releases therefore need not change the worker. The plugin registration helper also owns reload behavior, which is unsuitable for protecting other tabs' editors.                                                                               |
| Startup      | The audited precache contains 13 entries totaling about 1.9 MB, including eight device-specific splash images and no application JS/CSS. Navigations go through the worker to the network without navigation preload.                                                                                        |
| Offline      | `frontend/src/sw.ts` returns a static 503 page on a thrown navigation fetch. It has no Retry action, reconnect recovery, or request deadline. The mounted banner uses `navigator.onLine`; existing `DataState` can retain matching results and show refresh errors.                                          |
| Badges       | Foreground code fetches a one-row transaction page for its total. Push sets the badge to the latest insertion batch count, or a dot for notifications without a count. Category mutations invalidate queries but do not refresh the standalone badge helper.                                                 |
| Inbox        | `NotificationEntity` already stores `readAt`, `status`, and `archivedAt`, with 90-day notification retention. There are no list/read/archive UI APIs. Raw payloads include provider status details and must not be exposed as the new inbox DTO.                                                             |
| Layout       | `AppShellLayout` has a fixed 60px header. The root uses a translucent Apple status bar without a coordinated safe-area policy. `EditorModal` already handles phone height and bottom action padding; lifecycle banners do not.                                                                               |
| Shortcuts    | The manifest has a stable `id`, `scope`, and standalone display, but no shortcuts. `/transactions?categoryId=UNCATEGORIZED` and `/accounts` already exist.                                                                                                                                                   |

Relevant conventions are [AGENTS.md](../AGENTS.md), [frontend guidance](../frontend/CLAUDE.md), [backend guidance](../backend/CLAUDE.md), [shared UI conventions](../frontend/docs/ui-conventions.md), and the [workbench README](../frontend/workbench/README.md). Follow the current source when older plans describe superseded behavior; do not rewrite historical completion records.

## Target Data Shape

The following names are proposed additions, not existing types. Final public schemas belong in `backend/src/types/`, must be registered for OpenAPI, and must regenerate `frontend/src/api/**` through `yarn orval`.

```ts
// Internal database records; never return raw refresh tokens or session IDs in push.
type BrowserSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

// Add sessionId to refresh_token. It remains stable across token rotation.
// Add these fields to push_subscription_entity:
type PushEnrollmentFields = {
  sessionId: string | null; // null only for legacy/unbound rows
  enrollmentId: string; // opaque, changes when an endpoint changes enrollment
  rebindRequired: boolean;
};

// Add claimToken to notification_push_delivery_entity. A send/finalizer must
// match the exact claim that authorized it, not just status = 'processing'.
type PushDeliveryClaim = { claimToken: string | null };

type DeviceNotificationState = {
  configured: boolean;
  subscribed: boolean;
  rebindRequired: boolean;
  enrollmentId: string | null;
};

type NotificationSummary = {
  uncategorizedTransactionCount: number;
  unreadNotificationCount: number;
  computedAt: string; // database-derived snapshot timestamp, ISO UTC
};

type NotificationInboxItem = {
  id: string;
  type: "transactions.new_synced" | "bank_link.needs_attention";
  title: string;
  body: string;
  url: string; // approved same-origin relative destination
  createdAt: string;
  readAt: string | null;
};

type NotificationInboxPage = {
  items: NotificationInboxItem[];
  nextCursor: string | null;
  hasMore: boolean;
};

// Preserve the existing top-level fields for worker compatibility.
type PushPayloadV2 = {
  version: 2;
  title: string;
  body: string;
  url: string;
  tag: string;
  enrollmentId: string;
  badgeCount?: number; // current outstanding total, never the insertion batch
  badgeAsOf?: string;
};

type AppVersion = { buildId: string };
```

Proposed authenticated APIs:

- `GET /notification/summary` returns the two independent counts and snapshot timestamp, with `private, no-store`.
- `GET /notification/inbox?cursor=...&pageSize=20` returns active, retained alerts, newest first using `(createdAt, id)` keyset pagination; cap page size at 100.
- `PATCH /notification/:id/read` and `PATCH /notification/:id/archive` are idempotent, owner-scoped operations. Opening the inbox alone does not mark every item read. Opening an item marks that item read; dismissing archives it.
- Extend existing push registration/status responses with enrollment/rebind state. Derive the session on the server from the authenticated browser's refresh cookie, including the existing valid rotation-grace case; never trust a client-supplied session ID. Browser push enrollment requires a cookie-backed session, not a PAT impersonating a device.
- Preserve the existing token response and logout request shapes. Logout uses the presented refresh token to locate the session; logout-all uses the authenticated user.
- `GET /version.json` is a public frontend build artifact containing only `buildId`, served with `no-store` and excluded from worker caches.

Persist only minimal worker control metadata if needed: enrollment identifier, disabled/pending-logout state, and the last applied badge timestamp. No counts, inbox contents, financial drafts, auth credentials, or financial responses belong in that store. Worker metadata is not authentication authority.

## Milestones

### 1. Bound Push Delivery And Preserve Ownership Serialization

Implementation tasks:

- Update `backend/src/notification/web-push.adapter.ts` with a 3-second socket inactivity timeout and a 5-second total request deadline, including response-body completion. The total deadline must destroy/abort the underlying request; a `Promise.race` that leaves the socket running is insufficient.
- The installed `web-push` API exposes only a socket timeout. Use its `generateRequestDetails` for encryption/VAPID, with a small `https.request` transport that retains the request handle and abort signal. Preserve status/error classification, do not follow redirects, bound response capture, and never log endpoints, keys, payload bodies, or response bodies.
- Replace the sequential processor loop with a pool of at most four independent sends. Keep bounded batches and existing retry/404/410 handling; one rejected job must not skip remaining claimed jobs.
- Add a per-claim UUID to `NotificationPushDeliveryEntity`; claim, send, retry, and finalization predicates must match it. An old process waking after a reclaimed lease must neither send nor overwrite the new owner's result.
- Retain the current subscription ownership locks around the bounded send for this implementation. This deliberately refines the audit's initial suggestion to move I/O outside transactions: the source already relies on these locks to prevent old-owner sends. Bound lock waits as well, and reschedule contention without an unbounded worker wait.
- Capture structured outcome, duration, attempt, backlog age, and stale-claim metrics using record IDs and coarse provider labels only.

Exit criteria:

- A mock/local test endpoint that connects but never completes, or drips bytes, is actually aborted by the total deadline. Subsequent healthy deliveries complete and the next processor tick can run.
- Concurrent processors do not send the same current claim. Crash-after-acceptance can still cause at-least-once delivery; preserve the notification ID as a stable display tag rather than promising exactly once.
- Existing endpoint reassignment, revoked-subscription, and tombstone tests still pass. PostgreSQL tests verify lock release after timeout, competing revocation, and stale-claim fencing.
- Run the notification backend tests and backend lint/typecheck.

### 2. Make Logout Authoritative For Browser Push

Implementation tasks:

- Add `browser-session.entity.ts`, `browser-session.service.ts`, and a small `browser-session.module.ts` under `backend/src/auth/`. The module owns low-level session/push revocation using repositories and transaction managers; it must not depend on `UserService` or `NotificationService`. Import it from auth and notification modules to avoid the existing `NotificationModule -> UserModule -> AuthModule` cycle.
- Add stable `sessionId` references to refresh tokens and push subscriptions, plus enrollment/rebind fields. Create sessions at login/local bypass, preserve their identity through rotation, and extend expiry with the current refresh lifetime. No access-token format change is needed for this push association.
- Migrate existing live refresh-token chains into sessions without invalidating logins. A valid rotated predecessor and its replacement must map to the same session; expired/revoked chains must not become active. Backfill against replacement links, not user IDs or user-agent strings. Cover rotation-grace and partially cleaned chains explicitly.
- Stage session references as nullable during the compatible rollout. Resolve any live unbound token family under locks when the upgraded server first encounters it, including tokens issued by an old instance during migration. Validate the final backfill after old auth instances drain; do not interpret a missing session as permission to send push. Session cleanup must preserve live refresh families and cannot make a revoked enrollment eligible again.
- Mark previously active, unbound push rows `rebindRequired=true` and ineligible for sends. Keep their endpoint/owner so the next upgraded app can identify a migration rebind. Previously disabled or expired subscriptions must not be silently enabled. Invalidate pending legacy deliveries; do not replay a migration backlog on reenrollment.
- Make normal logout revoke its session, its refresh-token family, and that session's push subscriptions atomically, then clear cookies. Logout-all revokes every session and push subscription for the user. Cookie clearing remains idempotent for a missing/invalid token; an arbitrary endpoint in a body must never revoke another user/device.
- Serialize enrollment/rotation/send/revocation consistently. Sends and enrollment validate a live session under a session lock before subscription/delivery locks; logout takes the corresponding exclusive session lock. Preserve deterministic endpoint locking and ownership rechecks. Account for the bounded already-started send before confirming revocation.
- On frontend logout, immediately block private UI/cancel old identity work through `auth-generation.ts`. Dispatch the actual logout without waiting on optional badge or push cleanup; use a dedicated logout request path if necessary so the old generation's interceptor does not prevent it. Always attempt local unsubscribe and close displayed notifications, even after a failed server revoke.
- Store a minimal pending-logout control marker before a network-dependent signout and keep private UI blocked across reloads until logout is acknowledged or the user deliberately signs in again. Retry pending server logout on reconnect before any automatic push rebind. Do not claim remote logout-all succeeded while unreachable.
- Tell the worker to disable the current enrollment before cleanup. New enrollment receives a fresh opaque identifier; old queued pushes cannot expose private content after logout/account switch. If the platform requires a visible notification for a late push, use a generic content-free fallback and retire the stale subscription rather than showing old bank details.

Exit criteria:

- Failed or stalled push cleanup and rejected badge promises cannot prevent the logout HTTP request or local privacy boundary.
- Normal logout affects only its browser session; logout-all affects all user devices. Refresh rotation, concurrent tabs, and token cleanup do not detach a live device or revive a revoked session.
- No new private push send starts after confirmed revocation. Already accepted provider messages and already displayed notifications are explicitly covered by worker cleanup/fencing; do not promise the backend can recall a message accepted by an external push provider.
- Opening the upgraded app rebinds only migration-eligible, previously enabled subscriptions for that authenticated owner. No permission prompt appears unless the browser actually requires renewed enrollment.
- Migration, ownership, offline logout, and PostgreSQL race tests pass; no auth token or push key appears in fixtures or logs.

### 3. Make Notification Setup Recoverable

Implementation tasks:

- Refactor `frontend/src/lib/pwa/service-worker.ts` into an explicit registration state machine: unsupported, registering, ready, failed, and update-waiting. Resolve readiness only after a usable active registration exists. Reset failed promises and ignore callbacks from superseded attempts.
- Use controlled registration/lifecycle events rather than the virtual helper's automatic reload behavior. Retain `/sw.js`, the same scope, production-only registration, and workbench substitution; do not introduce a second worker or enable production PWA side effects in development fixtures.
- Bound readiness to 10 seconds. Failed installation, missing script, import failure, and unsupported APIs must produce a recoverable error, not an eternally pending toggle. A retry starts a fresh attempt.
- Preload push configuration and readiness while Settings loads. In `enableCurrentDeviceNotifications`, request permission directly from the user's action before network awaits. Do not impose a timeout on the user's native permission decision; bound subsequent registration and API work instead.
- Reconcile actual browser subscription, VAPID key, server owner/session/enrollment, and revoked/rebind state. Preserve explicit off/denied choices. Handle failed POST after browser subscribe as a recoverable partial state rather than falsely showing enabled.
- Automatically rebind migration-eligible enrollments from `PwaLifecycle` after session verification and pending-logout resolution. Deduplicate concurrent tab attempts. Never automatically request permission or enable a subscription for a different signed-in owner.
- Update `SettingsPage` and `workbench/notification-boundary.ts` for registering, enabling, migration-rebind, denied, unconfigured, failed, and retry states. For supported iOS environments needing Home Screen context, explain the prerequisite; a general install funnel remains out of scope.

Exit criteria:

- A delayed configuration response cannot consume the permission gesture; registration failures reliably settle and a later retry succeeds without reloading the page.
- Double taps, concurrent tabs, existing subscriptions, key changes, failed enrollment POST, and repeated disable operations are idempotent and show accurate state.
- Workbench interactions never request native permission or create real subscriptions. Browser validation covers a production build because the dev-mode worker stub cannot establish real registration correctness.
- Focused helper, lifecycle, auth, and Settings tests pass with frontend lint/typecheck.

### 4. Provide Authoritative Counts And A Safe Inbox API

Implementation tasks:

- Extract/reuse a count-only method in `backend/src/transaction/transaction-query.service.ts` using the same owner joins and `categoryId = UNCATEGORIZED` semantics as `readPage`. Do not add a second definition of which transactions count, return transaction rows just for a total, or silently exclude archived-account history if the existing list includes it.
- Add the summary and inbox APIs defined above. Return summary counts and `computedAt` from one database snapshot. Compute unread alerts from active retained business notifications; exclude `system.test` from the inbox and unread indicator.
- Reuse backend rendering for safe titles/bodies/destinations. Do not return `statusBody`, dedupe keys, account/transaction ID arrays, or raw provider payloads in inbox responses. Reads and mutations remain authenticated, owner-scoped, and `private, no-store`.
- Add indexes for the owner/active/createdAt/id feed and active unread count. Keep current 90-day notification retention and 30-day terminal-delivery cleanup; archived/read operations must not break foreign-key retention.
- Compute push badge totals at delivery time, not notification creation time. Keep the visible notification body describing the new sync batch. Include the current total and timestamp separately in V2 payloads; unrelated/test pushes must not turn the badge into a dot or reset it.
- Add appropriate bounded push TTLs (24 hours for transaction alerts, one hour for connection alerts, five minutes for tests). Recheck whether a bank connection still needs attention before sending a delayed connection alert. Inbox history remains historical and labels when the event occurred.
- Regenerate and format the Orval client after the contracts are available.

Exit criteria:

- Summary count equals the unfiltered-date Transactions view filtered to uncategorized, including zero, manual/provider rows, category changes/undo, and the existing account-history semantics.
- Inbox pagination is stable with equal timestamps and concurrent inserts. Reading/dismissing is idempotent, cannot mutate another user's alert, and updates unread count correctly.
- A batch of two new transactions with ten already outstanding displays a batch message of two and a badge of twelve. An unrelated alert does not replace twelve with a dot.
- DTO/privacy tests, service/controller tests, count reconciliation tests on PostgreSQL, and generated-client validation pass.

### 5. Add The Inbox And Synchronize Badges

Implementation tasks:

- Add proposed `frontend/src/lib/queries/notifications.ts` and `frontend/src/components/notifications/NotificationInbox.tsx`. Keep requests/invalidation in the query layer, with a header control supplied to the visual `AppShellLayout` from `_authed.tsx`.
- Use a header bell with an accessible unread indicator and a bounded list panel: side drawer on desktop and full-height drawer on phones. Show loading, empty, retained-read-error, read/dismiss pending, and mutation-error states. Opening an item marks only that item read and follows its approved destination; dismiss removes it only after success.
- Add `notifications`/summary query families in `query-invalidation.ts`. Refresh summary after category changes, bulk/undo, manual transaction changes, relevant syncs and inbox mutations. Preserve the existing 30-second financial cache policy; use deduplicated foreground/reconnect refreshes rather than independent focus and visibility requests.
- Route foreground badge updates through one serialized writer in the active worker, using the verified enrollment and snapshot timestamp; importing the same helper into several tabs is not cross-context serialization. Ignore older arrivals, define equal-timestamp handling, prevent a pre-logout response from setting a post-logout badge, and clear on a confirmed zero. Persist only ordering/control metadata, not financial counts. If no worker is usable, defer badge writes until registration/foreground reconciliation rather than creating competing writers.
- Refresh the inbox/summary on a worker message indicating a new relevant push while the app is visible. Do not add continuous polling or silent push solely to update a badge. A suspended device may show its last delivered count until another visible push or foreground refresh; document that platform limit.
- Add explicit fixture handlers and an inbox example in `frontend/workbench/`, updating `catalog.json` and `catalog.md` together. Workbench counts and mutation state must remain isolated per frame.

Exit criteria:

- Reading an alert changes the bell indicator but not the uncategorized badge. Categorizing the last outstanding transaction clears the app badge; failed reads do not falsely clear it.
- Old-user responses/pushes, out-of-order pushes, tab switching, reconnect, and unsupported badging cannot leak data or break inbox navigation.
- Keyboard focus enters/restores correctly; Escape closes the topmost drawer; phone layouts remain usable with text zoom and reduced motion.
- Validate real-component fixtures with `$agent-browser`, then authenticated integration in the real app. Relevant tests, workbench checks, and frontend lint/typecheck pass.

### 6. Make Releases Discoverable Without Losing Work

Implementation tasks:

- Generate one opaque `buildId` per production build and use it consistently in the application bundle, worker, and `/version.json`. Include it in worker bytes so a UI-only release changes the worker. Do not expose environment values or credentials through version metadata.
- Check version on initial readiness and visible/online resume, throttled to at most once per minute. Explicitly call `registration.update()` as needed. Surface detection/check/apply failures separately and keep retry available; a failed version request must not log the user out.
- Add a small in-memory app-transition guard under `frontend/src/lib/pwa/`. Register open `EditorModal` instances, dirty `SettingsPage` state, and pending saves. Audit other inline editors for unsubmitted local drafts. Updates wait until guards clear; there is no persistent draft store in this plan.
- Stop relying on the plugin's automatic controller-change reload. Only the tab whose user chose Update may reload after activation and a final local guard check. Other tabs receive update state and continue with their current hashed assets.
- In `sw.ts`, replace unconditional notification-click `client.navigate` with a focus/message/acknowledgment path for running clients. The app routes immediately if safe or displays a deferred Open action while editing. With no client, open the existing same-origin deep link and preserve it through login. Validate destinations against the allowed application routes.
- Preserve useful `DeferredFeature` reload recovery and TanStack's existing missing-module handling, but ensure recoverable chunk errors cannot silently destroy an active draft or create a reload loop. Handle failed imports with an explicit update/retry surface while blocked.
- Retain available immutable assets for the previous release as described in milestone 7. Do not claim this preserves an old lazy chunk that was never cached or is already gone from the server: those cases need the guarded recovery flow.

Exit criteria:

- An A/B production-build test changes UI only, observes different worker/version metadata, and shows an actionable update in the A client within one foreground check after B is served.
- In two tabs, Update in a clean tab does not reload a tab with a manual transaction editor or dirty Settings. The blocked tab can later update without losing a submitted save or restoring private drafts from storage.
- A notification click during editing preserves the draft and exposes the pending destination; a cold click opens the correct page through authentication.
- Offline update attempts, failed worker installs, missing old lazy chunks, server rollback, and repeated clicks recover without reload loops or mixed-version asset substitution.

### 7. Cache Useful Static Assets And Reduce Startup Overhead

Implementation tasks:

- Rework `frontend/vite.config.ts` precache selection around the generated client entry graph: core JS/CSS, minimal icons, and the small offline recovery asset. Exclude SSR HTML, API URLs, `/version.json`, all-device splash downloads, charts/deferred feature bundles not needed for startup, and source maps.
- Keep splash links working so the browser can request the matching image when needed. Optimize existing icon/splash encodings without changing branding; verify any maskable icon's safe zone rather than treating a manifest label as sufficient.
- Cache successful same-origin, content-hashed `/assets/` responses on use, restricted to expected JS/CSS/font/image content types. Never cache HTML, redirects, missing-asset responses, or arbitrary URLs. Preserve `server/routes/assets/[...path].ts` returning non-cacheable 404s.
- Keep current and previous static-release caches, bounded to 20 MiB combined and at most seven days for an unused previous release. Coordinate cleanup with controlled clients and use network/recovery when an asset cannot be retained. Cache failure or quota exhaustion must not prevent online use or logout.
- Ensure cache migration removes legacy authenticated app-shell caches without indiscriminately deleting the newly introduced static caches from another tab.
- Enable navigation preload for supported workers and consume `event.preloadResponse` before falling back to `fetch`. Preserve streaming server responses and existing `private, no-store` headers; enabling preload without consuming it would double requests.
- Record a baseline before changes using the same production routes, data, viewport, cache state, and network/CPU profile. Compare at least five runs each of first visit, warm reopen, and first navigation after a suspended worker; report medians and transfer sizes.

Exit criteria:

- Generated artifacts contain useful core static assets and zero authenticated HTML/API payloads. A newly registered desktop client does not fetch every Apple splash image.
- Set the essential precache budget before implementation: at most 2.5 MiB raw / 1 MiB compressed. Keep first-visit transfer and median content-ready time within 5% of baseline and show the measured warm/reopen result; do not claim a speedup from cache membership alone.
- Navigation preload causes exactly one navigation request, with authentication/cookies/redirects intact. Already cached unchanged static assets require no body transfer on warm reopen.
- Test quota failure, cache cleanup with another tab on the previous release, missing old assets, offline asset use, and rollback. PWA artifact validation and both production/workbench builds pass.

### 8. Add Offline Recovery And Explicit Save Failure States

Implementation tasks:

- Extract the safe fallback from `frontend/src/sw.ts` into a small offline-page module with a precached recovery script. It must render without the React authenticated root or `/user/me` succeeding.
- Add a keyboard-accessible Retry button, visible retry/pending/error status, and recovery on `online` and visible resume. Keep the original path/search/hash; reload only after a bounded successful same-origin GET probe. Deduplicate probes and prevent reconnect/reload loops. The page contains no financial data.
- Validate that recovery probes reached Splice and establish a valid application/authentication outcome. Static `/version.json` availability alone cannot prove a protected route's backend has recovered; captive-portal HTML or an API outage must not trigger repeated reloads. A confirmed expired session can lead to login while preserving the destination.
- Bound navigation waiting for response headers to eight seconds, then show the recoverable unavailable page. Preserve valid authentication redirects and distinguish a network failure from a server response where possible; do not buffer SSR streams just to impose the timeout.
- Update `PwaLifecycle` and reuse `DataState` to distinguish browser-offline from temporarily unavailable reads. Retain identity-matched loaded results and refresh active reads after recovery; treat `navigator.onLine` as a hint rather than proof the backend is reachable.
- Make known-offline financial saves fail promptly with a retained draft and actionable message. Test the actual TanStack mutation path so a click does not silently become a paused mutation that automatically executes after reconnect. Preserve the special local/server logout behavior from milestone 2.
- Do not automatically replay a write whose response was lost, since it may already have committed. Preserve the draft, explain the uncertainty, and offer read reconciliation before another submission. This plan does not introduce a general offline mutation queue.

Exit criteria:

- An installed app launched offline shows the safe recovery page and returns to its original destination after reconnect without requiring force-close/relaunch.
- Browser-online/API-down, captive/non-app responses, failed retry, and repeated online events produce stable states rather than login redirects or loops.
- A manual transaction save attempted offline sends no delayed mutation after reconnect. A failed online save retains input; reconnect refresh does not reset that input or submit it twice.
- Validate warm-open and cold-launch paths in a production build with `$agent-browser`; workbench-only offline events do not establish worker correctness.

### 9. Polish Installed Layout And Add Shortcuts

Implementation tasks:

- Coordinate `frontend/src/routes/__root.tsx`, `AppShellLayout.tsx/.module.css`, `PwaLifecycle.module.css`, `DataState.module.css`, and `forms/EditorModal.module.css` around `viewport-fit=cover` and shared safe-area variables. Extend header/main offsets together; avoid double-padding already inset editor footers.
- Cover top, bottom, and landscape side insets; preserve `100dvh`/scrolling behavior and make save actions reachable with the software keyboard. Apply shared design-system tokens and maintain theme/status-bar contrast in Light, Dark, and OLED.
- Review the header bell, logout, navigation trigger, lifecycle alerts, drawers, and fixed actions at narrow widths and 200% text zoom. Keep tap targets and focus restoration consistent with existing primitives.
- Add manifest shortcuts for `/transactions?categoryId=UNCATEGORIZED` and `/accounts`, with short labels and suitable existing icons. Keep `id`, `scope`, and `start_url` stable so existing installations retain identity.
- Update the maintained `page-home`, `page-settings`, `page-transactions`, `editors`, and `pwa-lifecycle` workbench examples for affected states, plus the inbox example from milestone 5.

Exit criteria:

- No important controls are obscured by the status area, home indicator, keyboard, drawer, or lifecycle banner on representative phone portrait/landscape and desktop layouts.
- Real installed iOS and Android checks cover launch, keyboard, notification setup/click, and safe areas. Browser emulation is useful additional evidence but cannot certify these OS behaviors; record any unavailable device validation explicitly.
- Shortcuts open the correct filtered/authenticated destination in supported installed browsers and degrade harmlessly where unsupported. Manifest identity is unchanged.
- `$agent-browser` theme/viewport/focus checks, token guard, workbench catalog tests, lint/typecheck, and app/workbench builds pass.

### 10. Validate Upgrade, Privacy Cutover, And Rollback

Implementation tasks:

- Add an automated production-build lifecycle harness under proposed `frontend/scripts/test-pwa-lifecycle.mjs`. Serve A and B from one isolated test origin and drive real service-worker/cache events; do not equate Vitest mocks with release validation. Use the production local-auth flow for authenticated checks, with synthetic users/data.
- Add proposed `frontend/scripts/check-pwa-artifacts.mjs` to verify cache contents, build-ID agreement, byte budgets, shortcut destinations, and no-store public version/worker headers. Wire these focused commands into `frontend/package.json` and the relevant frontend CI job.
- Use `backend/test/helpers/isolated-postgres.ts` for migrations and concurrency tests. The dedicated loopback benchmark database is mandatory; a skipped PostgreSQL suite is not a passing acceptance check.
- Roll out additive schema and compatible server support first. Stop/drain old push processors before the one-time legacy pause so an old binary cannot keep selecting unbound rows. Deploy the new frontend/worker, then enable only session-bound V2 sends. Rebind migration-eligible devices on open without replaying old deliveries.
- Retain compatibility for existing auth tokens and top-level worker payload fields. Record that a suspended old page may need one reload to obtain the enrollment protocol; keep server-side privacy enforcement authoritative throughout.
- On rollback, disable push processing rather than running an old processor against session-bound/revoked data. Preserve the new columns and revocations; do not resurrect subscriptions with a destructive down migration. Use a frontend rollback built with the new lifecycle/privacy protocol, or require worker recovery before re-enabling sends.
- Record actual validation and operational handoff in `frontend/docs/pwa-validation.md` and `backend/docs/pwa-delivery-and-logout.md`. Live rollout follows `/Users/jtkw/projects/stack/AGENTS.md` under the user's explicit implementation/deployment authorization.

Exit criteria:

- A/B update, rollback, multi-tab editor protection, legacy rebind, offline logout/reconnect, and user A -> user B push isolation all pass against real built assets and isolated backend data.
- Dead sockets release resources, another healthy endpoint progresses, and shutdown/restart cannot let an old claim overwrite or send a newer claim.
- Verification evidence distinguishes automated checks, browser emulation, installed-device checks, and remaining platform limitations. Required checks have no unexplained skips.

## Tests

### Backend

- Extend `test/notification/notification.service.spec.ts`, `notification.controller.spec.ts`, and `notification-push.processor.spec.ts` for independent sends, exact claim matching, session eligibility, summary/inbox ownership, counts, rendering, and retry/TTL behavior.
- Add `test/notification/web-push.adapter.spec.ts` with an intercepted transport and a local controlled server: no headers, endless body, slow drip, aborted socket, response-size cap, 404/410, and transient failures. Never contact registered real endpoints.
- Add `test/notification/notification-privacy.postgres.spec.ts` for session/send/revoke/reassignment races, legacy pause/rebind, stale claims, and rollback of a failed atomic logout.
- Add migration tests for the new session/enrollment/claim/index migration, including replacement-chain backfill, retained logins, disabled legacy subscriptions, and cleanup safety.
- Extend auth rotation/grace, token cleanup, OAuth/local login, user logout/logout-all, and private-response HTTP suites. Preserve existing ownership regressions rather than replacing their assertions with mocks of the new coordinator.
- Extend `test/transaction/transaction-query.postgres.spec.ts` for count/list equality and verify the inbox DTO never includes raw provider payload fields.

### Frontend

- Extend `src/lib/pwa/service-worker.test.ts`, `src/lib/notifications/browser-push.test.ts`, `src/components/PwaLifecycle.test.tsx`, `src/lib/pwa/app-badge.test.ts`, and `src/lib/auth.test.ts` with real asynchronous failure ordering, bounded readiness, native-permission gesture ordering, migration-only reenrollment, and always-attempted local cleanup.
- Add behavior tests for transition guards, version checks, offline recovery, worker enrollment/badge ordering, pending logout, and notification-click acknowledgment. Exercise worker handlers through a dedicated seam; do not only assert component callbacks or source strings.
- Extend `src/lib/auth-mutation.integration.test.tsx`, `src/lib/auth-generation.test.ts`, Settings, manual transaction, and query-invalidation tests for identity changes, queued mutation prevention, retained drafts, and summary invalidation.
- Add inbox interaction tests for loading/empty/error, read/archive ownership boundaries, focus restoration, and independent badge/unread semantics.
- Maintain fixture boundaries and `workbench/catalog.json`/`catalog.md`; use behavioral fixture tests and browser inspection rather than tests asserting CSS declarations or z-index constants.
- Run production A/B/rollback/offline checks using the new lifecycle harness and `$agent-browser`, plus installed-device validation for OS-specific behavior.

## Validation Commands

Run these during implementation, in the owning directory. New test/script paths below must be created by their milestones.

Backend:

```bash
cd backend
yarn test test/notification test/auth test/user --runInBand
yarn test test/transaction/transaction-query.postgres.spec.ts --runInBand
yarn test test/migrations --runInBand
yarn lint
yarn typecheck
```

Load `BACKEND_BENCHMARK_DATABASE_URL` only into the test process from local configuration. `isolatedPostgres` requires the dedicated loopback `splice_backend_benchmark` database and creates/drops isolated schemas. Never print the URL or use the live database. Prove migrations both from a pre-change snapshot and on a fresh isolated schema.

Frontend, after the backend OpenAPI contract is available locally:

```bash
cd frontend
yarn orval
yarn test src/lib/pwa src/lib/notifications src/components/PwaLifecycle.test.tsx src/components/notifications --maxWorkers=2
yarn test src/lib/auth src/lib/query-invalidation src/routes/_authed/settings.test.tsx src/components/transactions/ManualTransactionModal.test.tsx --maxWorkers=2
yarn test workbench --maxWorkers=2
yarn tokens:check
yarn lint
yarn typecheck
yarn build
node scripts/check-pwa-artifacts.mjs
node scripts/test-pwa-lifecycle.mjs
yarn workbench:build
```

The lifecycle harness must fail with actionable prerequisites rather than silently skip when its browser or backend is absent. Start the local stack using the repository's `splice-local-dev` skill; use local dev auth bypass instead of Google login. Preserve any pre-existing servers.

Browser validation uses `$agent-browser`, with commands escalated outside the sandbox per user instructions and all sessions started for this work closed afterward. Suggested stable fixture URLs include:

- `/?frame=true&example=pwa-lifecycle&state=offline&mode=dark&width=390`
- `/?frame=true&example=pwa-lifecycle&state=update&mode=light&width=1440`
- `/?frame=true&example=editors&state=pending&mode=oled&width=390`
- `/?frame=true&example=page-settings&mode=dark&width=390`
- `/?frame=true&example=page-transactions&state=refresh-error&mode=light&width=390`
- A new `notification-inbox` example with unread, empty, loading, error, and mutation-failure states.

Cover 390px phone portrait, representative phone landscape, 744px tablet, and 1440px desktop with Light/Dark/OLED, one representative accent, keyboard navigation, and reduced motion. Inspect actual screenshots and interactions; capture alone is not verification.

## Overall Exit Criteria

- All nine selected areas are implemented, with the small inbox and accepted one-time legacy push pause/rebind.
- A slow push endpoint cannot indefinitely occupy the processor or subscription locks; exact claim/session/owner checks prevent stale sends and finalizers.
- Successful logout authoritatively revokes the correct session's push; logout-all covers every user device. Failed optional cleanup never blocks local privacy or the logout request, and offline logout is honest about pending server acknowledgment.
- Permission/setup failures recover, legacy devices rebind only when eligible, and old or wrong-owner pushes cannot expose private content.
- Inbox unread counts and the uncategorized transaction badge have consistent, independent meanings; badge zero, mutation refresh, and out-of-order events are correct.
- UI-only releases are detected; multi-tab updates and notification clicks preserve active work; missing chunks and rollback have bounded, user-visible recovery.
- Useful static assets replace blanket splash precaching, navigation requests are not duplicated, and measured startup/cache results meet the fixed budgets and regression limits.
- Cold offline launch and reconnect recover at the original destination. No financial data/drafts are persisted and no offline save is silently replayed.
- Installed layouts and shortcuts satisfy the documented browser/device matrix. Automated, PostgreSQL, workbench, typecheck, lint, build, and lifecycle checks pass with evidence recorded.
- The separate unrestricted-push-destination P1 remains explicitly tracked outside this plan; completion here must not be reported as resolving it.

## Risks And Remaining Questions

- No product scope questions remain after the two interview decisions. Engineering details must preserve the contracts and acceptance criteria above rather than expand scope silently.
- Session backfill and concurrent refresh/logout are the highest-risk implementation area. The migration and PostgreSQL tests in milestones 2 and 10 must establish correctness before the privacy cutover.
- Keeping a bounded lock during send trades a maximum five-second send wait for clear revocation ordering. A later network-outside-transaction design would require a separate proven fencing protocol; do not weaken ownership to optimize lock duration.
- Browsers can evict caches, delay background delivery, or terminate workers. Foreground reconciliation and safe recovery remain necessary; suspended badges are not guaranteed live.
- Physical-device availability and performance variance are validation dependencies, not facts established by this plan. Record the devices/profiles actually used and any missing evidence before declaring completion.

## Reference Guidance

- [Service worker lifecycle and byte-based update detection](https://web.dev/articles/service-worker-lifecycle)
- [Vite dynamic-import deployment recovery](https://vite.dev/guide/build)
- [Navigation preload and avoiding duplicate requests](https://web.dev/blog/navigation-preload)
- [WebKit user activation and permission requests](https://webkit.org/blog/13862/the-user-activation-api/)
- [WebKit Home Screen push and badging](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)
- [Web Push transport timeout and TTL semantics](https://github.com/web-push-libs/web-push)
- [Safe-area layout guidance](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
- [Manifest shortcuts](https://web.dev/articles/web-apps/shortcuts)
