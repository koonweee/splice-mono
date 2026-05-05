# Google OAuth Testing Guide

Use this guide to test the Google OAuth hard cut locally.

## Prerequisites

- Dependencies installed:
  - `cd backend && yarn install`
  - `cd frontend && yarn install`
- `backend/.env` exists.
- `frontend/.env` exists.
- Local Postgres is available through the backend Docker Compose file.
- A Google Cloud OAuth 2.0 Web client exists for local testing.

## Google Cloud Setup

In Google Cloud Console, create or edit an OAuth 2.0 Client ID with application type **Web application**.

Configure:

- Authorized JavaScript origin: `http://localhost:4000`
- Authorized redirect URI: `http://localhost:3000/user/oauth/google/callback`

If the OAuth consent screen is in testing mode, add every Gmail/Google account you plan to test with as a test user.

## Environment Setup

Add these values to `backend/.env`:

```bash
GOOGLE_OAUTH_CLIENT_ID=<google web client id>
GOOGLE_OAUTH_CLIENT_SECRET=<google web client secret>
GOOGLE_OAUTH_CALLBACK_URL=http://localhost:3000/user/oauth/google/callback
GOOGLE_ALLOWED_EMAILS=you@example.com,other-tester@example.com
FRONTEND_DOMAIN=http://localhost:4000
API_DOMAIN=http://localhost:3000
```

`GOOGLE_ALLOWED_EMAILS` is a comma-separated allowlist. Only verified Google accounts whose normalized email appears in that list can sign in or create a Splice user.

Confirm `frontend/.env` has:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

After changing OAuth env vars, restart the backend.

## Start Dev Servers

Run each command in a separate terminal.

Terminal 1, Postgres:

```bash
cd backend
docker compose up postgres
```

Terminal 2, backend:

```bash
cd backend
yarn migration:run
yarn dotenv -- nest start --watch
```

Terminal 3, frontend:

```bash
cd frontend
yarn dev
```

Expected URLs:

- Backend: `http://localhost:3000`
- Frontend: `http://localhost:4000`
- API docs: `http://localhost:3000/api`

Optional tmux layout:

```bash
tmux new-session -d -s splice-dev -c backend 'docker compose up postgres'
tmux split-window -h -t splice-dev -c backend 'yarn dotenv -- nest start --watch'
tmux split-window -v -t splice-dev:0.1 -c frontend 'yarn dev'
tmux select-layout -t splice-dev tiled
tmux attach -t splice-dev
```

Stop it later with:

```bash
tmux kill-session -t splice-dev
```

## Optional Existing-User Link Setup

To test linking an existing password-era user to Google, create a legacy row whose email matches your Google account and is in `GOOGLE_ALLOWED_EMAILS`.

From another terminal:

```bash
cd backend
docker compose exec postgres psql -U splice_user -d splice_dev
```

Then run:

```sql
INSERT INTO "user_entity" ("email", "hashedPassword", "settings")
VALUES (
  'you@example.com',
  'legacy-placeholder',
  '{"currency":"USD","timezone":"UTC","hideZeroBalanceAccounts":false}'
)
ON CONFLICT ("email")
DO UPDATE SET "googleSubject" = NULL;
```

After signing in with that Google account, verify no duplicate user was created:

```sql
SELECT "id", "email", "googleSubject", "createdAt", "updatedAt"
FROM "user_entity"
WHERE "email" = 'you@example.com';
```

## Browser Test Cases

### 1. Unauthenticated Redirect

1. Open `http://localhost:4000/home`.
2. Confirm you land on `http://localhost:4000/?login=true&redirect=%2Fhome`.
3. Confirm the page shows only `Continue with Google`.
4. Confirm there are no email/password fields.

### 2. Google Login Success

