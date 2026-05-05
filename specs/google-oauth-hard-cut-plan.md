# Google OAuth Hard Cut Login Plan

## Goal

Replace password login and registration with Google OAuth login for the web app. Keep Splice's existing application session model: short-lived JWT access token plus rotating refresh token in HTTP-only cookies. Keep personal access tokens for API/MCP access unless explicitly removed in a separate project.

This is a hard product cut from password auth:

- Users can no longer register with an email/password.
- Users can no longer log in with an email/password.
- The frontend login surface presents only "Continue with Google".
- Existing users retain their data by signing in with a Google account whose verified email matches their existing Splice email.
- New users are created only from verified Google identities, subject to the allowlist/domain policy chosen before launch.

## Current Auth Surface

Backend:

- `backend/src/user/user.controller.ts` exposes public `POST /user/register`, `POST /user/login`, `POST /user/refresh`, and `POST /user/logout`.
- `backend/src/user/user.service.ts` owns password hashing, password verification, user creation, login, token refresh, and user settings.
- `backend/src/user/user.entity.ts` requires `hashedPassword`.
- `backend/src/types/User.ts` includes `CreateUserDto`, `LoginDto`, and password-bearing schemas.
- `backend/src/auth/auth.service.ts` already generates access tokens, rotating refresh tokens, and revokes sessions.
- `backend/src/auth/strategies/jwt.strategy.ts` and `backend/src/auth/guards/jwt-auth.guard.ts` authenticate session cookies and bearer tokens globally.
- `backend/src/auth/personal-access-token.service.ts` supports PAT bearer tokens and should remain available unless product says otherwise.

Frontend:

- `frontend/src/components/LoginCard.tsx` renders email/password inputs.
- `frontend/src/lib/auth.ts` uses generated `useUserControllerLogin`, `useUserControllerLogout`, and `useUserControllerLogoutAll`.
- `frontend/src/api/axios.ts` refreshes cookies through `POST /user/refresh`.
- `frontend/src/routes/index.tsx` displays `LoginCard` when `?login=true`.
- Generated files under `frontend/src/api/**` and `frontend/src/routeTree.gen.ts` must be regenerated, not hand-edited.

Reference docs:

- Google OpenID Connect for authentication: https://developers.google.com/identity/openid-connect/openid-connect
- Google OAuth 2.0 web server flow: https://developers.google.com/identity/protocols/oauth2/web-server

## Clarifications Needed Before Implementation

1. User provisioning policy:
   - Decision: allow only verified Google accounts whose email appears in an environment-configured whitelist, for example `GOOGLE_ALLOWED_EMAILS=alice@example.com,bob@example.com`.
   - Users outside the whitelist must be rejected before any Splice user row is created.

2. Existing-user linking policy:
   - Decision: auto-link by exact normalized email when Google returns `email_verified=true`, the email appears in `GOOGLE_ALLOWED_EMAILS`, and the existing Splice user does not already have `googleSubject`.
   - Reject unverified email claims.
   - Reject verified Google emails that are not in `GOOGLE_ALLOWED_EMAILS`.

3. Production OAuth redirect URLs:
   - Decision: derive callback and frontend redirects from env var values.
   - Local callback: `GOOGLE_OAUTH_CALLBACK_URL=http://localhost:3000/user/oauth/google/callback`.
   - Staging/production callback: `GOOGLE_OAUTH_CALLBACK_URL=${API_DOMAIN}/user/oauth/google/callback`.
   - Frontend redirect validation uses `FRONTEND_DOMAIN`.

4. Mobile/API behavior:
   - Decision: remove token-returning password login entirely.
   - Google OAuth is browser/cookie based.
   - Non-browser API access uses personal access tokens.

5. Password data removal:
   - Recommended launch: stop using password fields and make `hashedPassword` nullable.
   - Recommended cleanup: drop `hashedPassword` after one deploy cycle once rollback is no longer needed.

## Target Architecture

Use backend-owned Google OAuth Authorization Code flow.

