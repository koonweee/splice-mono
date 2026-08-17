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
Auth0 client secret. Production uses Client Identifier Metadata Document (CIMD)
registration for ChatGPT; Dynamic Client Registration (DCR) remains disabled.

### Production Auth0 and ChatGPT registration

The production Auth0 API/resource is configured with:

- identifier/audience `https://splice-mcp.kw0.dev/mcp`, RS256, and token dialect
  `rfc9068_profile_authz`;
- RBAC, permission inclusion, and offline access enabled;
- exact API permissions `splice:read` and `splice:write`, both allowed as the
  default third-party delegated permissions;
- client access denied by default; and
- an allowed-user role containing both permissions, assigned to the existing
  Google-linked Splice user.

The Auth0 tenant has Resource Parameter Compatibility, issuer-in-authorization-
responses, signing-algorithm JWKS, and CIMD enabled. Leave DCR disabled. Promote
the existing Google social connection to the domain level and save it; Auth0
warns that this makes the connection available to every third-party application
in the tenant. Do not broaden the Google connection beyond the basic profile
scopes Splice already uses. Auth0 discovery currently still publishes an
`oidc/register` registration endpoint when the dashboard DCR toggle is off; do
not infer from that metadata field that DCR is the selected or enabled ChatGPT
registration path.

For each ChatGPT developer-mode plugin instance:

1. In ChatGPT, use the canonical server URL, choose OAuth plus CIMD, select
   `splice:read` and `splice:write`, leave Base scopes empty, and keep OIDC
   enabled. Discovery should resolve the issuer, authorization endpoint, token
   endpoint, OpenID configuration, and user-info endpoint from
   `https://auth.kw0.dev/`.
2. Copy the instance-specific client metadata URL that ChatGPT uses as its
   `client_id`. In the first production instance it was
   `https://chatgpt.com/oauth/-Kx1UAuUs4T9/client.json`; a replacement plugin
   instance will have a different URL.
3. In Auth0 Applications, import that URL. Verify the preview before creating
   the third-party Regular Web Application: its external client ID must be the
   full metadata URL, the redirect URI must be the ChatGPT connector callback,
   the token endpoint authentication method must be `private_key_jwt`, and the
   signing key must come from ChatGPT's public JWKS. Preview warnings that
   `response_types` is not persisted and informational client metadata is
   ignored are expected.
4. Verify the imported application has both Splice API permissions and the
   domain-level Google connection. Then complete ChatGPT login and consent. The
   authorization request should include `openid`, `email`, `offline_access`,
   `splice:read`, and `splice:write`, PKCE S256, and the exact MCP resource.
5. Open the plugin in ChatGPT and select **Refresh**. Confirm that ChatGPT
   discovers exactly 27 tools before testing a prompt.
6. Change the Splice app/plugin permission mode so mutating actions are allowed
   or require an explicit prompt. The **Allow low-risk actions** mode is
   sufficient for reads and previews but may prevent ChatGPT from dispatching
   `create_categorization_rule` or `apply_categorization_rule` at all. Keep both
   OAuth scopes selected; the permission mode and `splice:write` scope are
   separate gates.

For developer-mode testing, start a new supported Work conversation and attach
Splice from the Tools/Plugins menu. Once attached, follow-up prompts in that
conversation can reuse it. During the 2026-08-16 rollout, ChatGPT's specialized
Finance conversation could see the installed app and its permission setting but
did not expose developer-MCP tool calls; searching for a plugin or inserting an
app mention did not substitute for attaching the MCP connection in a supported
conversation. Treat that as observed ChatGPT client behavior, not an MCP server
health signal.

### Diagnosing a ChatGPT write that never reaches Splice

