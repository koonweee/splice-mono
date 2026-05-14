# PWA Notifications

## Status

Planned

## Goal

Add a push-capable PWA notification foundation for Splice, with the first notification type covering new provider-synced transactions.

The MVP should:

- Let a logged-in user enable notifications for the current device/browser from a new Settings > Notifications tab.
- Store canonical app notifications in the backend so future in-app notification surfaces can reuse the same data model.
- Treat push as one delivery target for canonical notifications, not as the notification product model.
- Send one privacy-preserving push notification per transaction sync run when new non-manual provider transaction rows are inserted.
- Keep push payloads count-only and route clicks to `/transactions`.
- Avoid offline app-shell caching, background sync, and broad PWA behavior changes.

## Current Behavior

- The frontend already links a web app manifest in `frontend/src/routes/__root.tsx`; the manifest lives at `frontend/public/manifest.json`.
- There is no service worker registration or push notification handling in `frontend/src`.
- Settings live in `frontend/src/routes/_authed/settings.tsx`; existing tabs are General, Access, Categories, Analysis, and MCP.
- User preferences are stored in backend JSONB via `backend/src/types/UserSettings.ts`, `backend/src/user/user.entity.ts`, and `backend/src/user/user.service.ts`.
- Generated frontend API clients live under `frontend/src/api/**` and must be regenerated with `cd frontend && yarn orval` after backend OpenAPI changes.
- Backend modules follow the `entity/service/controller/module` pattern, for example `backend/src/webhook-event/*` and `backend/src/transaction/*`.
- The backend already uses `@nestjs/event-emitter` through `EventEmitterModule.forRoot()` in `backend/src/app.module.ts`.
- The backend already uses `@nestjs/schedule` through `ScheduleModule.forRoot()` in `backend/src/app.module.ts`, with scheduled work in `backend/src/bank-link/bank-link.scheduled.ts`.
- Provider transaction sync is processed in `TransactionService.processSyncResults` in `backend/src/transaction/transaction.service.ts`.
- Manual transactions are created through separate `createManual`, `updateManual`, and `removeManual` paths and are marked with `source: 'manual'`.
- Provider rows inserted during sync are marked with `source: 'provider'`; pending-to-posted matching updates an existing pending row instead of inserting a new row.
- Normal logout flows through `frontend/src/lib/auth.ts` and backend `POST /user/logout`; logout-all flows through `POST /user/logout-all`.

## Target Data Shape

Add notification preferences to `UserSettings`:

```ts
type UserNotificationSettings = {
  transactions: {
    newSyncedTransactions: boolean
  }
}
```

Default behavior:

- Existing users normalize to `notifications.transactions.newSyncedTransactions = false` until they enable notifications.
- When a user enables notifications on a device for the first time and the notification preference is unset, save `newSyncedTransactions = true`.
- Category/type preferences are user-level and apply across devices.
- The top-level Notifications toggle is device/browser-specific and reflects the current push subscription state.

Add canonical app notification data:

```ts
type NotificationType = 'transactions.new_synced'

type NotificationStatus = 'active' | 'archived'

type NotificationEntity = {
  id: string
  userId: string
  type: NotificationType
  dedupeKey: string
  payload: {
    count: number
    transactionIds: string[]
    accountIds: string[]
    occurredAt: string
  }
  status: NotificationStatus
  readAt: Date | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
```

For MVP, no in-app notification list UI is required, but the canonical table should be shaped so read/archive/list endpoints can be added later.

Add current-device push subscriptions:

```ts
type PushSubscriptionEntity = {
  id: string
  userId: string
  endpoint: string
  p256dh: string
  auth: string
  userAgent: string | null
  revokedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
```

`endpoint` should be unique. Re-registering the same endpoint should upsert/refresh the existing row and keep it attached to the current authenticated user.

Add push delivery rows:

```ts
type NotificationPushDeliveryStatus =
  | 'pending'
  | 'processing'
  | 'sent'
  | 'failed'
  | 'skipped'

type NotificationPushDeliveryEntity = {
  id: string
  notificationId: string
  subscriptionId: string
  status: NotificationPushDeliveryStatus
  attemptCount: number
  availableAt: Date
  processingStartedAt: Date | null
  sentAt: Date | null
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}
```

Delivery rows are operational. Clean them up after 30 days.

