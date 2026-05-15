# PWA Shell And Offline State

## Status

Done

## Goal

Migrate Splice's PWA shell and service worker lifecycle to `vite-plugin-pwa`, while keeping the current Web Push notification behavior and adding a conservative offline/degraded state.

This phase should:

- Move PWA manifest and service worker build/lifecycle ownership into Vite.
- Keep push notification subscription and delivery behavior working.
- Precache only the app shell/static build assets needed for installed PWA startup.
- Avoid caching authenticated API responses, balances, transactions, accounts, categories, or analysis data.
- Show an explicit offline/degraded state when the shell loads but backend reads cannot complete.

This phase should not:

- Add read-only offline data access.
- Add offline writes or background sync.
- Cache finance API responses in the service worker HTTP cache.
- Change backend notification tables, VAPID delivery, or transaction notification creation.

## Current Behavior

- PWA metadata is currently split between `frontend/src/routes/__root.tsx` and `frontend/public/manifest.json`.
- The root route links `/manifest.json`, `/favicon.ico`, and `/apple-touch-icon.png` in `frontend/src/routes/__root.tsx`.
- Push registration is hand-written in `frontend/src/lib/notifications/browser-push.ts`:
  - checks `Notification`, `PushManager`, and `navigator.serviceWorker`
  - calls `navigator.serviceWorker.register('/sw.js')`
  - subscribes with the backend-provided VAPID public key
  - posts the serialized browser subscription to backend notification APIs
- The service worker is currently a plain public file at `frontend/public/sw.js`.
  - It handles `push`.
  - It calls `self.registration.showNotification`.
  - It handles `notificationclick` by focusing/navigating an existing window or opening a new one.
- The backend push and outbox logic is already implemented in `backend/src/notification/*`.
- The new transaction push payload currently deep links to `/transactions?categoryId=UNCATEGORIZED`.
- The frontend uses TanStack Start, Vite, Nitro, Mantine, and TanStack Query.
- Vite configuration lives in `frontend/vite.config.ts` and currently uses:
  - `nitro()`
  - `tanstackStart()`
  - `viteTsConfigPaths()`
  - `viteReact()`
- Frontend API calls use the generated Orval client through `frontend/src/api/axios.ts`.
- Existing route-level API failures show page-specific errors such as `Failed to load accounts`, `Failed to load settings`, and `Failed to load analysis data`.
- There is no shared online/offline status component and no `navigator.onLine` event handling in `frontend/src`.

## Target Data Shape

No backend database, API, generated API client, notification payload, or shared domain data shape changes are required.

Frontend-only additions:

```ts
type PwaUpdateState = {
  needRefresh: boolean
  updateServiceWorker: (() => Promise<void>) | null
}

type OnlineStatus = {
  isOnline: boolean
}
```

The exact component and hook names can vary during implementation, but they should remain frontend-only and should not introduce API caching.

## Milestones

### 1. Add `vite-plugin-pwa` And Move PWA Metadata Into Vite

Implementation tasks:

- Add `vite-plugin-pwa` to `frontend/package.json` and `frontend/yarn.lock`.
- Update `frontend/vite.config.ts` to include `VitePWA`.
- Use `strategies: 'injectManifest'` so Splice keeps custom push and notification click behavior.
- Move manifest values from `frontend/public/manifest.json` into the `VitePWA({ manifest })` config:
  - `name: 'Splice'`
  - `short_name: 'Splice'`
  - `start_url: '/'`
  - `display: 'standalone'`
  - `theme_color: '#282a36'`
  - `background_color: '#282a36'`
  - existing icon paths from `frontend/public`
- Keep `frontend/src/routes/__root.tsx` linking the manifest unless the plugin injects it cleanly for TanStack Start; validate the rendered head before removing the explicit link.
- Decide whether `frontend/public/manifest.json` should be deleted or left as a compatibility fallback only after confirming the plugin emits the expected manifest in `frontend/.output/public`.

Exit criteria:

- `cd frontend && yarn build` emits a manifest and service worker assets without breaking TanStack Start/Nitro output.
- Built output includes the current icon references.
- No backend files or generated API files are changed.

### 2. Move `public/sw.js` To A Build-Managed Service Worker

Implementation tasks:

- Create `frontend/src/sw.ts`.
- Move the existing `push` and `notificationclick` logic from `frontend/public/sw.js` into `frontend/src/sw.ts`.
- Add Workbox precache support required by `injectManifest`, for example `precacheAndRoute(self.__WB_MANIFEST)`.
- Add only app-shell/static asset precaching. Do not add Workbox `runtimeCaching` rules for `/api`, `splice-api`, transaction, account, balance, category, analysis, auth, or notification endpoints.
- Keep notification click URL resolution origin-bound:
  - relative payload URLs such as `/transactions?categoryId=UNCATEGORIZED` should resolve against `self.location.origin`
  - cross-origin payload URLs should not be introduced in this phase
- Remove or stop serving `frontend/public/sw.js` once `src/sw.ts` is registered and verified.

Exit criteria:

- Existing push notifications still display title/body/tag and navigate on click.
- Service worker source is TypeScript/build-managed and no longer excluded from lint just because it lives in `public`.
- No authenticated API response is cached by service worker code.
- `cd frontend && yarn typecheck` and `cd frontend && yarn lint` pass.

### 3. Centralize Service Worker Registration And Preserve Push Subscription Flow

Implementation tasks:

