# Auth Session Refresh And Cache

## Status

Implemented

## Goal

Remove the frontend `splice_authenticated` localStorage flag as an auth decision source and make backend HTTP-only session cookies the only source of truth for browser login state.

The finished flow should:

- Treat `GET /user/me`, with `POST /user/refresh` fallback, as the canonical browser session probe.
- Cache the current session user in TanStack Query for the current page lifetime.
- Use that session query from protected routes and the landing page.
- Avoid redirecting users to login when their access token is expired but their refresh token is still valid.
- Avoid treating short deploy/network failures as confirmed logout.
- Reduce false logout caused by concurrent refresh attempts across tabs.

## Current Behavior

- Backend browser auth uses HTTP-only cookies set by `setSessionCookies` in `backend/src/auth/auth-cookies.ts`.
- The access cookie `splice_access_token` expires after 15 minutes; the refresh cookie `splice_refresh_token` expires after 30 days.
- `AuthService.generateAccessToken` signs a 15-minute JWT in `backend/src/auth/auth.service.ts`.
- `AuthService.generateRefreshToken` stores a SHA-256 hash in the `refresh_token` table and returns the raw token to the cookie response.
- `AuthService.rotateRefreshToken` revokes the old refresh token immediately and creates a new one.
- `UserController.refresh` reads the refresh token from the cookie first, then from the body for mobile clients, and sets new cookies.
- Frontend API calls use the Axios instance in `frontend/src/api/axios.ts` with `withCredentials: true`.
- The Axios interceptor refreshes after a `401` by calling `POST /user/refresh`, then retries the original request.
- The protected route guard in `frontend/src/routes/_authed.tsx` checks `context.auth.isAuthenticated()` first. That ultimately reads `localStorage.splice_authenticated`.
- If the localStorage flag is missing, `_authed.beforeLoad` calls `validateSession()` from `frontend/src/lib/auth.ts`.
- `validateSession()` calls `GET /user/me` with raw `fetch`, but it does not call `POST /user/refresh` on `401`.
- The landing page in `frontend/src/routes/index.tsx` also reads `authStorage.isAuthenticated()` directly, so it can show the login UI while valid HTTP-only cookies still exist.
- `frontend/src/lib/auth.test.ts` currently asserts that `validateSession()` sets and clears the localStorage auth flag.
- `frontend/src/router.tsx` exposes an `auth.isAuthenticated` router context that wraps the old `tokenStorage.hasTokens()` alias.

Relevant files:

- `backend/src/auth/auth-cookies.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/auth.module.ts`
- `backend/src/auth/refresh-token.entity.ts`
- `backend/src/user/user.controller.ts`
- `backend/src/user/user.service.ts`
- `frontend/src/api/axios.ts`
- `frontend/src/lib/auth.ts`
- `frontend/src/lib/auth.test.ts`
- `frontend/src/router.tsx`
- `frontend/src/routes/_authed.tsx`
- `frontend/src/routes/index.tsx`
- `frontend/src/api/clients/spliceAPI.ts`

## Target Data Shape

No shared API contract changes are required for the localStorage removal and TanStack Query session cache.

The frontend should introduce a local session-query shape based on the generated `User` model returned by `GET /user/me`:

```ts
type SessionState = {
  user: User
}
```

The existing backend `TokenResponse` from `POST /user/refresh` remains unchanged:

```ts
type TokenResponse = {
  accessToken: string
  refreshToken: string
}
```

If the backend refresh grace milestone is implemented, it may require a migration for additional refresh-token rotation metadata. That data shape should be designed in that milestone, not as part of the initial frontend source-of-truth cleanup.

## Milestones

### 1. Shared Refresh-Aware Session Helper

Implementation tasks:

- Replace `authStorage` and `tokenStorage` decision behavior in `frontend/src/lib/auth.ts` with a refresh-aware session helper.
- Keep `buildGoogleOAuthStartUrl`, `startGoogleLogin`, `getSafeRelativeRedirect`, `useLogout`, and `useLogoutAll`.
- Add a helper such as `ensureSession()` that:
  - calls `GET /user/me` with credentials
  - returns the current `User` when the call succeeds
  - calls `POST /user/refresh` when `/user/me` returns `401`
  - retries `GET /user/me` after refresh succeeds
  - reports logged-out only after refresh also fails with an auth failure
- Use the generated API client functions from `frontend/src/api/clients/spliceAPI.ts` where practical. If using raw `fetch` to avoid interceptor recursion, centralize URL and credentials behavior with `resolveApiBaseUrl()` from `frontend/src/api/axios.ts`.
- Avoid writing or reading `localStorage.splice_authenticated`.
- Preserve logout notification cleanup behavior in `useLogout` and `useLogoutAll`.