1. Frontend sends the browser to `GET /user/oauth/google/start?redirect=/home`.
2. Backend creates a CSRF `state`, stores it in an HTTP-only, short-lived cookie, and redirects to Google's authorization endpoint.
3. Google redirects to `GET /user/oauth/google/callback?code=...&state=...`.
4. Backend validates `state`, exchanges `code`, verifies the ID token, checks `aud`, `iss`, expiry, `email`, `email_verified`, and Google subject (`sub`).
5. Backend finds or creates the Splice user:
   - Prefer existing `googleSubject`.
  - Else link to an existing user by verified normalized email when that email is whitelisted.
  - Else create a user when the verified email is whitelisted.
6. Backend creates the existing Splice access/refresh tokens through `AuthService`.
7. Backend sets `splice_access_token` and `splice_refresh_token` cookies with the existing cookie options.
8. Backend redirects to the validated frontend redirect path.
9. Frontend marks `splice_authenticated=true` after a successful callback landing or by validating `GET /user/me`.

Do not expose Google client secrets or Google tokens to the frontend.

## Milestones

### 1. OAuth Configuration and Data Model

Implementation tasks:

- Add backend dependency on Google's Node server auth library, preferably `google-auth-library`.
- Add backend environment variables to `backend/.env.example`:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `GOOGLE_OAUTH_CALLBACK_URL`
  - `GOOGLE_ALLOWED_EMAILS`
- Add a TypeORM migration for Google identity fields:
  - `googleSubject` nullable varchar, unique where not null.
  - Optional `displayName` nullable varchar.
  - Optional `avatarUrl` nullable varchar.
  - Make `hashedPassword` nullable for hard cut compatibility with newly provisioned OAuth users.
- Update `UserEntity.toObject()` and `UserSchema` only for fields safe to expose. Do not expose Google tokens.
- Add repository lookup helpers:
  - find by `googleSubject`.
  - find by normalized email.
  - link Google identity to an existing user.
  - create OAuth-backed user with default settings.

Exit criteria:

- `yarn migration:run` applies the migration to a fresh local database.
- `yarn migration:revert` cleanly reverts the migration.
- `UserEntity` can persist users with no password hash and with a unique Google subject.
- Duplicate Google subjects are prevented at the database level.
- Password-only legacy users remain readable.

Unit tests:

- User repository/service test creates an OAuth user without `hashedPassword`.
- User repository/service test links a Google subject to an existing verified-email user.
- Duplicate Google subject save/link fails or is handled as a conflict.
- Existing password-era user fixtures still serialize through `toObject()`.

### 2. Backend OAuth Service and Endpoints

Implementation tasks:

- Create a dedicated Google OAuth service, for example `backend/src/auth/google-oauth.service.ts`.
- Add public endpoints in `UserController` or a new auth controller:
  - `GET /user/oauth/google/start`
  - `GET /user/oauth/google/callback`
- Start endpoint:
  - Accept an optional relative `redirect` path.
  - Reject absolute or cross-origin redirects.
  - Generate a cryptographically random state value.
  - Store state and redirect target in a signed or HTTP-only cookie with a short max age.
  - Redirect to Google with `response_type=code`, `scope=openid email profile`, configured callback URL, and optional hosted-domain hint.
- Callback endpoint:
  - Reject missing `code` or `state`.
  - Validate state cookie and clear it after use.
  - Exchange the code server-side.
  - Verify ID token claims, including `email_verified`.
  - Enforce provisioning policy.
  - Resolve or create the Splice user.
  - Issue existing Splice session cookies using shared cookie helpers.
  - Redirect to the validated frontend path.
- Refactor cookie constants/options out of `UserController` to avoid duplicating session cookie behavior.
- Keep `POST /user/refresh`, `POST /user/logout`, `POST /user/logout-all`, `GET /user/me`, settings, and PAT endpoints working.
- Do not add a non-browser OAuth token exchange endpoint unless a future client needs it.

Exit criteria:

- Starting OAuth redirects to Google and sets a short-lived state cookie.
- Callback rejects invalid/missing/replayed state.
- Callback rejects unverified Google emails.
- Callback rejects users outside `GOOGLE_ALLOWED_EMAILS`.
- Callback creates or links a user and sets existing Splice session cookies.
- Existing protected endpoints work after Google login because they still receive the same Splice JWT cookie.
- Logout and logout-all still revoke refresh tokens and clear cookies.

Unit tests:

