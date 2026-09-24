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
is a separate Auth0 OAuth resource at `https://splice-mcp.sf.ext.kw0.dev/mcp`; it
does not accept PATs and is not mounted on `API_DOMAIN`. Stack v2 runs one
backend with the MCP listener enabled. The Auth0 contract and smoke tests are
documented in the [canonical MCP runbook](mcp.md); migration ordering and
rollback live in `koonweee/stack-v2/apps/splice/README.md`.

Set the Google callback URL to `${API_DOMAIN}/user/oauth/google/callback`, register that exact redirect URI with Google, and register `FRONTEND_DOMAIN` as an authorized JavaScript origin. Keep `LOCAL_AUTH_BYPASS=false` in every deployed environment.

## SF external migration build

For the Stack v2 migration, build the reviewed migration commit from the deployed
source baseline on the operator Mac. Target `linux/amd64` explicitly for SF;
permanent build automation and builder VM setup are deferred. Publishing images
does not deploy the application. After publishing, pin both immutable digests
in `koonweee/stack-v2/apps/splice/compose.yaml`.

```sh
# From a clean checkout of the reviewed migration commit; Docker must be logged in to GHCR.
revision=$(git rev-parse HEAD)
tag="sf-migration-$(git rev-parse --short=12 HEAD)"
docker buildx build --platform linux/amd64 --push \
  --label "org.opencontainers.image.revision=$revision" \
  --label org.opencontainers.image.source=https://github.com/koonweee/splice-mono \
  --tag "ghcr.io/koonweee/splice-backend:$tag" backend
docker buildx build --platform linux/amd64 --push \
  --label "org.opencontainers.image.revision=$revision" \
  --label org.opencontainers.image.source=https://github.com/koonweee/splice-mono \
  --build-arg VITE_API_BASE_URL=https://splice-api.sf.ext.kw0.dev \
  --tag "ghcr.io/koonweee/splice-frontend:$tag" frontend
```

Use a unique tag for each reviewed source revision and build configuration. Do
not overwrite the legacy `latest` tags during migration. The legacy workflow
below promotes source; after its Komodo build triggers are retired, it does not
publish or deploy images by itself.

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
