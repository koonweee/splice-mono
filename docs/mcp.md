# Splice MCP

## Read this in 60 seconds

Splice exposes one public, stateless Streamable HTTP MCP resource at
`https://splice-mcp.kw0.dev/mcp`. It is separate from the Nest API origin and
uses Auth0 OAuth access tokens; a Splice personal access token is valid only for
ordinary REST API automation and must not be used with MCP.

Every read requires `splice:read`. The two real writes require `splice:write`.
Tool annotations give compatible clients risk and confirmation hints, but they
are not authorization and do not guarantee a confirmation prompt. OAuth scope
checks, authenticated-user ownership, domain validation, and categorization
preview tokens are the authoritative controls.

The listener is disabled by default. Production enables it only on the SF app
replica and routes container port `3001` through external Traefik. Deployment
topology and Komodo values live in the separate `koonweee/stack` repository,
under `control-plane/komodo/resources/apps/splice/` and
`control-plane/komodo/stacks/splice-app/`.

## Authentication and identity

The production OAuth contract is:

| Setting | Value |
| --- | --- |
| MCP resource/audience | `https://splice-mcp.kw0.dev/mcp` |
| Auth0 issuer | `https://auth.kw0.dev/` |
| Signing algorithm | RS256 |
| Read scope | `splice:read` |
| Write scope | `splice:write` |
| Protected-resource metadata | `https://splice-mcp.kw0.dev/.well-known/oauth-protected-resource/mcp` |

Auth0 is the authorization server; Splice is only the protected resource.
Splice validates signature, issuer, audience, expiry, subject, and the
space-delimited `scope` claim. It accepts only an Auth0 subject in the
`google-oauth2|<Google subject>` namespace and resolves that subject to an
existing Google-linked Splice user. Unknown subjects and other identity
providers fail closed; MCP never creates or links a user and never selects a
user from client input.

Reuse the tenant's existing Google social connection. Splice does not need an
Auth0 client secret. Client registration remains an Auth0/client concern: verify
current CIMD support at rollout time and enable DCR only if the selected client
requires it.

Production listener configuration is identifier-only and contains no Auth0
secret:

```env
MCP_ENABLED=true
MCP_PORT=3001
MCP_SERVER_URL=https://splice-mcp.kw0.dev/mcp
AUTH0_ISSUER=https://auth.kw0.dev/
MCP_ALLOWED_HOSTNAMES=splice-mcp.kw0.dev
MCP_ALLOWED_ORIGIN_HOSTNAMES=chatgpt.com,chat.openai.com
```

These values belong only on `splice-app-sf`. The base API replicas omit the
listener-specific values and remain disabled.

## Capability and safety contract

The server exposes 27 tools. All return validated `structuredContent` and a
JSON-equivalent text fallback.

- Context, accounts, balances, and transactions: `get_user_context`,
  `get_accounts_snapshot`, `get_balance_history`, `list_balance_snapshots`,
  `list_transactions`, `search_transactions`, and `list_categories`.
- Cash flow and rule context: `get_cashflow_analysis`,
  `get_cashflow_analysis_audit`, `list_cashflow_category_transactions`,
  `list_analysis_rules`, `list_categorization_rules`,
  `list_categorization_rule_recommendations`,
  `list_manual_categorized_transaction_examples`, and
  `list_rule_candidate_patterns`.
- Investments and projections: `list_investment_holdings`,
  `list_investment_activity`, `list_recurring_manual_transaction_schedules`,
  and `collect_projection_assumptions`.
- Read-only MCP App launchers: `show_cashflow_explorer`,
  `show_projection_scenario_modeler`, `show_portfolio_viewer`, and
  `show_category_rule_workbench`.
- Categorization workflow: `preview_categorization_rule_draft` and
  `preview_categorization_rule_application` are reads;
  `create_categorization_rule` is a real non-idempotent, non-destructive write;
  `apply_categorization_rule` is a real destructive, idempotent write.

The 25 non-mutating tools require `splice:read`. Both writes require
`splice:write`. Creation and application must receive the matching preview
token produced for the authenticated user and current input. Stale, mismatched,
or cross-user tokens are rejected. Application preserves existing protections
for manual transactions and manual category assignments.

Client-native MCP risk annotations are the accepted confirmation mechanism:
reads are marked read-only/idempotent, creation is marked mutating, and
application is marked destructive/idempotent. Splice intentionally has no
server-side approval queue. A client may choose not to display a confirmation,
so operators and clients must treat Splice preview counts—not the UI prompt—as
the mutation boundary.

The server also exposes:

- `splice://mcp-guide` and five data templates:
  `splice://reports/cashflow/{startDate}/{endDate}`,
  `splice://accounts/{accountId}/snapshot`,
  `splice://categories/taxonomy`, `splice://rules/analysis`, and
  `splice://portfolio/holdings/latest`.