- Add a frontend PWA helper, for example `frontend/src/lib/pwa/service-worker.ts`.
- Use `virtual:pwa-register` to register the plugin-managed service worker and expose update lifecycle state.
- Preserve the ability for `frontend/src/lib/notifications/browser-push.ts` to obtain a `ServiceWorkerRegistration` for `registration.pushManager.subscribe`.
- Replace direct `navigator.serviceWorker.register('/sw.js')` in `browser-push.ts` with the new helper.
- Keep existing functions and call sites stable where practical:
  - `registerServiceWorker`
  - `getExistingPushSubscription`
  - `enableCurrentDeviceNotifications`
  - `disableCurrentDeviceNotifications`
- Add or update tests in `frontend/src/lib/notifications/browser-push.test.ts` and any new `frontend/src/lib/pwa/*.test.ts`.

Exit criteria:

- Settings > Notifications can still enable the current device after the service worker migration.
- Logout and logout-all still revoke subscriptions through `frontend/src/lib/auth.ts`.
- `cd frontend && yarn test src/lib/notifications/browser-push.test.ts src/lib/auth.test.ts` passes.

### 4. Add PWA Update And Offline/Degraded UI

Implementation tasks:

- Add a small root-mounted component, for example `frontend/src/components/PwaLifecycle.tsx`.
- Mount it from `frontend/src/routes/__root.tsx` inside `AppThemeProvider`, near the existing `<Notifications />`.
- Track browser online status using `navigator.onLine`, `online`, and `offline` events.
- When offline, show a restrained app-level banner or toast that communicates the app is offline and live financial data may not load.
- When the plugin reports `needRefresh`, show a Mantine notification or banner with an explicit update action.
- Keep offline state informational; do not make route-level API errors disappear unless the route has no better context.
- Add tests for:
  - offline banner appears on `offline` event
  - banner clears on `online` event
  - update prompt invokes the plugin update callback

Exit criteria:

- Users opening an installed PWA without network see an intentional offline/degraded state rather than only generic route errors.
- Users with an available service worker update can apply it without guessing they need to close/reopen the app.
- `cd frontend && yarn test` passes for the new component tests and existing route tests.

### 5. Browser Validation And No-API-Cache Audit

Implementation tasks:

- Start the local frontend and backend using the normal local dev flow.
- Use local auth bypass when validating authenticated pages.
- Use `$agent-browser` to validate:
  - manifest is linked/served
  - service worker registers
  - Settings > Notifications still reaches a registered service worker
  - offline/degraded UI appears when simulating offline mode
  - notification click routes still work for `/transactions?categoryId=UNCATEGORIZED`
- Inspect the generated service worker output after `cd frontend && yarn build`.
- Confirm there are no runtime caching rules for authenticated API data.

Exit criteria:

- Browser validation includes at least one desktop viewport and one mobile viewport.
- DevTools/browser automation confirms a service worker is active.
- DevTools/browser automation confirms offline mode shows the planned degraded UI.
- Generated service worker does not cache authenticated API responses.

## Tests

### Backend

- No backend tests are expected for this phase because backend notification APIs, VAPID delivery, and outbox behavior should not change.
- If implementation touches backend unexpectedly, rerun:

```bash
cd backend && yarn test test/notification
cd backend && yarn typecheck
cd backend && yarn lint
```

### Frontend

- Add tests for the PWA registration helper under `frontend/src/lib/pwa/`.
- Update `frontend/src/lib/notifications/browser-push.test.ts` to cover the new registration seam.
- Add tests for the root-mounted PWA lifecycle/offline component.
- Keep existing Settings notification tests passing in `frontend/src/routes/_authed/settings.test.tsx`.
- Keep existing transaction deep-link tests passing in `frontend/src/routes/_authed/transactions.test.tsx`.

## Validation Commands

Frontend:

```bash
cd frontend && yarn test
cd frontend && yarn lint
cd frontend && yarn typecheck
cd frontend && yarn build
```

Backend, only if backend files are touched:

```bash
cd backend && yarn test test/notification
cd backend && yarn lint
cd backend && yarn typecheck
```

Browser validation:

```text
$agent-browser against local frontend/backend
```

Required browser checks:

- Service worker registers successfully.
- Existing notification enable flow still obtains a push subscription.
- Offline mode shows the degraded UI.
- No authenticated API responses are served from service worker cache.
- Installed/mobile-sized viewport still has readable offline/update UI.

## Overall Exit Criteria

- `vite-plugin-pwa` owns the service worker build and PWA manifest output.
- Existing Web Push notification behavior still works.
- `/transactions?categoryId=UNCATEGORIZED` notification deep links continue to load the transactions page with the uncategorized filter active.
- Offline users get a clear degraded state, but no balances, transactions, accounts, categories, analysis data, or auth responses are cached for offline read access.
- The production build succeeds and emits expected PWA assets.
- Frontend test, lint, typecheck, build, and browser validation all pass.

## Risks And Open Questions

- TanStack Start/Nitro output may require careful `vite-plugin-pwa` configuration so the generated service worker and manifest land under `.output/public` correctly. Validate with `cd frontend && yarn build` before removing `frontend/public/manifest.json`.
- Navigation fallback for an SSR app may need a TanStack Start-compatible shell route or fallback document. Do not assume a plain Vite SPA `index.html` fallback without checking built output.
- iOS Home Screen behavior must be validated on device or simulator after deploy; local desktop validation is not enough for final confidence.
- API caching must remain opt-in and out of scope. If an implementer adds Workbox runtime caching, they must explicitly exclude authenticated API origins and document why the cache is safe.