Exit criteria:

- `ensureSession()` succeeds for `me 200`.
- `ensureSession()` succeeds for `me 401 -> refresh 200 -> me 200`.
- `ensureSession()` returns logged-out for `me 401 -> refresh 401`.
- `ensureSession()` does not use localStorage.
- `useLogout` and `useLogoutAll` still revoke push subscriptions before calling the generated logout mutations.

### 2. TanStack Session Query

Implementation tasks:

- Add a small frontend session module, for example `frontend/src/lib/session.ts`, that exports:
  - a stable query key such as `['session', 'me']`
  - `sessionQueryOptions()` using `ensureSession()`
  - a hook such as `useSession()` when useful for components
- Configure the session query with a short `staleTime`, for example 1 to 5 minutes, so route transitions do not repeatedly probe `/user/me`.
- Keep retries conservative. Auth failures should not retry endlessly; transient network/server failures may retry through TanStack defaults only if they do not force login.
- Update `useLogout` and `useLogoutAll` call sites or mutation success handlers to remove or invalidate the session query through `QueryClient`.

Exit criteria:

- The current user can be loaded through one canonical session query.
- Repeated route checks within the configured stale window reuse cached session data.
- Logout clears the session query so the UI no longer treats the user as logged in.
- No code path depends on `splice_authenticated`.

### 3. Route And Landing Page Integration

Implementation tasks:

- Update `frontend/src/router.tsx` to remove the `auth.isAuthenticated` router context or stop wiring it to token/localStorage aliases.
- Update `_authed.beforeLoad` in `frontend/src/routes/_authed.tsx` to call `context.queryClient.ensureQueryData(sessionQueryOptions())`.
- Redirect to `/` with `login=true` and the original redirect path only when `ensureQueryData` fails with a confirmed logged-out result.
- Update `AuthedLayout` to read the current user from the session query or from the existing generated `useUserControllerMe` only if it shares the same query key and refresh behavior.
- Update `frontend/src/routes/index.tsx` to use the session query instead of `authStorage.isAuthenticated()`.
- On `/`, show the "Enter Splice" action when the session query succeeds, show login only after confirmed logged-out state, and avoid a persistent login page during the unknown/loading state.
- Remove `AUTH_FLAG_KEY` from `frontend/src/api/axios.ts`.

Exit criteria:

- Opening `/home` with an expired access cookie and valid refresh cookie refreshes once and loads the protected route.
- Opening `/` with valid cookies shows the app-entry state without requiring a localStorage flag.
- Opening `/` with no valid cookies shows the login UI.
- Clicking logout clears server cookies, removes cached session data, and returns to logged-out UI.
- SSR still avoids rendering protected content before the client session check completes.

### 4. Refresh Failure Classification

Implementation tasks:

- Update the Axios response interceptor in `frontend/src/api/axios.ts` so `clearAuthAndRedirect()` only runs for confirmed auth failures from `/user/refresh`, not for network errors, deploy restarts, CORS-like failures, or `5xx` responses.
- Introduce a typed error or small classifier helper that distinguishes:
  - confirmed logged-out auth failures: `401` or `403` from refresh
  - transient failures: missing response, timeout, `502`, `503`, `504`, and other `5xx`
  - ordinary non-auth request failures that should propagate to the caller
- Reuse the same classifier from the session helper where practical.
- For transient refresh failures, reject the original request so existing page-level error handling can surface failure without clearing auth state or redirecting to login.

Exit criteria:

- Expired sessions still redirect to login after refresh returns `401` or `403`.
- API unavailability during refresh does not clear session state or force a login redirect.
- Existing non-auth API error behavior remains unchanged outside the refresh path.

### 5. Cross-Tab Refresh Coordination

Implementation tasks:

- Add a frontend refresh coordinator around calls to `POST /user/refresh`.
- Prefer `navigator.locks` when available, with a fallback based on `BroadcastChannel` or localStorage events.
- Keep the coordinator isolated from auth state storage. LocalStorage may be used as a short-lived lock fallback only, not as an auth source of truth.
- Make Axios refresh and `ensureSession()` share the same coordinator so route checks and API calls do not rotate the refresh token independently.
- Broadcast refresh success/failure so other tabs can retry `/user/me` after the active tab refreshes.
- Use a short lock timeout so crashed tabs do not block refresh indefinitely.

Exit criteria:

- Two same-browser tabs receiving `401` at the same time result in only one refresh request when coordination APIs are available.
- The waiting tab retries its original `/user/me` or API call after the active tab refreshes.
- A stale lock times out and allows a later refresh attempt.
- The coordinator never stores raw access or refresh tokens in localStorage.