Every accepted tool call emits a privacy-safe `tool.started` event before scope
enforcement or application logic. Use the opaque request ID and exact tool name
to correlate a failed attempt. If a read or preview has `tool.started` and
`tool.completed` events but the corresponding write has no `tool.started` event,
the write did not reach the registered Splice tool handler. Check the ChatGPT
conversation type, whether Splice is attached, the refreshed tool metadata, and
the app/plugin permission mode before investigating preview-token verification
or persistence. Transport authentication or input-schema rejection can also
occur before this event, so reproduce the exact payload with MCP Inspector or
the HTTP integration test when the client-side cause remains ambiguous.

During the categorization-rule smoke on 2026-08-16, the single production MCP
process logged seven successful `preview_categorization_rule_draft` calls and no
`create_categorization_rule` event of any kind. The live image contained the
registered create handler and the same process served preview and create, so
preview-token verification, domain creation, and response serialization were
not entered. The observed ChatGPT permission setting was **Allow low-risk
actions**, while the create tool is intentionally advertised as mutating and
non-idempotent. The corrective action is to permit or explicitly confirm
mutating actions in ChatGPT, refresh the plugin, and retry in a new supported
Chat or Work conversation. Do not weaken the server's risk annotation or add a
server-side approval bypass.

Logs must remain limited to request ID, tool name, timing, outcome, and safe
error code. Do not log OAuth subjects, arguments, preview tokens or token
payloads, draft contents, financial results, exception messages, or stacks.

### Personal plugin packaging experiment

The temporary local `splice@personal` package and its personal marketplace were
removed after testing. The package referenced the same underlying developer app
ID as the remote connection, so it did not provide an independent MCP backend.
While both registrations were present, the Codex app bridge forwarded
namespaced names such as `splice.get_user_context`, while the MCP server
correctly registered and advertised `get_user_context`; the server returned
`Unknown tool` before application logic.

Removing the local package alone did not refresh the active host catalog. After
removing both the local package and its personal marketplace, fully restarting
the desktop app, and retrying the remote plugin, `get_user_context` and
`list_categories` both dispatched successfully. The same restarted remote
plugin subsequently completed the production
`preview_categorization_rule_draft` -> `create_categorization_rule` ->
`list_categorization_rules` sequence: the preview matched the earlier result,
the write returned the created rule, and the follow-up list contained it. This
confirms that the earlier failure was host/plugin dispatch state rather than
Splice registration, OAuth scope enforcement, preview-token verification,
persistence, or response serialization.

Treat an `Unknown tool` error whose name is prefixed with `splice.` as stale or
duplicate plugin state first:

1. Remove or disable duplicate local/repository Splice packages and marketplace
   entries.
2. Keep the developer-mode remote connection enabled.
3. Fully restart the host application and test from a fresh task.
4. Confirm at least two remote read tools dispatch before testing writes.

Do not add `splice.*` aliases to the Splice server or change its canonical tool
names. If the namespaced error survives the cleanup and full restart, capture a
minimal sanitized reproduction and escalate it as a plugin-host dispatch issue.

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
- Four self-contained, cache-versioned `ui://splice/.../v2.html` MCP App
  resources for cash flow, projections, portfolio, and category-rule
  workbench views.

MCP Apps are progressive enhancement. Clients without App support still receive
usable structured and text results. Projection assumption collection is
non-persistent: capable clients use the SDK v2 input-required/resume flow;
clients without that capability receive an ordinary structured `inputRequired`
fallback and can ask the user for the same non-sensitive fields.

### MCP App widget origin and ChatGPT refresh

All four App resources advertise the same canonical widget origin,
`https://splice-mcp.kw0.dev`, in resource-content `_meta.ui.domain`. The value is
an HTTPS origin only: do not append `/mcp`, a path, query, or fragment. Each App
also advertises its empty external-resource CSP and border preference through
the standard `_meta.ui` object. ChatGPT compatibility aliases remain enabled
during the migration, but the standard fields are authoritative. App resource
reads require `splice:read`, just like the guide and data resources.