- Five prompts: `monthly_cashflow_review`, `projection_builder`,
  `category_cleanup_audit`, `portfolio_snapshot`, and
  `tax_or_refund_anomaly_review`.
- Four self-contained `ui://splice/...` MCP App resources for cash flow,
  projections, portfolio, and category-rule workbench views.

MCP Apps are progressive enhancement. Clients without App support still receive
usable structured and text results. Projection assumption collection is
non-persistent: capable clients use the SDK v2 input-required/resume flow;
clients without that capability receive an ordinary structured `inputRequired`
fallback and can ask the user for the same non-sensitive fields.

## Pinned server library

The backend pins public registry package `@koonweee/mcp-kit` exactly to `0.2.3`.
The registry artifact and public declarations were independently verified
against release commit `3203ecc113b94f1b21266296f44b1953ba5967f2`
and annotated tag `v0.2.3`. Its npm integrity is
`sha512-IK8efs+MarqfTNiBVTbjqYQKdtK7IUvE72NzMhNSEX4l52aLaFxeuVk6S2GjnvKsdpUEOUTnnV1WPDK7YjxZVw==`.
This release provides verified ESM and CommonJS consumption for all four public
entrypoints, safe claim-free logging, ordinary CommonJS Jest authentication,
a typed client input-required capability signal, and typed safe error boundaries
for service-owned resource and prompt callbacks. Splice uses the CommonJS branch
selected by its NodeNext Nest build.
Splice consumes only these declared public entrypoints:

| Entrypoint | Splice use |
| --- | --- |
| `@koonweee/mcp-kit` | `defineTool`, `defineServer`, scope/risk policy, typed outputs, SDK v2 handler context and input-required result |
| `@koonweee/mcp-kit/node` | Stateless Node Streamable HTTP listener through `serveNode` |
| `@koonweee/mcp-kit/auth0` | Auth0 JWT verifier, bearer gate, principal conversion, and protected-resource discovery |
| `@koonweee/mcp-kit/test` | Deterministic in-memory/JWT test helpers without a live Auth0 tenant |

Recheck the pin and export map after installing dependencies:

```bash
cd backend
yarn why @koonweee/mcp-kit
node -e "const p=require('./node_modules/@koonweee/mcp-kit/package.json'); console.log(p.version, Object.keys(p.exports))"
```

Expected version: `0.2.3`. Expected export keys: `.`, `./node`, `./auth0`, and
`./test`. Do not replace the pin with a Git, file, or sibling-checkout reference.

The backend lockfile intentionally contains no SDK v1 package. Mastra is pinned
to `1.58.0`, its first compatible split-SDK release, and `yahoo-finance2` is
temporarily pinned to `3.14.3`, the last release before its unrelated MCP
feature introduced an SDK v1 dependency. npm marks Yahoo Finance v3 as
unsupported; track this pin and return to a supported v4 release as soon as
upstream removes or makes that isolated MCP dependency optional. The provider,
recommendation, full backend, and image checks below guard this temporary pin.

## Local automated validation

MCP is opt-in, so normal API development needs no Auth0 variables. The example
environment lists all listener settings and keeps `MCP_ENABLED=false`.

```bash
cd backend
yarn install --frozen-lockfile
yarn typecheck
yarn lint
yarn test --runInBand test/mcp
yarn test --runInBand
yarn build
docker build -t splice-backend:mcp-port .
docker run --rm --entrypoint node splice-backend:mcp-port --version
```

The final command must report Node 24. Tests use ephemeral local signing keys and
must not require a real Auth0 tenant or bearer token.

Search for prohibited legacy guidance and implementation seams:

```bash
rg -n "splice[_]pat_|PersonalAccessTokenOnly|StreamableHTTPServerTransport|elicitInput" backend/src backend/README.md README.md docs frontend/src
rg -n "@modelcontextprotocol/sdk" backend/src
```

Both searches should return no production-source match. The old SDK v1 package,
legacy elicitation escape hatch, and API-origin MCP controller must be absent.

## Local MCP App browser fixtures

Generate and serve all four self-contained fixtures:

```bash
cd backend
npx ts-node -r tsconfig-paths/register test/mcp/fixtures/render-mcp-app-resource.ts /tmp/splice-mcp-app-resource-fixtures
python3 -m http.server 4173 --directory /tmp/splice-mcp-app-resource-fixtures
```

In another terminal, inspect each generated HTML file at desktop and mobile
sizes. The agent-equivalent flow is:

```bash
export AGENT_BROWSER_SESSION="$(agent-browser session id --scope worktree --prefix splice-mcp-fixtures)"
agent-browser open http://127.0.0.1:4173/cashflow-explorer.html
agent-browser snapshot -i
agent-browser console
agent-browser set viewport 390 844
agent-browser snapshot -i
agent-browser screenshot /tmp/splice-mcp-cashflow-mobile.png
agent-browser close
```