- Start endpoint sets state cookie and redirects with required Google params.
- Start endpoint rejects unsafe redirect targets.
- Callback rejects missing code, missing state, mismatched state, and replayed state.
- Callback rejects ID tokens with wrong audience, wrong issuer, expired token, missing email, or `email_verified=false`.
- Callback links an existing user by verified email when `googleSubject` is absent.
- Callback logs in an existing user by `googleSubject`.
- Callback creates a new user only when the verified email appears in `GOOGLE_ALLOWED_EMAILS`.
- Callback sets `splice_access_token` and `splice_refresh_token` cookies with existing security options.
- Logout clears cookies after OAuth login.

### 3. Remove Password Auth Contract

Implementation tasks:

- Remove or disable public password endpoints:
  - `POST /user/register`
  - `POST /user/login`
- Remove password-specific service methods from active code paths:
  - `hashPassword`
  - `verifyPassword`
  - password login
  - password user creation
- Update `backend/src/types/User.ts`:
  - Remove password-bearing schemas from public OpenAPI if endpoints are removed.
  - Add any OAuth response/error schemas that are needed for documentation.
- Regenerate frontend API client with `cd frontend && yarn orval` after the backend OpenAPI reflects the new contract.
- Update tests and mocks that assume password login/register exist.
- Keep refresh-token schemas only where still needed for session refresh/logout. API clients should use PATs instead of session login.

Exit criteria:

- OpenAPI no longer advertises password login or password registration.
- `frontend/src/api/models/loginDto.ts`, `createUserDto.ts`, and login mutation hooks disappear after regeneration, unless another active endpoint still uses them.
- Backend has no active request path that accepts a user password.
- Existing PAT functionality remains documented and tested as the supported non-browser API auth path.
- `rg "password|hashedPassword|loginDto|register"` returns only migration history, cleanup comments, or explicitly accepted compatibility references.

Unit tests:

- Removed controller tests are replaced with OAuth endpoint tests.
- No backend test relies on password authentication.
- OpenAPI/client generation test or manual validation confirms password endpoints are absent.

### 4. Frontend Login Cutover

Implementation tasks:

- Replace `LoginCard` with a Google-only sign-in component.
- Button behavior:
  - Preserve current `redirect` search param when present.
  - Navigate browser to `${apiBaseUrl}/user/oauth/google/start?redirect=<relative path>`.
  - Use a full browser navigation, not Axios, because Google OAuth is redirect based.
- After callback returns to frontend:
  - Prefer validating session with `GET /user/me`, then set `authStorage.setAuthenticated()`.
  - Avoid trusting `localStorage` alone.
- Update `frontend/src/routes/index.tsx` to show only Google login.
- Update `frontend/src/lib/auth.ts`:
  - Remove generated password login hook usage.
  - Keep logout/logout-all.
  - Add `startGoogleLogin(redirectTo)` helper or hook.
- Update `frontend/src/api/axios.ts` auth endpoint exemptions:
  - Remove `/user/login` and `/user/register`.
  - Keep `/user/refresh`.
  - Add OAuth callback/start only if relevant to XHR error handling.
- Regenerate TanStack route tree if route files change.

Exit criteria:

- Landing page has no email/password fields.
- Login button starts Google OAuth and preserves intended redirect.
- Successful callback lands on `/home` or requested relative redirect and the authenticated layout renders.
- Refresh-on-401 behavior still works for expired Splice access tokens.
- Logout returns to the unauthenticated landing/login state.

Unit tests:

- Login component renders a single Google login button and no email/password fields.
- Login click constructs the correct backend OAuth start URL from `resolveApiBaseUrl()`.
- Redirect param is preserved and URL-encoded.
- Unsafe redirect strings are not generated client-side.
- Auth storage is set only after a successful user/session validation path.
- Logout still clears local auth flag on success and failure.

### 5. Session, Security, and Observability Hardening

Implementation tasks:

- Centralize auth cookie configuration in a shared backend helper.
- Use `secure=true` in production and `sameSite=lax` unless production deployment needs stricter cross-site handling.
- Ensure OAuth state cookie is HTTP-only, secure in production, sameSite=lax, path-scoped if possible, and short-lived.
- Redact OAuth codes, tokens, ID tokens, state, nonce, and Google client secret in logs.
- Add structured logs for:
  - OAuth start.
  - OAuth callback success.
  - OAuth callback rejection reason category, without raw secrets.
  - User linked by verified email.
  - New user provisioned.
