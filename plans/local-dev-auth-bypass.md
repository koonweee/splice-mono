# Local Dev Auth Bypass

## Status

Implemented

## Goal

Add a development-only login path that lets local browser automation tools, including Codex agent browser, authenticate without completing Google OAuth. The bypass should create the same normal backend session cookies as Google login, so protected frontend routes and authenticated API requests behave like a real browser session.

The bypass must be explicitly enabled in local backend environment configuration, must refuse production use, and must only work for local requests. It should map to a stable Splice user so all existing user-owned account and transaction scoping remains unchanged.

## Current Behavior

- The backend uses a global `JwtAuthGuard`; routes are protected by default unless decorated with `@Public()`.
- Browser sessions use HTTP-only cookies named `splice_access_token` and `splice_refresh_token`.
- Google OAuth login starts at `GET /user/oauth/google/start`, completes at `GET /user/oauth/google/callback`, sets session cookies, then redirects to the frontend.
- The frontend checks protected routes by calling `/user/me`; on success it sets the local `splice_authenticated` flag.
- Setting only the frontend local storage flag is not sufficient because backend API calls still require valid cookies.
- Personal access tokens are useful for API-only usage, but they do not provide a browser session for frontend investigation.

Relevant files:

- `backend/src/user/user.controller.ts`
- `backend/src/user/user.service.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/auth-cookies.ts`
- `backend/.env.example`
- `frontend/src/routes/_authed.tsx`
- `frontend/src/lib/auth.ts`

## Target Data Shape

No database schema, generated API client, or shared type changes are required.

The dev login should reuse the existing user row shape. The selected user is controlled by backend env:

```env
LOCAL_AUTH_BYPASS=true
LOCAL_AUTH_BYPASS_EMAIL=your-local-user@example.com
```

For users created by the bypass, use a deterministic fake Google identity:

```ts
type LocalDevIdentity = {
  googleSubject: `local-dev:${string}`
  email: string
  displayName: 'Local Dev'
  avatarUrl: null
}
```

If a user already exists for `LOCAL_AUTH_BYPASS_EMAIL`, the endpoint should authenticate as that user directly so local synced data remains available even when the user already has a real Google subject. If no user exists, the endpoint should create one with the deterministic local dev identity.

## Milestones

### 1. Backend Dev Login Endpoint

Implementation tasks:

- Add `GET /user/dev/login?redirect=/home` to `UserController`.
- Decorate the endpoint with `@Public()`.
- Require `LOCAL_AUTH_BYPASS === 'true'`.
- Reject when `NODE_ENV === 'production'`.
- Reject requests whose hostname is not local. Allow `localhost`, `127.0.0.1`, and `::1`.
- Reject requests whose remote address is not loopback. Allow `127.0.0.1`, `::1`, and IPv4-mapped `::ffff:127.0.0.1`.
- Require `LOCAL_AUTH_BYPASS_EMAIL` and normalize it through existing user service behavior.
- Validate the optional `redirect` query parameter with `googleOAuthService.validateRedirectPath(...)`.
- Use `userService.findByEmail(...)` first.
- If no matching user exists, use `userService.findOrCreateFromGoogleIdentity(...)` with `googleSubject: local-dev:${email}`.
- Mint normal session tokens with `authService.generateAccessToken(...)` and `authService.generateRefreshToken(...)`.
- Set existing auth cookies with `setSessionCookies(...)`.
- Redirect using `googleOAuthService.buildFrontendRedirectUrl(...)`.

Exit criteria:

- Visiting `http://localhost:3000/user/dev/login?redirect=/home` with bypass env enabled sets normal session cookies and redirects to the frontend.
- `/user/me` succeeds after the redirect and returns the configured email.
- The endpoint does not bypass `JwtAuthGuard` globally or alter authorization behavior for other routes.
- The implementation does not introduce a production-enabled auth shortcut.

### 2. Dev-Only Configuration Documentation

Implementation tasks:

- Add a clearly marked local-dev-only section to `backend/.env.example`:

```env
# Local dev auth bypass
# Development only. Never enable in production.
LOCAL_AUTH_BYPASS=false
LOCAL_AUTH_BYPASS_EMAIL=
```

- Add repository documentation describing how Codex or agent browser should use the endpoint:

```text
http://localhost:3000/user/dev/login?redirect=/home
```

- State that `LOCAL_AUTH_BYPASS_EMAIL` maps the browser session to a specific Splice user and therefore controls which accounts and transactions are visible.
- State that this is for local development only and is refused in production and for non-local requests.

Exit criteria:

- Developers can discover the env vars from `backend/.env.example`.
- The repo docs explain the local browser-login workflow without implying the bypass is available in deployed environments.

### 3. Tests And Manual Browser Validation

Implementation tasks:

- Add or update backend controller tests covering disabled bypass, production refusal, non-local host refusal, missing email refusal, unsafe redirect handling, and successful login.
- Mock token generation and cookie setting at the controller boundary where practical.
- Manually verify the end-to-end browser flow with the local backend and frontend running.

Exit criteria:

- Negative cases fail closed.
- Successful login creates the same session-cookie path used by Google OAuth.
- Agent browser can load authenticated frontend pages without Google login.

## Tests

### Backend

- Controller test: `LOCAL_AUTH_BYPASS` unset or not `true` rejects the dev login endpoint.
- Controller test: `NODE_ENV=production` rejects even when `LOCAL_AUTH_BYPASS=true`.
- Controller test: request hostname outside `localhost`, `127.0.0.1`, or `::1` rejects.
- Controller test: request remote address outside loopback rejects.
- Controller test: missing `LOCAL_AUTH_BYPASS_EMAIL` rejects.
- Controller test: invalid redirect is rejected by existing redirect validation.
- Controller test: success path finds or creates the configured user, generates access and refresh tokens, sets cookies, and redirects to the frontend URL.

### Frontend

- No frontend code changes are expected.
- Manual validation should confirm the existing protected-route flow calls `/user/me`, sets `splice_authenticated`, and allows navigation after the backend dev login redirects to the app.

## Validation Commands

Backend:

```bash
cd backend && yarn test user.controller
cd backend && yarn lint
```

Optional broader backend validation:

```bash
cd backend && yarn test
```

Manual local validation:

```bash
cd backend && yarn dotenv -- nest start --watch
cd frontend && yarn dev
```

Then open:

```text
http://localhost:3000/user/dev/login?redirect=/home
```

Confirm:

- the browser redirects to `http://localhost:4000/home`
- `/user/me` returns `LOCAL_AUTH_BYPASS_EMAIL`
- authenticated pages load data for that user
- disabling `LOCAL_AUTH_BYPASS` makes the endpoint unavailable

## Overall Exit Criteria

- Local browser automation can authenticate by visiting the dev login endpoint once.
- The session uses normal HTTP-only auth cookies and exercises the same frontend protected-route behavior as Google OAuth login.
- The authenticated user is stable and controlled by `LOCAL_AUTH_BYPASS_EMAIL`.
- User-owned data scoping remains unchanged.
- The bypass is explicitly documented as local development only.
- The bypass refuses production and non-local requests.
- Backend targeted tests and lint pass.