The browser runtime is progressive enhancement over the official
`@modelcontextprotocol/ext-apps` bridge. Every App starts in a neutral
`loading` state with no financial or identifying values. A `ready` state means
the host delivered the authenticated tool result for this invocation. An
`error` state means initialization, transport, cancellation, teardown, or a
read-only helper call failed; it must show `Unable to load live Splice data.`
and must not retain or substitute business data. Production HTML contains no
demo or fixture envelope. Deterministic sample data exists only in test-owned
host fixtures and reaches the production browser bundle through simulated
official host notifications.

The `v2` suffix is a client cache key, not an API version. Change it only when
the embedded browser resource changes incompatibly enough that hosts must stop
using cached HTML; keep each linked `show_*` descriptor and resource URI exact.

After deploying a metadata or resource change, open the existing ChatGPT
developer plugin and run **Refresh** or **Scan Tools** before rechecking its
templates. A cached
template descriptor can continue to show an old widget-domain warning or run an
older embedded resource even when the live server is correct. Confirm all four
templates show the shared widget origin, use the exact `v2` URIs, and retain
both JSON text and `structuredContent` fallbacks. Then start a fresh
conversation and attach Splice; an already-open conversation can retain old
tool descriptors. No new DNS record, Auth0 application, consent configuration,
plugin recreation, or Traefik route is required because the canonical MCP
origin is already public with valid TLS.

Domain verification in the OpenAI submission portal is a separate operator
workflow. Add a challenge response only if the portal supplies a token and
explicitly requests one; never invent or preconfigure a challenge value. The
challenge path does not belong in the MCP metadata and is not needed for normal
developer-mode use.

## Pinned server library

The backend pins public registry package `@koonweee/mcp-kit` exactly to `0.4.1`.
The registry artifact and public declarations were independently verified
against release commit `aac0673a25b361a8bd2468bd6451f3c2dd556d16`
and annotated tag `v0.4.1`. Its npm integrity is
`sha512-zMi4zQfAoBUVBfoa4Y1MZcdEDk3jqgMcxjNcx5L23PzCd8spC/gXdN4xR9C4h+AeN0GKEM/cmd25/vcWc2Nj2Q==`.
This release provides verified ESM and CommonJS consumption for all four public
server entrypoints, safe claim-free logging, ordinary CommonJS Jest authentication,
a typed client input-required capability signal, and typed safe error boundaries
for service-owned resource and prompt callbacks. It also provides first-class
typed MCP App resources and tool linkage, OpenAI-submission validation, optional
legacy ChatGPT aliases, and request-local `requiredScopes` enforcement before
static or dynamic App HTML is returned. The fifth `/apps` browser entrypoint
composes the official ext-apps `App` and `PostMessageTransport`, owns lifecycle,
host context, teardown, and safe state transitions, and exposes the official
typed model-context update used by Projection Scenario Modeler. Splice uses the
CommonJS branch for its NodeNext Nest server and bundles only `/apps` into the
self-contained browser resource.

The runtime depends exactly on `@modelcontextprotocol/ext-apps@1.7.5`, upstream
commit `92f46a574568a3ddac7600343b7d3c4c4ed7b588`, with registry integrity
`sha512-TjPH2S2y5UEGKhmI6+XGFuqfqOV4ppe1x6DA3txnUaEWkgtA4G5vo14jGKFZmegdkZ1H4QMLyujLvoU1BEdnAg==`.
Splice does not reimplement its bridge protocol and does not import ext-apps
directly in production source.
Splice consumes only these declared public entrypoints:

| Entrypoint | Splice use |
| --- | --- |
| `@koonweee/mcp-kit` | `defineTool`, `defineServer`, scope/risk policy, typed outputs, SDK v2 handler context and input-required result |
| `@koonweee/mcp-kit/node` | Stateless Node Streamable HTTP listener through `serveNode` |
| `@koonweee/mcp-kit/auth0` | Auth0 JWT verifier, bearer gate, principal conversion, and protected-resource discovery |
| `@koonweee/mcp-kit/test` | Deterministic in-memory/JWT test helpers without a live Auth0 tenant |
| `@koonweee/mcp-kit/apps` | Browser-only official ext-apps lifecycle, tool calls, host context, model-context updates, and teardown |

