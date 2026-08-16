# Deployment

Splice promotes releases from `main` to the protected `deploy` branch through GitHub Actions.

## Production configuration

Start from the backend and frontend `.env.example` files and store production values in the deployment secret manager. At minimum, configure:

- PostgreSQL connection values and a strong `JWT_SECRET`
- `API_DOMAIN` and `FRONTEND_DOMAIN` as the exact public origins
- Plaid credentials for linked accounts
- Google OAuth client credentials, callback URL, and allowed email addresses
- optional VAPID keys for browser push notifications

Set the Google callback URL to `${API_DOMAIN}/user/oauth/google/callback`, register that exact redirect URI with Google, and register `FRONTEND_DOMAIN` as an authorized JavaScript origin. Keep `LOCAL_AUTH_BYPASS=false` in every deployed environment.

## Release workflow

From the GitHub **Actions** tab:

1. Select **Deploy**.
2. Choose **Run workflow** from `main`.
3. Keep `confirm` set to `deploy` and start the workflow.

The workflow creates or reuses a `main` → `deploy` pull request, runs CI for the exact head commit, enables auto-merge, and waits for the protected deployment PR to merge.

The equivalent CLI command is:

```bash
gh workflow run deploy.yml -R koonweee/splice-mono --ref main -f confirm=deploy
```

## Verification

After deployment:

- confirm the backend health endpoint responds successfully
- smoke test Google login, token refresh, and logout
- verify account sync and transaction refresh
- verify a personal-access-token request and MCP connection
- verify browser push notifications when VAPID is configured