## Milestones

### 1. Backend Notification Domain And Preferences

Implementation tasks:

- Add a `notification` backend module under `backend/src/notification/` with entities, types, service, controller, listener, and scheduled processor files.
- Add `NotificationEntity`, `PushSubscriptionEntity`, and `NotificationPushDeliveryEntity`.
- Add a TypeORM migration after `backend/src/migrations/1776600000000-AddTransactionSource.ts` to create the notification tables, indexes, uniqueness constraints, and foreign keys.
- Extend `backend/src/types/UserSettings.ts` with `notifications.transactions.newSyncedTransactions`.
- Update `DEFAULT_USER_SETTINGS`, `normalizeUserSettings`, and `UpdateUserSettingsDtoSchema`.
- Update `UserService.updateSettings` in `backend/src/user/user.service.ts` to merge nested notification settings without dropping existing settings.
- Register the notification module in `backend/src/app.module.ts`.

Exit criteria:

- Existing users with missing notification settings normalize without migration-time JSON backfill errors.
- `PATCH /user/settings` can update `notifications.transactions.newSyncedTransactions` independently of other settings.
- `cd backend && yarn test test/user/user.service.spec.ts` passes after adding or updating settings merge coverage.
- `cd backend && yarn typecheck` passes.

### 2. Push Subscription API And VAPID Configuration

Implementation tasks:

- Add backend notification endpoints:
  - `GET /notification/push/config` returns whether push is configured plus `vapidPublicKey` when available.
  - `GET /notification/push/subscription/current` returns current-device subscription state by endpoint when a client supplies its browser subscription endpoint, or a simple configured/not-configured status if no endpoint is available.
  - `POST /notification/push/subscriptions` upserts the current browser subscription for the authenticated user.
  - `DELETE /notification/push/subscriptions/current` revokes the current browser subscription by endpoint.
  - `DELETE /notification/push/subscriptions` revokes all active push subscriptions for the authenticated user; use this from logout-all.