- Validate CORS still allows frontend origin with credentials.
- Validate cookie domain behavior for `FRONTEND_DOMAIN` and API domain split.

Exit criteria:

- No raw OAuth `code`, `state`, ID token, Google access token, refresh token, or client secret appears in logs.
- Session cookies are HTTP-only and match existing production domain behavior.
- CSRF state is single-use.
- Open redirect attempts are rejected.
- Authentication works on local `localhost:4000` frontend and `localhost:3000` backend.

Unit tests:

- Cookie helper tests cover local and production domain derivation.
- State cookie helper tests cover expiry, clearing, and single-use semantics.
- Redirect validation accepts relative app paths and rejects absolute URLs, protocol-relative URLs, backslash tricks, and malformed encodings.

### 6. Local, Staging, and Production Rollout

Implementation tasks:

- Configure Google Cloud OAuth client:
  - Authorized JavaScript origins for frontend origins.
  - Authorized redirect URIs for API callback origins.
  - OAuth consent screen branding.
- Add secrets to local `.env`, staging, and production.
- Run migrations before or during deployment.
- Deploy backend and frontend together because this is a hard contract cut.
- After deploy, smoke test Google login, token refresh, logout, and existing user data access.
- Cleanup after one stable deploy:
  - Drop `hashedPassword` if product confirms no rollback requirement.
  - Remove dead password fixture data and docs.

Exit criteria:

- Staging Google login succeeds for at least one existing user and one new allowed user, if new provisioning is enabled.
- Production secrets are present before deployment starts.
- CI passes backend lint/typecheck/tests and frontend lint/typecheck/tests.
- Deploy comparison passes and production smoke tests pass.
- Rollback note exists: revert frontend/backend together and keep `hashedPassword` until rollback window closes.

Unit tests:

- No additional unit tests required beyond prior milestones, but staging smoke failures must become regression tests before launch.

### 7. Documentation and Operator Setup

Implementation tasks:

- Update `backend/.env.example` with:
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
  - `GOOGLE_OAUTH_CALLBACK_URL=http://localhost:3000/user/oauth/google/callback`
  - `GOOGLE_ALLOWED_EMAILS=`
- Add documentation for local setup:
  - How to create a Google Cloud OAuth 2.0 Web client.
  - Local authorized redirect URI: `http://localhost:3000/user/oauth/google/callback`.
  - Local authorized JavaScript origin: `http://localhost:4000`.
  - How to fill `GOOGLE_ALLOWED_EMAILS`.
  - How to restart the local dev stack after changing env vars.
- Add deployment documentation for staging and production:
  - Set `API_DOMAIN` to the public backend origin.
  - Set `FRONTEND_DOMAIN` to the public frontend origin.
  - Set `GOOGLE_OAUTH_CALLBACK_URL=${API_DOMAIN}/user/oauth/google/callback`.
  - Add that exact callback URL to the Google OAuth client's authorized redirect URIs.
  - Add the frontend origin to the Google OAuth client's authorized JavaScript origins.
  - Store `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_ALLOWED_EMAILS` in the deployment secret manager or environment configuration.
- Update user-facing or developer auth docs to state:
  - Password login and registration are intentionally removed.
  - Existing users sign in with a whitelisted, verified Google account using the same email as their existing Splice account.
  - API/MCP access uses personal access tokens, not session login credentials.
- Add a deployment checklist item requiring the Google OAuth client and env vars to be configured before merging/deploying the hard cut.

Exit criteria:

- A developer can configure local Google OAuth from documentation alone.
- Staging/production docs include exact env var names and callback URL formulas.
- Documentation clearly states that password login is removed and PATs are the non-browser API auth path.
- Deploy checklist prevents shipping the hard cut before Google OAuth secrets and callback URLs are configured.

Unit tests:

- No code unit tests required.
- Documentation review confirms env var names match the implemented code and `.env.example`.

## Agent Browser Test Cases

Run these against the local tmux dev stack after backend, frontend, and Google OAuth test credentials are configured.

### AB-1 Unauthenticated Guard Redirect

Steps:

1. Open `http://localhost:4000/home`.
2. Observe redirect to `/?login=true&redirect=/home`.
3. Confirm no protected account data renders.