Repeat for `projection-scenario-modeler.html`, `portfolio-viewer.html`, and
`category-rule-workbench.html`. Verify readable desktop/mobile layout, local
fixture fallbacks, read-only interactions, and no console errors. Always close
the named browser session when finished.

## First production deployment

These steps intentionally separate repository automation from Auth0, DNS, and
live deployment mutations. Do not put a real bearer token in shell history,
fixtures, documentation, screenshots, or chat.

1. Record rollback inputs before changing production: the known-good Splice
   application revision, stack revision, and backend image digest.
   Agent check: confirm all three values are present in the deployment record;
   do not infer them from `latest` after rollout.
2. Land the Splice code, run the backend/frontend validation suites, build the
   Node 24 production image, and publish it through the normal release process.
   Follow the [deployment guide](deployment.md); after the application commit is
   on `main`, the agent-equivalent promotion command is:

   ```bash
   gh workflow run deploy.yml -R koonweee/splice-mono --ref main -f confirm=deploy
   ```

   Agent check: run the local commands above, inspect the image's
   `node --version`, and wait for the protected `main` to `deploy` workflow to
   finish successfully.
3. Land the declarative `koonweee/stack` change. In that repository, render both
   the shared base Compose and the SF external override using the commands in its
   colocated Splice operations note. Sync/verify `external-routing` first so
   `external-traefik-sf` and `external-web` exist, then sync the `splice`
   ResourceSync. A ResourceSync updates definitions; it does not restart the
   running app. Agent check from the stack repository:

   ```bash
   cd control-plane/komodo/stacks/splice-app
   docker compose -f docker-compose.yml config
   docker compose -f docker-compose.yml -f docker-compose.external.yml config
   ```

   The merged render must attach only `splice-backend` to `external-web`, apply
   `traefik.scope=external`, route `splice-mcp.kw0.dev`, and target port `3001`
   without publishing that port on the host.
4. In Auth0, configure one API/resource whose identifier is exactly
   `https://splice-mcp.kw0.dev/mcp`, uses RS256 and the current recommended Auth0
   MCP token dialect, and defines `splice:read` plus `splice:write`. Reuse the
   existing Google social connection, grant the allowed Google user the needed
   permissions, and verify Resource Parameter Compatibility Profile and
   issuer-in-authorization-response settings. Reconfirm CIMD/DCR requirements
   for the selected client. Agent check: use the Auth0 configuration export or
   read-only API to compare identifier, algorithm, dialect, scopes, and tenant
   settings; never print client credentials or tokens.
5. Create `splice-mcp.kw0.dev` DNS for the SF public ingress and verify TCP
   `80/443` forwarding to the SF external Traefik host. Keep the database, API
   admin surface, and Komodo off this hostname. Agent check:
   `dig +short splice-mcp.kw0.dev`; compare the result with the intended public
   ingress before continuing.
6. Redeploy only `splice-app-sf`. Do not enable MCP on the VPS or SG replicas.
   Confirm the existing API and frontend remain healthy before MCP testing.
7. Verify public discovery and the unauthenticated boundary:

   ```bash
   curl -fsS https://splice-mcp.kw0.dev/healthz
   curl -fsS https://splice-mcp.kw0.dev/.well-known/oauth-protected-resource/mcp
   curl -i https://splice-mcp.kw0.dev/mcp
   ```

   Metadata must advertise the exact resource, issuer, and two scopes. The final
   request must return a sanitized `401` OAuth bearer challenge, not anonymous
   MCP access. The old `https://splice-api.kw0.dev/mcp` route must be absent.
8. Use MCP Inspector or another deterministic OAuth-capable client before
   ChatGPT. Log in with the allowed Google account, initialize, confirm exactly
   27 tools, read the guide/resource and one prompt, call a representative read,
   complete projection input-required/resume, and verify an App result plus its
   structured fallback. Use a controlled categorization sample to preview and
   execute both creation and application, checking preview-token rejection and
   resulting ownership/counts. Also verify a read-only grant cannot invoke a
   write. Keep the token inside the client, not a command line.
9. Inspect sanitized MCP events after the smoke. Logs may include only an
   opaque request ID, tool name, timing, outcome, and safe error code; they must
   not contain bearer tokens, subjects or other claims, arguments, structured
   results, internal errors, or financial values.
10. Connect ChatGPT only after the deterministic smoke passes. Verify OAuth
    login, visible scopes/annotations, one read, and one previewed write. Whether
    ChatGPT displays a confirmation is client behavior, not a server guarantee.

## Rollback

Redeploy the recorded known-good backend image/application revision and the
prior stack revision. Verify the existing frontend, API login, PAT-backed REST
automation, transaction flows, and scheduled work. Auth0 and DNS configuration
may remain unused; no database rollback or data transformation is required.

After rollback, confirm the public MCP hostname no longer reaches the failed
listener and record whether DNS should remain for a retry or be removed. Never
point `splice-mcp.kw0.dev` at the API-origin PAT service as a compatibility path.