Recheck the pin and export map after installing dependencies:

```bash
cd backend
yarn why @koonweee/mcp-kit
node -e "const p=require('./node_modules/@koonweee/mcp-kit/package.json'); console.log(p.version, Object.keys(p.exports))"
```

Expected version: `0.4.1`. Expected export keys: `.`, `./node`, `./auth0`,
`./test`, and `./apps`. Do not replace the pin with a Git, file, or
sibling-checkout reference.

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

## Local MCP App standard-host validation

The standalone resource extractor is an artifact inspection tool, not an MCP
Apps host. It must render the neutral loading shell and contain no fixture
business data:

```bash
cd backend
yarn build:mcp-apps
yarn ts-node -r tsconfig-paths/register \
  test/mcp/fixtures/render-mcp-app-resource.ts \
  /tmp/splice-mcp-app-resources
rg -n "splice-mcp-app-fixture|fixture-account-|fixture-transaction-|2026-03-31|6,250|3,120|3,130" \
  /tmp/splice-mcp-app-resources
```

The final search must return no match. Do not treat directly opening those HTML
files as a successful host test: without an official parent bridge, the correct
terminal state is `Unable to load live Splice data.`

For a real local host, use the exact upstream ext-apps tag recorded below. From
a clean checkout, install and build the official package and `basic-host`:

```bash
git clone --branch v1.7.5 --depth 1 \
  https://github.com/modelcontextprotocol/ext-apps.git \
  /tmp/mcp-ext-apps
cd /tmp/mcp-ext-apps
npm ci --ignore-scripts --include=dev
node node_modules/bun/install.js
npm run build
cd examples/basic-host
npm install --ignore-scripts --include=dev
npm run build
```

The pinned upstream build invokes Bun from its npm dependency. Running the
installer explicitly after the script-free dependency install keeps this
fixture reproducible without installing a moving global Bun release.

Start the test-owned authenticated Splice runtime in one terminal. It uses the
real `SpliceMcpRuntimeService`, ephemeral signing material, deterministic mock
services, and a loopback CORS proxy that only injects the in-memory bearer
token; it does not parse or implement MCP:

```bash
cd backend
yarn ts-node -r tsconfig-paths/register \
  test/mcp/fixtures/serve-mcp-app-fixture.ts 3102
```

Start the tagged official host in a second terminal:

```bash
cd /tmp/mcp-ext-apps/examples/basic-host
SERVERS='["http://127.0.0.1:3102/mcp"]' npm run serve
```

Open `http://127.0.0.1:8080`, invoke all four `show_*` tools, and validate the
rendered Apps at desktop and mobile sizes. Check the loading-to-ready
transition, read-only helper controls, truthful helper-error behavior, theme
and safe-area response, browser console, and network log. Finance requests must
flow only through the host-mediated MCP connection to `127.0.0.1:3102`; the App
iframe must not call Splice REST endpoints directly. Always stop both fixture
processes and close every agent-browser session when finished.

## Production rollout and recreation

These steps intentionally separate repository automation from Auth0, DNS, and
live deployment mutations. Do not put a real bearer token in shell history,
fixtures, documentation, screenshots, or chat.

### 2026-08-17 standardized MCP Apps runtime rollout record

- Splice application commit:
  `0206798032a46f27abc5f70153e5406fcc233100`; protected deploy revision:
  `ea08ad9585792a354e8ad4acd0a36da4ffead1bc`; protected PR: `#246`.
- GitHub had a declared major outage affecting API, Actions, and pull requests
  during promotion. Deploy workflow attempts `32049151165`, `32049200167`, and
  `32049472867` failed before mutation on HTTP `503`. Run `32049693812` created
  the deploy PR and dispatched exact-head comparison CI `32049708220`, which
  passed on `0206798`, but its post-CI GraphQL lookup received another `503`.
  The same workflow's guarded merge command was then run against that exact
  validated head; PR #246 merged as `ea08ad9`. Synchronization run
  `32050656693` subsequently passed and confirmed `main` and `deploy` match.