- Add `web-push` and any needed type package to `backend/package.json`.
- Add VAPID env vars:
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`
- Implement a push adapter that wraps `web-push` and is isolated inside the notification module.
- Make push delivery optional in local development: if VAPID env vars are absent, canonical notifications can still be created, but push delivery rows should be skipped or marked skipped with structured logs.

Exit criteria:

- Subscription endpoints are authenticated by the existing global `JwtAuthGuard`.
- Duplicate endpoint registration updates an existing row instead of creating duplicates.
- Revoking a device subscription marks only that subscription revoked.
- Revoking all subscriptions marks all active rows for the current user revoked.
- `cd backend && yarn test test/notification` passes after adding controller/service tests.
- `cd backend && yarn lint` passes.

### 3. Provider Transaction Domain Event

Implementation tasks:

- Add transaction event types under `backend/src/events/transaction.events.ts`.
- In `TransactionService.processSyncResults`, collect only rows that are actually inserted as new provider rows.
- Emit a `transactions.provider_new_synced` event after the TypeORM transaction commits successfully.
- Do not emit for:
  - manual transaction creation or updates
  - modified provider transactions
  - removed provider transactions
  - pending-to-posted updates that replace an existing pending row
- Include `userId`, inserted transaction IDs, account IDs, and count in the event payload.

Exit criteria:

- A sync result that inserts N new provider rows emits exactly one event with N IDs.
- A sync result that only modifies rows emits no notification event.
- A sync result that matches `pendingTransactionId` and updates an existing pending row emits no notification event.
- `cd backend && yarn test test/transaction/transaction.service.spec.ts` passes with new event-emitter coverage.

### 4. Canonical Notification Creation And Push Fanout

Implementation tasks:

- Add a notification listener that receives the new provider transaction event.
- Check `UserSettings.notifications.transactions.newSyncedTransactions` before creating the canonical notification.
- Create one aggregate `NotificationEntity` per sync run with payload `{ count, transactionIds, accountIds, occurredAt }`.
- Add a narrow dedupe key based on sorted inserted transaction IDs, for example `transactions.new_synced:<userId>:<hash>`.
- Let unique dedupe conflicts become idempotent no-ops.
- Create pending push delivery rows for all active push subscriptions for that user when push is configured.
- Keep canonical notification creation independent from whether push subscriptions exist.

Exit criteria:

- Preference disabled: no canonical notification and no push delivery rows.
- Preference enabled with no subscriptions: canonical notification exists, no push delivery rows.
- Preference enabled with two active subscriptions: one canonical notification and two pending push delivery rows.
- Reprocessing the same event does not create duplicate canonical notifications.
- `cd backend && yarn test test/notification` passes with listener/service coverage.

### 5. Push Delivery Processor And Cleanup

Implementation tasks:

- Add an in-app scheduled processor using `@nestjs/schedule`.
- Claim a bounded batch of pending/available push delivery rows using DB locking or an equivalent safe claim update.
- Render push content in the notification module by type:
  - title: `New transactions synced`
  - body: `1 new transaction was added` or `{count} new transactions were added`
  - URL: `/transactions`
- Send pre-rendered `{ title, body, url, tag }` payloads to the service worker.
- On successful send, mark delivery `sent`.
- On `404` or `410` from browser push services, mark the subscription revoked and mark delivery failed or skipped.
- On transient errors, increment `attemptCount`, set `availableAt` for retry, and cap retries.
- Add scheduled cleanup for push delivery rows older than 30 days.
- Use structured logging with context objects, matching backend logging guidance.

Exit criteria:

- Delivery processor sends one push per pending delivery row.
- Failed expired subscriptions are revoked and are not used for later notifications.
- Delivery rows older than 30 days are deleted by cleanup.
- Processor tests cover success, expired subscription, transient retry, and cleanup.
- `cd backend && yarn test test/notification` passes.

### 6. Frontend Push-Only PWA Wiring

Implementation tasks:

- Add a minimal service worker at `frontend/public/sw.js`.
- Handle `push` by parsing backend-rendered title/body/url/tag and calling `self.registration.showNotification`.
- Handle `notificationclick` by focusing an existing Splice client or opening the click URL.
- Add browser-only service worker registration code under `frontend/src/lib/notifications/`.
- Add helpers to:
  - load backend push config
  - convert VAPID public key to the `Uint8Array` format expected by `PushManager.subscribe`
  - request browser notification permission from a user gesture
  - subscribe/unsubscribe current device
  - detect unsupported browsers, denied permission, and missing backend push config
- Do not add Workbox, VitePWA, app-shell caching, route caching, or offline behavior in this milestone.

Exit criteria:

- Service worker registration is skipped during SSR.
- Unsupported browsers show a non-destructive disabled state in Settings.
- Missing VAPID config does not break the app.
- `cd frontend && yarn typecheck` passes.
- `cd frontend && yarn test` passes after adding focused helper tests where practical.

### 7. Settings UI And Logout Lifecycle

Implementation tasks:

- Add a Notifications tab in `frontend/src/routes/_authed/settings.tsx`.
- Add a top-level “Notifications” device toggle:
  - On enable, request permission, register service worker, subscribe with `PushManager`, POST subscription to the backend, and initialize `notifications.transactions.newSyncedTransactions = true` if unset.
  - On disable, DELETE the current subscription on the backend and call `subscription.unsubscribe()`.
- Add a Transactions category with a “New transactions synced” switch bound to user-level settings.
- Keep category switches disabled until the backend user settings are loaded; do not require a current device subscription to change user-level preferences.
- Update `frontend/src/lib/auth.ts` normal logout to best-effort revoke the current browser subscription before clearing auth locally.
- Update logout-all to best-effort revoke all push subscriptions for the user before clearing auth locally.
- Invalidate `useUserControllerMe` query after notification preference changes.
- Run `cd frontend && yarn orval` after backend OpenAPI changes and commit generated `frontend/src/api/**`.

Exit criteria:

- Settings shows a Notifications tab with the device toggle and Transactions category.
- Turning on notifications creates a backend push subscription for the current authenticated user.
- Turning off notifications revokes only the current browser subscription.
- Turning off “New transactions synced” prevents future canonical notification creation.
- Normal logout revokes only the current device subscription.
- Logout-all revokes all active push subscriptions for the user.
- `cd frontend && yarn test src/routes/_authed/settings.test.tsx src/lib/auth.test.ts` passes after adding UI/lifecycle coverage.
- Validate the Settings UI with `$agent-browser` in desktop and mobile widths.

## Tests

### Backend

- `test/user/user.service.spec.ts`
  - Normalizes missing notification settings.
  - Merges nested notification settings without dropping currency, timezone, theme, or analysis settings.
- `test/transaction/transaction.service.spec.ts`
  - Emits a single event for inserted provider rows.
  - Does not emit for manual transactions, modified rows, removals, or pending-to-posted replacements.
- `test/notification/notification.service.spec.ts`
  - Creates canonical notifications when preferences allow.
  - Skips canonical creation when the type preference is disabled.
  - Dedupes repeated transaction-sync events.
  - Creates push delivery rows per active subscription.
- `test/notification/notification.controller.spec.ts`
  - Authenticated subscription create/delete behavior.
  - Duplicate endpoint upsert behavior.
  - All-device revoke behavior.
- `test/notification/notification-push.processor.spec.ts`
  - Successful push send.
  - Expired subscription revocation on `404`/`410`.
  - Transient retry with capped attempts.
  - 30-day delivery cleanup.

### Frontend

- `frontend/src/routes/_authed/settings.test.tsx`
  - Renders Notifications tab.
  - Shows unsupported or unconfigured states.
  - Enables current-device notifications through user gesture flow.
  - Updates user-level “New transactions synced” preference.
  - Disables current-device notifications without changing the user-level preference.
- `frontend/src/lib/auth.test.ts`
  - Normal logout attempts current-device subscription revoke before local auth cleanup.
  - Logout-all attempts all-subscription revoke before local auth cleanup.
- Notification helper tests under `frontend/src/lib/notifications/`
  - VAPID key conversion.
  - Browser support detection.
  - Permission denied handling.
  - Existing subscription reuse.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/user/user.service.spec.ts
cd backend && yarn test test/transaction/transaction.service.spec.ts
cd backend && yarn test test/notification
cd backend && yarn lint
cd backend && yarn typecheck
cd backend && yarn migration:show
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/routes/_authed/settings.test.tsx src/lib/auth.test.ts
cd frontend && yarn test
cd frontend && yarn lint
cd frontend && yarn typecheck
cd frontend && yarn build
```

Manual and browser validation:

- Start local backend/frontend with VAPID env vars configured.
- In Chrome on `localhost:4000`, log in, open Settings > Notifications, enable notifications, and verify a subscription row is created.
- Trigger or simulate a provider transaction sync that inserts new provider rows.
- Verify one canonical notification row and one push delivery row per active subscription.
- Verify the browser notification appears with count-only text.
- Click the notification and confirm Splice opens/focuses `/transactions`.
- Repeat with two browsers or profiles and confirm both active subscriptions receive a push.
- Disable notifications on one browser and confirm only that subscription is revoked.
- Use `$agent-browser` to validate the Settings tab at desktop and mobile widths, including no overlapping text, disabled states, and successful preference toggling.

## Overall Exit Criteria

- Users can install/open Splice as a PWA-compatible web app and opt into notifications from Settings.
- The top-level Notifications toggle controls only the current device/browser subscription.
- The Transactions > New transactions synced preference is user-level and defaults to enabled when notifications are first turned on.
- New provider transaction inserts produce one aggregate canonical notification per sync run when the type preference is enabled.
- Manual transactions, provider modifications, removals, and pending-to-posted replacements do not produce the MVP notification.
- Push delivery is handled through the notification module, not directly from transaction sync.
- Push payloads are count-only and backend-rendered.
- Service worker logic remains push-only with no offline caching behavior.
- Revoked or expired subscriptions are not reused.
- Push delivery rows older than 30 days are cleaned up.
- Backend and frontend focused tests, lint, typecheck, and build validation pass.

## Risks And Open Questions

- Browser support differs by platform. iOS/iPadOS web push generally requires the app to be added to the Home Screen; the Settings UI should communicate unsupported or unavailable states without breaking the rest of Settings.
- Production push requires HTTPS, stable origin, and valid VAPID env vars. Localhost can be used for focused development, but production deploy docs should include VAPID key generation and secret configuration.
- The unique dedupe strategy should hash sorted transaction IDs. The implementation should avoid storing long dedupe strings when many transactions are inserted.
- Claiming push delivery rows safely matters if multiple backend instances run. Use row locking or a status claim update that prevents duplicate delivery.
- No in-app notification center is included in MVP. The data model reserves `readAt` and archive fields, but list/read/archive APIs and UI remain future work.
