# Deployment

Splice promotes releases from `main` to the protected `deploy` branch through GitHub Actions.

## Production configuration

Start from the backend and frontend `.env.example` files and store production values in the deployment secret manager. At minimum, configure:

- PostgreSQL connection values and a strong `JWT_SECRET`
- `API_DOMAIN` and `FRONTEND_DOMAIN` as the exact public origins
- Plaid credentials for linked accounts
- Google OAuth client credentials, callback URL, and allowed email addresses
- optional VAPID keys for browser push notifications

Personal access tokens remain available for ordinary REST API automation. MCP
is a separate Auth0 OAuth resource at `https://splice-mcp.kw0.dev/mcp`; it does
not accept PATs and is not mounted on `API_DOMAIN`. Keep MCP disabled on normal
API replicas. The SF-only listener, Auth0 contract, ingress ordering, smoke
tests, and rollback are documented in the [canonical MCP runbook](mcp.md).

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

## Docker build cache

Build the app directories with BuildKit (enabled by default in current Docker):

```bash
docker build -t splice-backend:local backend
docker build --build-arg VITE_API_BASE_URL=https://splice-api.kw0.dev -t splice-frontend:local frontend
```

Both Dockerfiles keep Yarn downloads in locked BuildKit cache mounts, with
separate cache IDs for each app and Node major version. Backend build and
production installs share a package cache; the cache is not included in the
runtime image. Frozen installs use Yarn's built-in network retries and a
five-minute network timeout for slow registry requests.

Dependency layers remain reusable when application source or the frontend API
build argument changes. The Docker contexts exclude local dependencies, build
output, and `.env` files; pass frontend build configuration through build args
and backend runtime configuration through the deployment environment.

Cache reuse requires the same persistent builder. Garbage collection can remove
cache, so builds must also succeed from an empty cache. Shared builder retention
is managed in `koonweee/stack` by `shared/prune-build-cache.sh` and the existing
weekly Komodo maintenance procedure.

## Verification

After deployment:

- confirm the backend health endpoint responds successfully
- smoke test Google login, token refresh, and logout
- verify account sync and transaction refresh
- verify a personal-access-token request against an ordinary REST endpoint
- follow the separate deterministic OAuth MCP smoke in the [MCP runbook](mcp.md)
- verify browser push notifications when VAPID is configured