1. Open `http://localhost:4000/?login=true&redirect=/accounts`.
2. Click `Continue with Google`.
3. Complete Google login with an email in `GOOGLE_ALLOWED_EMAILS`.
4. Confirm you land on `/accounts`.
5. Confirm protected app navigation is visible.

### 3. Existing User Auto-Link

Precondition: complete the optional existing-user setup above.

1. Sign in with the matching Google account.
2. Confirm existing data is visible.
3. Query `user_entity` and confirm the existing row now has `googleSubject`.
4. Confirm there is still only one row for that email.

### 4. New Whitelisted User Provisioning

1. Add a new Google email to `GOOGLE_ALLOWED_EMAILS`.
2. Restart the backend.
3. Sign in with that account.
4. Confirm the app loads.
5. Confirm a new `user_entity` row exists with that email and `googleSubject`.

### 5. Non-Whitelisted User Rejection

1. Remove a test email from `GOOGLE_ALLOWED_EMAILS`.
2. Restart the backend.
3. Try to sign in with that account.
4. Confirm login is rejected and no new user row is created.

### 6. Logout

1. Sign in successfully.
2. Click the logout icon in the app header.
3. Confirm you return to the unauthenticated landing/login state.
4. Open `http://localhost:4000/home`.
5. Confirm it redirects back to login.

### 7. Password Endpoints Removed

Run:

```bash
curl -i -X POST http://localhost:3000/user/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password123"}'
```

Expected result: `404 Not Found`.

Run:

```bash
curl -i -X POST http://localhost:3000/user/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password123"}'
```

Expected result: `404 Not Found`.

### 8. Open Redirect Defense

Run:

```bash
curl -i 'http://localhost:3000/user/oauth/google/start?redirect=https://evil.example'
```

Expected result: `400 Bad Request`.

Run:

```bash
curl -i 'http://localhost:3000/user/oauth/google/start?redirect=/accounts'
```

Expected result: `302 Found` with a `Location` header pointing to `https://accounts.google.com/...`.

### 9. API/PAT Access

1. Sign in with Google.
2. Open Settings.
3. Create a personal access token.
4. Use the token against a protected endpoint:

```bash
curl -i http://localhost:3000/user/me \
  -H 'authorization: Bearer splice_pat_...'
```

Expected result: `200 OK` with your user profile.

## Automated Verification

Backend:

```bash
cd backend
yarn lint
yarn typecheck
yarn test
yarn migration:show
```

Frontend:

```bash
cd frontend
yarn lint
yarn typecheck
yarn test
yarn build
```

If backend OpenAPI changes, regenerate the frontend client while the backend is running:

```bash
cd frontend
yarn orval
```

## Troubleshooting

### Callback returns `Google OAuth token exchange failed`

This error is emitted after Google rejects the backend's request to exchange the one-time authorization code for tokens. Check the backend log entry named `Google OAuth token exchange rejected`; it includes Google's sanitized `googleError`, `googleErrorDescription`, the HTTP status, and the callback URL the backend sent.

For HTTP `401` with `googleError=invalid_client`, verify:

- `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are from the same Google OAuth 2.0 **Web application** client.
- The backend process was restarted after editing `backend/.env`.
- The client secret was not copied from another environment or rotated in Google Cloud after it was added to `.env`.
- There are no extra spaces around the `.env` values.

For `invalid_grant`, verify:

- `GOOGLE_OAUTH_CALLBACK_URL` exactly matches the authorized redirect URI in Google Cloud.
- The browser flow starts fresh from `/user/oauth/google/start`; OAuth codes are one-time use and expire quickly.
- Local testing uses `http://localhost:3000/user/oauth/google/callback` consistently in Google Cloud and `backend/.env`.

## Expected Final State

- Browser login uses Google only.
- Password login and registration are unavailable.
- Whitelisted verified Google users can sign in.
- Existing users are linked by verified matching email.
- Non-whitelisted users are rejected.
- Session cookies are HTTP-only.
- API/MCP automation uses personal access tokens.