- Registry dependency: `@koonweee/mcp-kit@0.4.1`, release commit
  `aac0673a25b361a8bd2468bd6451f3c2dd556d16`, npm integrity
  `sha512-zMi4zQfAoBUVBfoa4Y1MZcdEDk3jqgMcxjNcx5L23PzCd8spC/gXdN4xR9C4h+AeN0GKEM/cmd25/vcWc2Nj2Q==`.
  Its browser runtime directly composes exact
  `@modelcontextprotocol/ext-apps@1.7.5`; Splice does not implement the bridge
  protocol or ship a production fixture fallback.
- Komodo build update `6a8342d1d28c58b2ef3c01d0` published backend version
  `0.0.96` and commit tag `ea08ad9`. The production build used Node 24 Alpine
  and published manifest-list digest
  `sha256:73b72b8a57083bc3a67162dd08cad52cab06c03b72ef730aaada0da2356473f5`.
- Targeted deployment update `6a834475d28c58b2ef3c0227` completed
  successfully for `splice-app-sf`; no VPS or SG stack was redeployed. The
  declarative stack remained `605ec5a`. The SF backend is one healthy instance
  on the default and `external-web` networks with no host port publication;
  its deployed image ID is the same `sha256:73b72b8a...` digest.
- Local release gates passed: backend typecheck/lint/build, 8 focused MCP suites
  with 106 tests, 83 full backend suites with 874 tests, frontend
  typecheck/lint/build and 45 suites with 285 tests, deterministic browser
  bundle generation, Node `v24.19.0` production-image inspection, both SF
  Compose renders, and clean diff/fixture-leak scans. The final generated App
  bundle SHA-256 was
  `7bec14883623bcf860c571fd13247078eef889bf06b0ff16daad8fb11b4dc68a`.
- Tagged official ext-apps `basic-host` validation rendered all four Apps at
  desktop and mobile sizes. Cashflow displayed only host-delivered test values
  (`$4,100`, `-$1,750`, `$2,350`) rather than the removed production demo
  values; Portfolio, Projection, and Category Rules also reached ready state.
  Browser console/network checks found no App error and no direct REST request.
  An independent review/fix loop closed stale derived-data, late-helper,
  account-identity, primary-reload, and safe-area regressions, then reported no
  remaining major issue.
- Post-deploy public checks returned `200` for API health, frontend, and the
  canonical protected-resource document. Discovery advertised exactly the
  canonical resource, `https://auth.kw0.dev/`, `splice:read`, and
  `splice:write`; unauthenticated `/mcp` returned the sanitized `401` bearer
  challenge; the old API-origin `/mcp` returned `404`. Startup logs showed both
  listeners ready with no error.
- Authenticated production calls succeeded for `show_cashflow_explorer`,
  `show_projection_scenario_modeler`, `show_portfolio_viewer`, and
  `show_category_rule_workbench`. Each returned its exact
  `ui://splice/.../v2.html` URI, structured data, and JSON/text fallback.
  Sanitized production logs contain matching started/completed success events
  and no claims, arguments, results, or financial values.
- ChatGPT operator follow-up: open the existing developer plugin, run
  **Refresh** or **Scan Tools**, confirm the four `v2` templates, and attach
  Splice to a fresh supported conversation. No reconnect, plugin recreation,
  Auth0 mutation, DNS change, or ingress change is required. This host refresh
  is necessary because existing conversations may retain cached descriptors.

Immediate rollback inputs for this runtime rollout are protected deploy
revision `2a8d9350c701914f52580fe281a944d41e649ec8`, stack revision `605ec5a`,
and backend image
`sha256:c8633213a86eebd7d45309ba00df65fcacdc3a564691f697201c626442dde6ab`
(`@koonweee/mcp-kit@0.3.1`). No database, Auth0, DNS, or stack-schema change was
part of the rollout. Roll back only `splice-app-sf`, then Refresh/Scan Tools so
ChatGPT stops using the `v2` descriptors.