### 6. Backend Refresh Rotation Hardening

Implementation tasks:

- Review backend logs after milestones 1 through 5 to confirm whether false logout from duplicate refresh still occurs.
- If duplicate refresh remains likely, design a short grace strategy in `backend/src/auth/auth.service.ts`.
- Keep the security rule that refresh tokens remain hashed at rest.
- Prefer adding rotation metadata to `RefreshTokenEntity` only if needed, with a migration under `backend/src/migrations/`.
- Consider a short grace window that permits near-simultaneous duplicate rotation of a just-revoked token without revoking all sessions. Document the tradeoff explicitly.
- Ensure expired refresh tokens, old revoked tokens outside the grace window, and logout-all revoked tokens still fail closed.
- Add structured log fields that distinguish expired, revoked, not-found, duplicate-within-grace, and duplicate-outside-grace refresh failures without logging raw tokens.

Exit criteria:

- Concurrent duplicate refresh attempts do not falsely log out an active browser session within the defined grace behavior.
- Expired refresh tokens still fail.
- Logout-all still invalidates all refresh tokens for the user.
- Raw refresh tokens are never persisted or logged.
- Any migration is reversible and covered by backend tests.

## Tests

### Backend

- Add or update `backend/test/auth` coverage only for milestone 6.
- Add `AuthService.rotateRefreshToken` tests for:
  - valid rotation
  - expired refresh token
  - revoked token outside grace
  - duplicate token within grace if the grace behavior is implemented
  - logout-all remaining authoritative
- Add or update `backend/test/user/user.controller.spec.ts` only if refresh endpoint response behavior changes.

### Frontend

- Rewrite `frontend/src/lib/auth.test.ts` so it no longer mocks localStorage auth state.
- Add tests for:
  - `ensureSession()` success on first `/user/me`
  - `ensureSession()` refresh fallback
  - `ensureSession()` confirmed logged-out failure
  - transient refresh failure not clearing auth or redirecting
  - logout and logout-all removing the session query
- Add route guard tests or focused route integration coverage for `_authed.beforeLoad` using `queryClient.ensureQueryData`.
- Add landing page tests for:
  - successful session query shows app entry
  - confirmed logged-out state shows login
  - loading/unknown state does not incorrectly claim logout
- Add Axios interceptor tests if a test seam exists or can be added without broad refactor:
  - one-tab refresh retry still works
  - refresh `401` redirects to login
  - refresh `503` does not redirect to login
- Add cross-tab coordinator unit tests using mocked `navigator.locks` or `BroadcastChannel` if milestone 5 is implemented.

## Validation Commands

Frontend:

```bash
cd frontend && yarn test src/lib/auth.test.ts
cd frontend && yarn test src/routes/index.test.tsx
cd frontend && yarn test src/routes/_authed.test.tsx
cd frontend && yarn typecheck
cd frontend && yarn lint
```

Backend, when milestone 6 is implemented:

```bash
cd backend && yarn test test/auth
cd backend && yarn test test/user/user.controller.spec.ts
cd backend && yarn typecheck
cd backend && yarn lint
```

Manual browser validation:

```bash
cd backend && yarn start:dev
cd frontend && yarn dev
```

Use the local dev auth bypass when appropriate:

```text
http://localhost:3000/user/dev/login?redirect=/home
```

Then verify:

- Login sets HTTP-only cookies and loads `/home`.
- Removing `splice_authenticated` from localStorage has no effect because the key is no longer used.
- After the access token expires, opening `/home` refreshes and stays in the app.
- Opening `/` with valid cookies shows the app-entry state.
- Opening `/` after logout shows login.
- During a simulated backend restart, the frontend does not permanently clear auth state just because refresh temporarily fails.
- With two tabs open after access expiry, only one refresh request is made when the cross-tab coordinator is supported.

Browser-observable changes should be validated with `$agent-browser` after implementation by checking `/`, `/home`, and logout behavior in desktop and mobile-sized viewports.

## Overall Exit Criteria

- Browser login state is derived from backend HTTP-only cookies, not localStorage.
- The `splice_authenticated` flag is removed from frontend auth decisions and tests.
- A valid refresh cookie can recover an expired access cookie from route guards, landing page checks, and normal API calls.
- The landing page no longer shows the login UI for a recoverable authenticated session.
- Deploy or network blips during refresh do not force a false logout.
- Same-browser multi-tab refresh races are coordinated on the client.
- Backend refresh hardening is either implemented with tests or explicitly deferred with logging evidence that frontend coordination is sufficient for the observed issue.
- Frontend targeted tests, `typecheck`, and `lint` pass.
- Backend targeted tests, `typecheck`, and `lint` pass for any backend changes.