Exit criteria:

- Browser is on the landing/login state.
- Login UI is Google-only.
- No protected layout is visible before auth.

### AB-2 Start Google Login

Steps:

1. Open `http://localhost:4000/?login=true&redirect=/accounts`.
2. Click "Continue with Google".
3. Observe navigation to Google's OAuth screen or a local mocked Google callback in test mode.

Exit criteria:

- The request starts at `http://localhost:3000/user/oauth/google/start`.
- Redirect query includes the intended relative app path.
- Backend sets an OAuth state cookie before redirecting away.

### AB-3 Existing User Link by Verified Email

Precondition:

- Database contains a user with email matching the Google test account and no `googleSubject`.

Steps:

1. Complete Google sign-in with that account.
2. Land back on the frontend.
3. Navigate to `/accounts`.

Exit criteria:

- Existing user's data appears.
- `user_entity.googleSubject` is populated for that user.
- No duplicate user is created.

### AB-4 Existing User Login by Google Subject

Precondition:

- Same user from AB-3 already has `googleSubject`.

Steps:

1. Log out.
2. Log in again with the same Google account.

Exit criteria:

- Login succeeds.
- Same Splice user ID is used.
- No email-link path runs again.

### AB-5 New User Provisioning Policy

Steps:

1. Log in with an allowed new Google test account.
2. Repeat with a disallowed Google account or domain.

Exit criteria:

- Allowed account creates a user and reaches `/home`.
- Disallowed account returns to login with a non-secret error message.
- No partial user is created for the disallowed account.

### AB-6 Token Refresh After OAuth Login

Steps:

1. Log in with Google.
2. Force the access-token cookie to expire or temporarily reduce access-token TTL.
3. Trigger an authenticated API request from the app.

Exit criteria:

- Frontend receives a 401 once, calls `POST /user/refresh`, retries the original request, and stays logged in.
- Refresh token rotates.
- No redirect loop occurs.

### AB-7 Logout

Steps:

1. Log in with Google.
2. Click logout in the app shell.
3. Attempt to open `/home` again.

Exit criteria:

- Backend revokes the refresh token.
- `splice_access_token` and `splice_refresh_token` cookies are cleared.
- Local `splice_authenticated` flag is cleared.
- `/home` redirects to login.

### AB-8 OAuth Failure Paths

Steps:

1. Manually open callback with missing `code`.
2. Manually open callback with missing or wrong `state`.
3. Start login, then reuse the same callback URL after successful login.

Exit criteria:

- All failure cases are rejected.
- User lands on a login/error state.
- No session cookies are minted.
- No raw OAuth parameters appear in the UI.

### AB-9 Open Redirect Defense

Steps:

1. Open `http://localhost:4000/?login=true&redirect=https://example.com`.
2. Try protocol-relative and encoded variants such as `%2F%2Fevil.test`.
3. Click Google login.

Exit criteria:

- Frontend and backend normalize or reject unsafe redirects.
- Successful auth only returns to an allowed relative app path.

### AB-10 Password Auth Removed

Steps:

1. Open landing/login page.
2. Inspect rendered form controls.
3. Try direct API calls to removed password endpoints if still routable.

Exit criteria:

- No email/password fields appear.
- `POST /user/login` and `POST /user/register` are absent or return 404/410.
- OpenAPI does not document password endpoints.

## Validation Commands

Backend:

```bash
cd backend && yarn lint
cd backend && yarn typecheck
cd backend && yarn test
cd backend && yarn test:e2e
cd backend && yarn migration:run
cd backend && yarn migration:revert
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn lint
cd frontend && yarn typecheck
cd frontend && yarn test
cd frontend && yarn build
```

Local stack:

```bash
./scripts/dev-tmux.sh -d
```

## Suggested Implementation Order

1. Confirm final local/staging/production env var values.
2. Add data model migration and user service identity helpers.
3. Add Google OAuth service and endpoints while password endpoints still exist locally for development.
4. Add backend OAuth tests.
5. Hard remove password endpoints and schemas.
6. Regenerate frontend API client.
7. Replace frontend login UI and auth helper.
8. Add frontend unit tests.
9. Run local agent-browser tests.
10. Update setup/deployment documentation and `.env.example`.
11. Deploy staging, smoke test, then deploy production.