### 2026-08-17 MCP App widget-domain rollout record

- Splice application commit: `e6be8c3b8638524e56209a312d928f11876e0217`;
  protected deploy revision: `2a8d9350c701914f52580fe281a944d41e649ec8`;
  deploy workflow run: `32010686463`.
- The declarative stack remained unchanged at `605ec5a`: the existing
  `splice-mcp.kw0.dev` HTTPS router, TLS, port `3001`, and `external-web`
  attachment are sufficient because `_meta.ui.domain` reuses that canonical
  origin. Both the base and merged SF Compose configurations rendered cleanly.
- Komodo build update `6a82c6f9d28c58b2ef3be8d9` published backend
  version `0.0.95`; targeted `splice-app-sf` deployment update
  `6a82c876d28c58b2ef3be929` completed successfully.
- Deployed backend image digest:
  `sha256:c8633213a86eebd7d45309ba00df65fcacdc3a564691f697201c626442dde6ab`;
  installed mcp-kit: `0.3.1`. The SF backend was healthy as a single instance
  on the default and `external-web` networks with no host port publication.
- Public health and protected-resource discovery returned `200`; discovery
  advertised the canonical resource, `https://auth.kw0.dev/`, and exactly
  `splice:read` plus `splice:write`. Unauthenticated MCP returned the sanitized
  `401` bearer challenge, the old API-origin `/mcp` returned `404`, and the
  existing frontend returned `200`.
- Authenticated remote calls passed for `get_user_context` and all four
  `show_*` App tools. Each App result retained its JSON/text fallback and linked
  the expected `ui://splice/...` resource. Production startup logs showed the
  MCP and Nest listeners starting successfully without an error.
- ChatGPT's existing installed plugin continued to display the cached
  pre-deploy template descriptors until an explicit **Refresh**. After refresh,
  all four templates advertised `https://splice-mcp.kw0.dev` through both the
  standard `ui.domain` field and the enabled `openai/widgetDomain` compatibility
  alias; the “Widget domain is not set” warning count was zero and the browser
  console contained no error. This confirms the earlier warning was expected
  client caching, not a server or deployment failure.

Immediate rollback inputs for this metadata rollout are protected deploy
revision `219fbc9f2c80d704c718830f2ce4c74e32e45177`, stack revision `605ec5a`,
and backend image
`sha256:61ff8f214325bc5a68fc5bce5fcc8711935fd8726aad60605da4fd19c5ec7715`.
No database, Auth0, DNS, or stack-schema change was part of this rollout.

### 2026-08-16 rollout record

- Splice application commit: `487fbb68b617b744e237c9a91db311c0d74ab65d`;
  protected deploy revision: `219fbc9f2c80d704c718830f2ce4c74e32e45177`;
  deploy workflow run: `31984304428`.
- Stack commit: `a9d4b12`; targeted `splice-app-sf` deployment update:
  `6a8265b2d28c58b2ef3bd508`.
- Backend image digest:
  `sha256:61ff8f214325bc5a68fc5bce5fcc8711935fd8726aad60605da4fd19c5ec7715`;
  runtime Node version: `v24.19.0`; installed mcp-kit: `0.2.3`.
- DNS: `splice-mcp.kw0.dev` resolves to `192.184.248.77` as a DNS-only record.
- Public health, protected-resource discovery, and the sanitized unauthenticated
  `401` boundary passed. The existing frontend/API remained healthy and the old
  API-origin `/mcp` route returned `404`.
- ChatGPT CIMD/OIDC login passed. Sanitized production logs confirm successful
  `get_user_context` and `get_balance_history` calls without claims, arguments,
  results, or financial values.
- An initial ChatGPT categorization attempt completed its reads and seven draft
  previews but never dispatched the create call. After removing the duplicate
  local plugin package, restarting the host, and using the remote connection,
  the production preview -> create -> list sequence passed and the created rule
  was visible in the follow-up list.
- Still pending from the original port's broad live-validation matrix: a
  deterministic external OAuth client/Inspector pass and a controlled
  production `apply_categorization_rule` smoke. Local protocol/write-parity
  suites cover both write workflows; do not represent the application workflow
  as a live production result until that separate destructive smoke is run.

The steps below are the recreation and future-rollout procedure. Use the exact
recorded values above only to audit or roll back this deployment; obtain fresh
revisions, image digests, and ChatGPT client metadata for a later rollout.

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
4. Configure Auth0 exactly as described in **Production Auth0 and ChatGPT
   registration**: API identifier, RS256/RFC 9068 dialect, RBAC and permission
   inclusion, offline access, both delegated scopes, allowed-user role, tenant
   compatibility settings, CIMD enabled, DCR disabled, and the Google connection
   promoted to domain level. Import the current ChatGPT client metadata URL and
   verify its callback, `private_key_jwt` method, JWKS, permissions, and Google
   connection. Agent check: use the Auth0 configuration export or read-only API
   to compare non-secret settings; never print client credentials or tokens.
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
10. Connect ChatGPT only after the deterministic smoke passes. Refresh plugin
    metadata, confirm 27 tools, attach Splice to a new supported Work
    conversation, set its permission mode to allow or prompt for mutating
    actions rather than **Allow low-risk actions**, and verify OAuth login,
    visible scopes/annotations, one read, and one previewed write. A Finance or
    other specialized conversation that does not expose developer MCPs is not a
    valid server smoke environment. Whether ChatGPT displays a confirmation is
    client behavior, not a server guarantee. Confirm the write produced a
    `tool.started` event before diagnosing any downstream failure.

## Rollback

For the 2026-08-17 standardized Apps runtime rollout, the immediate known-good
rollback inputs are protected deploy revision
`2a8d9350c701914f52580fe281a944d41e649ec8`, stack `605ec5a`, and backend image
`sha256:c8633213a86eebd7d45309ba00df65fcacdc3a564691f697201c626442dde6ab`.
That image uses mcp-kit `0.3.1` and the prior App resources. Redeploy only
`splice-app-sf`; no database, Auth0, DNS, or topology rollback is required.
Afterward, Refresh/Scan Tools in ChatGPT so cached `v2` descriptors are not
reused.

For the 2026-08-17 App metadata rollout, the immediate known-good rollback
inputs are Splice protected deploy revision
`219fbc9f2c80d704c718830f2ce4c74e32e45177`, stack `605ec5a`, and backend image
`sha256:61ff8f214325bc5a68fc5bce5fcc8711935fd8726aad60605da4fd19c5ec7715`.
That image is the successful 2026-08-16 OAuth MCP deployment; rolling back to it
removes the submission-ready App widget metadata while preserving the OAuth
endpoint and all domain data.

For a full rollback behind the OAuth cutover, the older recorded inputs are
Splice `main` `5a35640`, Splice `deploy` `4e3ad53`, stack `0e19c2b` (deployed
stack source `758e75a`), and backend image
`sha256:d881a9bbd395c7919326b13667c3ce841e53a8e29a872763bd4159a8e0aa4151`.
Use that larger rollback only when intentionally reverting the OAuth MCP
cutover. For later rollouts, replace these values with newly recorded inputs
before deploying.

Redeploy the recorded known-good backend image/application revision and prior
stack revision. Verify the existing frontend, API login, PAT-backed REST
automation, transaction flows, and scheduled work. Auth0 and DNS configuration
may remain unused; no database rollback or data transformation is required.

After a full cutover rollback, confirm the public MCP hostname no longer reaches
the failed listener and record whether DNS should remain for a retry or be
removed. An App-metadata-only rollback keeps that hostname live. Never point
`splice-mcp.kw0.dev` at the API-origin PAT service as a compatibility path.
