# MCP Kit and Auth0 Port

## Status

Implementation complete and locally validated on 2026-08-16. Production Auth0,
DNS, stack sync/deploy, and external smoke testing remain explicit operator-gated
steps.

## Goal

Replace Splice's PAT-authenticated, SDK v1 MCP controller with a public, stateless Streamable HTTP MCP endpoint built on a pinned release of `@koonweee/mcp-kit`, the official MCP SDK v2, and Auth0.

The cutover must preserve the existing 27 tools, typed structured results, guide and report resources, workflow prompts, MCP Apps, and projection-assumption flow while changing the transport, authentication, authorization, and server-definition layer. The public resource will be `https://splice-mcp.kw0.dev/mcp`, with `splice:read` on every read tool and `splice:write` on both categorization writes. Client-native confirmation based on MCP annotations is the accepted safety boundary; Splice will not add a server-side approval queue.

Functional parity explicitly includes writes. This is not a read-only OAuth migration: both existing mutating workflows—preview-token-protected categorization rule creation and application—must remain callable through the new MCP endpoint with their current validation, ownership, impact-preview, and result behavior. Apart from intentional protocol/authentication changes called out in this plan, an MCP client must retain near-complete parity in what it can accomplish before and after the port.

This is a hard cutover. Do not retain the old `/mcp` Nest controller, PAT-based MCP configuration, a compatibility endpoint, or dual SDK implementations. Personal access tokens remain available for ordinary Splice API automation.

## Current Behavior

- `backend/src/mcp/mcp.controller.ts` mounts `/mcp` inside the Nest/Express API on port 3000, accepts only Splice personal access tokens, and creates an SDK v1 `McpServer` plus `StreamableHTTPServerTransport` for every POST.
- `backend/src/mcp/mcp.service.ts` owns all server registration in one large `createServer(userId)` closure: 27 tools, the `splice://mcp-guide` resource, five report/resource templates, five prompts, four MCP App resources, and four app-backed tools.
- The tool surface already returns `structuredContent`, advertises Zod `outputSchema` values, mirrors JSON into text content, and carries read/additive/destructive annotations. `create_categorization_rule` is the additive write; `apply_categorization_rule` is destructive and idempotent.
- `collect_projection_assumptions` uses the SDK v1-only `server.server.elicitInput()` escape hatch and a hand-built `inputRequired` fallback. This must be replaced with the official SDK v2 multi-round input API, not wrapped or retained.
- `backend/src/mcp/mcp-read.service.ts`, `backend/src/mcp/mcp-categorization.service.ts`, the existing domain services, money normalization, schemas, and self-contained MCP App assets contain reusable business behavior and should not be rewritten as a new HTTP client layer.
- `backend/src/app.module.ts` imports `McpModule`; `backend/src/main.ts` starts only the Nest listener. The backend image and engine currently target Node 22, while `mcp-kit` requires Node 24.
- `frontend/src/components/settings/McpConnectionSection.tsx` and the Settings `mcp` tab still tell users to connect to the API origin with a full-scope PAT. The separate Personal Access Tokens section is also used for general API automation and remains in scope.
- `backend/README.md`, `README.md`, and `docs/deployment.md` describe PAT-backed MCP behavior and must be made consistent with the new public OAuth resource.
- Splice users already have a unique nullable `googleSubject`. Auth0's configured Google social connection issues subjects in the `google-oauth2|<Google subject>` namespace, so Splice can resolve an authenticated MCP principal to the existing user without a second user table or an Auth0 client secret. Unsupported providers and unknown subjects must fail closed.
- The production stack is declared in the separate `/Users/jtkw/projects/stack` repository. The same backend image runs on `vps-sj`, `jtkwserver-sg`, and `jtkwserver-sf`; only the SF deployment should expose the MCP listener through the existing external Traefik pattern. The API and frontend currently continue to use their existing Cloudflare Tunnel routing.
- `@koonweee/mcp-kit@0.2.0` is published and registry-verified from commit/tag `0cfa5325476e8974026b8bb506a9d02f16128623`. It includes the typed `outputSchema` and tool `_meta` contract introduced in `v0.1.0` plus the official SDK v2 invocation-context/`InputRequiredResult` pass-through implemented in commit `6dcc45caa468d864e3f6d6c3ee9eddee124fb481`. Branch CI, the OIDC release workflow, independent registry metadata/integrity/install checks, and imports from all four public subpaths passed. This satisfies the known publication prerequisite; Splice must still independently inspect and compile against the installed package before porting.

## Target Data Shape

No Splice database migration or public REST API shape changes are required. Auth0 identity is mapped onto the existing Google identity.

The service-local MCP contract should have this shape, adjusted only for the exact names exported by the verified `mcp-kit` release:

```ts
type SpliceMcpDependencies = {
  userId: string;
  userService: UserService;
  accountsSurfaceService: AccountsSurfaceService;
  balanceHistorySurfaceService: BalanceHistorySurfaceService;
  transactionsSurfaceService: TransactionsSurfaceService;
  mcpReadService: McpReadService;
  mcpCategorizationService: McpCategorizationService;
  transactionAnalysisService: TransactionAnalysisService;
};

type SpliceMcpRuntimeConfig = {
  enabled: boolean;
  port: number;
  issuer: URL; // https://auth.kw0.dev/
  resourceServerUrl: URL; // https://splice-mcp.kw0.dev/mcp
  allowedHostnames: readonly string[];
  allowedOriginHostnames: readonly string[];
};
```

Every first-class tool definition must declare one authorization scope and one risk class:

| Tool class                                                     | Required scope | `mcp-kit` risk                              | Resulting client hints                               |
| -------------------------------------------------------------- | -------------- | ------------------------------------------- | ---------------------------------------------------- |
| Existing reads, previews, `show_*`, and projection assumptions | `splice:read`  | `{ kind: 'read' }`                          | read-only, non-destructive, idempotent, closed-world |
| `create_categorization_rule`                                   | `splice:write` | `{ kind: 'mutating' }`                      | write, non-destructive, non-idempotent, closed-world |
| `apply_categorization_rule`                                    | `splice:write` | `{ kind: 'destructive', idempotent: true }` | write, destructive, idempotent, closed-world         |

Annotations are presentation hints, not an authorization mechanism or a guaranteed confirmation. Scope enforcement in `mcp-kit` and Splice's existing preview-token/domain checks remain authoritative.

Runtime configuration belongs in environment variables and contains identifiers/configuration, not an Auth0 client secret:

- `MCP_ENABLED`
- `MCP_PORT` (default 3001 when enabled)
- `MCP_SERVER_URL`
- `AUTH0_ISSUER`
- `MCP_ALLOWED_HOSTNAMES`
- `MCP_ALLOWED_ORIGIN_HOSTNAMES`

## `mcp-kit` ownership rule

Splice must not implement a local workaround for a missing or inadequate `mcp-kit` capability when that capability is generalizable to other MCP servers and belongs within `mcp-kit`'s documented boundaries. This rule applies throughout every milestone, not only during the initial dependency preflight.

When implementation discovers such a gap:

1. Pause the Splice port at the affected seam and document the minimal reusable contract that is missing.
2. Confirm the capability belongs in `mcp-kit` rather than Splice. Transport lifecycle, official SDK pass-through, typed protocol results/metadata, authentication/resource discovery, shared scope/risk policy, safe logging boundaries, and reusable test harness behavior are presumptively `mcp-kit` concerns. Splice financial-domain tools, Auth0-subject-to-Splice-user resolution, categorization preview-token rules, and Splice deployment topology remain Splice concerns.
3. Implement the capability in `/Users/jtkw/projects/mcp-kit` with its required tests, documentation, agent guidance, release checks, and backward-compatibility review.
4. Publish a new verified `@koonweee/mcp-kit` release and confirm the expected package/types can be installed from the registry.
5. Update Splice to the new exact published version, rerun the contract preflight, and only then resume the port.

Do not use `patch-package`, a Git/file dependency, copied kit internals, unsafe casts, private SDK properties, a Splice-only transport/auth/policy wrapper, or parallel legacy behavior to bypass this loop. Direct official SDK v2 usage remains appropriate only at the deliberate public extension seams exposed by `mcp-kit`, such as registering service-owned resources and prompts.

## Milestones

### 1. Verify and pin the `mcp-kit` implementation contract

Implementation tasks:

- Install and inspect the published `@koonweee/mcp-kit@0.2.0` package, its release notes, generated declarations, and the source documentation in `/Users/jtkw/projects/mcp-kit`. Reconfirm that the registry artifact matches commit/tag `0cfa5325476e8974026b8bb506a9d02f16128623`; do not substitute main, a sibling checkout, or an unpinned dependency.
- Require a release that exposes all of the following through supported public entrypoints:
  - `defineTool` and `defineServer` with request-local dependency injection;
  - `outputSchema` inference/runtime validation and tool `_meta` forwarding;
  - `splice:read`/`splice:write` enforcement through `requiredScopes`;
  - `read`, `mutating`, and `destructive` risk-to-annotation mapping with idempotency override;
  - the official SDK v2 `ServerContext` as the tool handler's third argument;
  - typed `InputRequiredResult` support without a legacy elicitation wrapper;
  - `extend(server, context)` for official resources and prompts;
  - the Node Streamable HTTP adapter, Auth0 verifier/bearer gate/protected-resource metadata, and deterministic authenticated test helpers.
- Pin `@koonweee/mcp-kit` to exactly `0.2.0` in `backend/package.json` and update `backend/yarn.lock`. Add direct official SDK v2 packages only for APIs Splice imports itself (for example resource templates or protocol-level client tests); do not depend on transitive packages or keep `@modelcontextprotocol/sdk` v1. If the ownership rule later requires another kit release, update this exact pin only after that replacement is published and registry-verified.
- Add a small compile-time contract test or fixture that exercises a typed output tool, tool `_meta`, a third-argument SDK context, and an input-required result. This makes future `mcp-kit` drift fail during typecheck.
- Record the pinned version and the verified public entrypoints in the canonical Splice MCP documentation. Do not copy `mcp-kit` internals or document an unpublished API.
- Treat the feature list as a starting preflight, not an exhaustive exception list. If later milestones reveal another reusable kit-level gap, invoke the `mcp-kit` ownership rule, publish the fix, and update the pinned release before continuing.

Exit criteria:

- `yarn install --frozen-lockfile`, `yarn typecheck`, and the contract fixture succeed on Node 24 using registry packages only.
- The lockfile contains no SDK v1 package and no Git/file reference to a local `mcp-kit` checkout.
- If the published package lacks any required contract above, this milestone blocks the port; fix and release `mcp-kit` first rather than adding a Splice-only compatibility abstraction.

### 2. Upgrade the backend runtime and add explicit MCP configuration

Implementation tasks:

- Raise the backend engine and development types in `backend/package.json` to Node 24 and update both stages of `backend/Dockerfile` plus `backend/Dockerfile.dev`. Update root/backend setup documentation that still names Node 22.
- Add a focused environment parser for the MCP listener rather than reading scattered `process.env` values throughout definitions. Validate booleans, port range, HTTPS issuer/resource URLs in production, the exact `/mcp` resource path, hostname lists, and custom-domain issuer consistency at startup.
- Make MCP opt-in with `MCP_ENABLED`; local API development must continue to work without Auth0 variables when it is false. When enabled, incomplete or inconsistent config must fail startup before either listener is reported healthy.
- Update `backend/.env.example` and the local production/development compose files with every new variable. Do not add an Auth0 client ID/secret to the resource server: access-token verification uses issuer metadata/JWKS and the exact audience.
- Keep API port 3000 and reserve port 3001 for the standalone MCP listener. Expose both ports in the backend image without publishing 3001 to a host interface in the base compose file.

Exit criteria:

- Node 24 builds the backend production image and runs the existing Nest API unchanged when MCP is disabled.
- Configuration tests cover disabled mode, valid config, malformed lists/ports/URLs, insecure production URLs, issuer normalization, and missing required values.
- Enabling MCP with invalid configuration terminates startup cleanly and does not leave the Nest listener running.

### 3. Port the server definition without changing Splice behavior

Implementation tasks:

- Replace the monolithic `SpliceMcpService.createServer(userId)` ownership with small service-owned files under `backend/src/mcp/`, for example:
  - `mcp.definition.ts` for the portable `defineServer` definition and 27 first-class `defineTool` entries;
  - `mcp.extensions.ts` for the guide, data resources/templates, prompts, and MCP App resource registration through `extend`;
  - `mcp.runtime.ts` for Auth0/Node wiring and lifecycle;
  - the existing `mcp-schemas.ts`, `mcp-money.ts`, `mcp-apps.ts`, app assets, read service, and categorization service for their current focused responsibilities.
- Inject the current Nest business services as `SpliceMcpDependencies`; do not proxy back through Splice's REST API and do not move service-specific implementations into `mcp-kit`.
- Before changing registrations, capture an executable baseline manifest from the current server covering every tool name, input/output contract, annotations, resources, prompts, App metadata, and representative success/error behavior. Use it as the functional parity oracle for the new definition.
- Port all 27 tool names, titles, descriptions, input schemas, output schemas, structured/text results, and current error semantics. Preserve money normalization and the categorization preview-token protections. No current write may be omitted, downgraded to a preview/read, or deferred as follow-up work.
- Assign `splice:read` and `{ kind: 'read' }` to all 25 non-mutating tools. Assign `splice:write`/`mutating` to `create_categorization_rule` and `splice:write`/destructive/idempotent to `apply_categorization_rule`.
- Pass the existing MCP Apps tool `_meta` through the first-class kit definition. Keep all `show_*` app tools and bridge calls read-only.
- Register `splice://mcp-guide`, the five existing templates/resources, the five prompts, and four self-contained MCP App HTML resources through the official SDK v2 `extend` seam. Apply an explicit `splice:read` check inside every data-bearing resource callback because tool policy does not automatically cover low-level extensions. Static guide/app HTML and prompts must remain free of user financial data and secrets.
- Replace PAT/full-scope language inside `MCP_GUIDE` with the two-scope OAuth model and a precise explanation that annotations may prompt compatible clients but do not guarantee confirmation.
- Delete `backend/src/mcp/mcp.controller.ts`, remove it from `mcp.module.ts`, and remove all SDK v1 transport construction. Do not retain a hidden `/mcp` handler on the API origin.

Exit criteria:

- Protocol tests list the exact same 27 tool names, five prompts, guide/report resources, and four MCP App resources as before the port.
- Functional parity tests prove that both current write workflows can still preview and execute their real mutation, return the same domain result, reject stale/mismatched preview tokens, and affect only the authenticated Splice user.
- Every listed tool advertises the expected output schema, risk annotations, and app `_meta`; successful structured output passes SDK validation.
- Existing read, categorization, money, resource, prompt, and app behavior tests pass after being moved to the new definition/test harness.
- Searching production source finds no import from `@modelcontextprotocol/sdk`, `StreamableHTTPServerTransport`, `elicitInput`, MCP PAT-only decorator, or Nest MCP controller.

### 4. Replace legacy elicitation with SDK v2 multi-round input

Implementation tasks:

- Reimplement `collect_projection_assumptions` against the verified `mcp-kit` handler contract and the official SDK v2 `ServerContext` third argument.
- Return the SDK's typed `InputRequiredResult` with the current non-sensitive form fields when input is needed, then use the SDK's schema-aware `acceptedContent(..., schema)` path on the resumed call. Preserve validation for `horizonDate`, optional fields, non-persistence, and the rule against requesting credentials or payment details.
- Keep a useful ordinary structured result for clients that cannot complete the multi-round flow, following the official v2 capability/result contract. Do not capability-probe a private server property and do not recreate `elicitInput` behind a local helper.
- Update prompt and guide text to describe input-required/resume behavior accurately.

Exit criteria:

- Tests cover the initial input-required result, accepted/resumed input, cancellation or unsupported-client behavior defined by SDK v2, invalid accepted data, and absence of persistence.
- The flow compiles solely against public `mcp-kit`/SDK v2 types and contains no cast to private SDK server internals.

### 5. Add Auth0 identity, authorization, and the standalone listener

Implementation tasks:

- Build one reusable Auth0 verifier from `AUTH0_ISSUER=https://auth.kw0.dev/` and `MCP_SERVER_URL=https://splice-mcp.kw0.dev/mcp`, and wire `createAuth0BearerGate`, `principalFromAuthInfo`, path-aware protected-resource discovery, and the Node adapter according to the pinned `mcp-kit` release.
- Publish RFC 9728 metadata at `/.well-known/oauth-protected-resource/mcp` with the exact MCP URL, Auth0 issuer, resource name, and both supported scopes. Include its URL in bearer challenges.
- Map the validated Auth0 principal subject by accepting only `google-oauth2|<non-empty subject>`, stripping that exact namespace, and resolving it through `UserService.findByGoogleSubject`. Unknown, malformed, or unsupported-provider subjects must fail closed before any Splice domain service runs. Never map by an unverified email claim or create/link a Splice user from an MCP request.
- Start the MCP listener on port 3001 from `backend/src/main.ts` only after Nest dependency injection is ready. Treat Nest and MCP as one process lifecycle: startup is atomic, SIGTERM/SIGINT close both listeners, and a startup failure closes anything already opened.
- Bind the MCP listener to the container interface only when explicitly enabled, with exact configured host/origin allowlists and the adapter's bounded JSON body handling. Keep request logs to allowlisted request IDs, subject, tool name, timing, and outcome; never log bearer tokens, claims, arguments, structured results, or financial data.
- Keep the existing Nest API guards and PAT support for non-MCP routes unchanged.

Exit criteria:

- Authenticated HTTP integration tests prove: missing/malformed/expired/wrong-issuer/wrong-audience tokens return a sanitized 401 challenge; valid tokens initialize and list tools; missing read/write scopes are denied before their domain mocks run; and valid scopes reach only the resolved user.
- Identity tests cover a matching Google subject, unknown subject, empty suffix, and non-Google Auth0 connection. No request can select a user ID supplied by the client.
- Discovery, health, Host/Origin guards, content type, maximum body size, unsupported methods, and graceful shutdown are covered through the real Node handler.
- Logs and public errors are asserted not to contain tokens, arguments, results, internal exception messages, or financial values.

### 6. Remove obsolete client guidance and establish one MCP runbook

Implementation tasks:

- Delete `frontend/src/components/settings/McpConnectionSection.tsx` and its component test; remove the MCP tab, import, and mocks from `frontend/src/routes/_authed/settings.tsx` and its tests.
- Retain `PersonalAccessTokenSection` and its Access tab for general REST API automation. Adjust only copy that claims PATs are the MCP connection mechanism.
- Create a concise canonical Splice MCP document, such as `docs/mcp.md`, covering the public endpoint, OAuth/Auth0 model, two scopes, tool safety annotations, supported capabilities, local test commands, and first-deployment smoke test. Give each operator instruction an adjacent agent-equivalent command/check where it is safe and scriptable.
- Shorten `backend/README.md` to link to the canonical MCP document while keeping service-specific capability orientation near the code. Update `README.md` and `docs/deployment.md` so no active instructions tell users to use a PAT with MCP.
- Preserve the existing self-contained MCP App fixture instructions and explicitly identify Apps as progressive enhancement; a host without MCP Apps must still receive usable structured/text results.

Exit criteria:

- Repository search finds no live UI or documentation that presents `/mcp` on the API origin or a `splice_pat_...` value as MCP configuration.
- Settings still creates/lists/revokes PATs under Access, but has no obsolete MCP tab.
- The canonical runbook contains both human and agent-ready verification steps without duplicating Auth0 or stack source-of-truth procedures.

### 7. Declare Auth0 and production ingress in their owning systems

Implementation tasks:

- In Auth0, configure one API/resource whose identifier is exactly `https://splice-mcp.kw0.dev/mcp`, signing algorithm is RS256, token dialect follows the current Auth0 MCP recommendation, and permissions/scopes are `splice:read` and `splice:write`. Grant the allowed Google user the required permissions. Keep the existing tenant-wide Google social connection shared; do not create another Google OAuth credential for Splice MCP.
- Reconfirm the current ChatGPT/Auth0 client registration path at rollout time (CIMD when supported; DCR only if the selected client requires it), and verify the tenant's Resource Parameter Compatibility Profile and issuer-in-authorization-response settings. These are Auth0 operator steps, not code or secrets in Splice.
- In `/Users/jtkw/projects/stack/control-plane/komodo/stacks/splice-app/`, add an SF-only Compose override that attaches `splice-backend` to `external-web` and gives external Traefik an HTTPS `splice-mcp.kw0.dev` router targeting container port 3001. Keep the base Compose file usable by the VPS and SG replicas and do not publish port 3001 on a host interface.
- In `/Users/jtkw/projects/stack/control-plane/komodo/resources/apps/splice/stacks.toml`, enable/configure MCP only for `splice-app-sf`, include the SF override in that stack's `file_paths`, and leave MCP disabled on the other replicas. Add only non-secret Auth0/resource/allowlist values unless implementation discovers a genuine secret requirement.
- Update the colocated Splice resource documentation in `/Users/jtkw/projects/stack/control-plane/komodo/resources/apps/README.md` with hostname, target host, OAuth assumptions, ResourceSync ordering, and redeploy requirements. Apply any bootstrap/documentation changes required by that repository's own `AGENTS.md`.
- Create the public DNS record for `splice-mcp.kw0.dev` pointing at the SF public ingress and verify TCP 80/443, certificate issuance, and external Traefik routing. Keep databases, the API admin surface, and Komodo internals off this route.

Exit criteria:

- `docker compose` renders the base Splice stack on all three targets and the external override only for SF; the routed service is on `external-web`, has `traefik.scope=external`, and targets port 3001.
- Auth0-issued access tokens contain the exact custom-domain issuer, MCP audience, subject, expiry, and expected space-delimited scopes accepted by `mcp-kit`.
- Public discovery and unauthenticated challenge checks succeed through `https://splice-mcp.kw0.dev`, while the old `https://splice-api.kw0.dev/mcp` endpoint is absent.

### 8. Roll out, smoke test, and retain a simple rollback

Implementation tasks:

- Land the Splice code first, build the Node 24 backend image, then land/sync the stack repository changes. Run any Auth0 and DNS manual steps at the end, immediately before external smoke testing.
- Refresh the `splice` Komodo ResourceSync, deploy only the changed `splice-app-sf` stack, and confirm the API and frontend remain healthy before connecting an MCP client.
- Through MCP Inspector or another deterministic OAuth-capable client, verify discovery/login, initialization, tools/list, one representative read, categorization preview/create, destructive application with client-native confirmation, a prompt, a data resource, an MCP App fallback, and projection input-required/resume.
- Connect ChatGPT only after the deterministic smoke passes. Verify login with the whitelisted Google account, the visible tool scopes/annotations, a read, and a write whose impact was previewed. Treat whether ChatGPT chooses to surface confirmation as client behavior, not a server assertion.
- Inspect logs after the smoke for sanitized request/tool events and no token, payload, or result leakage.
- Roll back by redeploying the previously known-good Splice backend image/commit and the prior stack revision, which restores the PAT-backed endpoint. Auth0 API/client and DNS configuration may remain unused; no database rollback is required.

Exit criteria:

- All deterministic and ChatGPT smoke cases work at the canonical endpoint with OAuth and the expected user data.
- Existing Splice API login, PAT-backed REST automation, transaction flows, and scheduled/background behavior show no regression.
- The deployed endpoint has no PAT compatibility route and no server-side approval service or persistent MCP gateway state.
- The previous image and stack revision are recorded and can restore service without data transformation.

## Tests

### Backend

- Port `backend/test/mcp/mcp.service.spec.ts` to the `mcp-kit` in-memory harness and official SDK v2 client types while preserving exact inventory, schemas, annotations, resources, templates, prompts, Apps metadata, output validation, and business-result assertions.
- Keep focused tests for `mcp-read.service`, `mcp-categorization.service`, money conversion, app runtime/assets, and the rendered app fixture; change them only where imports or the definition boundary moves.
- Add compile-time contract coverage for typed outputs, tool `_meta`, SDK `ServerContext`, and `InputRequiredResult`.
- Add runtime/config tests for disabled/enabled startup, Node listener lifecycle, atomic failure, graceful shutdown, host/origin/body guards, health, and discovery.
- Add authenticated HTTP tests with `createTestJwtAuthority`: valid token, missing token, malformed token, expiry, wrong issuer, wrong audience, exact resource, missing read scope, missing write scope, and no domain invocation on denial.
- Add identity isolation tests for valid Google subject mapping, unknown subject, malformed/unsupported Auth0 subject, and attempts to place another user ID in tool input.
- Assert `create_categorization_rule` remains non-idempotent/non-destructive, `apply_categorization_rule` remains destructive/idempotent, and both retain preview-token protections independent of client confirmation.
- Add before/after parity assertions for the two write workflows, including successful persistence, ownership isolation, validation failures, stale/mismatched preview tokens, manual-category protections, and application counts/results. Mock-only tests of registration metadata are insufficient evidence for write parity.
- Test resource-level `splice:read` checks separately from first-class tool scope checks.
- Test SDK v2 projection input-required, accepted/resumed, cancelled/unsupported, invalid, and non-persistent paths.
- Run the backend test suite with `--runInBand` if open listener handles make Jest shutdown nondeterministic; fix leaked handles rather than using force-exit.

### Frontend

- Delete the MCP connection component tests with the removed component.
- Update Settings route tests to assert the MCP tab is gone and Access/PAT management remains present and functional.
- Run the full frontend suite, lint, typecheck, and build. This port should not change generated REST API clients.

### Manual and browser

- Render all four MCP App fixtures and use `agent-browser` to inspect desktop and mobile layouts, bridge-backed read interactions, structured fallbacks, and console errors. Terminate the browser session afterward.
- Perform OAuth/protocol smoke tests against the real hostname only after automated local-JWT tests pass. Never paste a real bearer token into chat, fixtures, docs, or shell history.
- Verify the Settings page in a real browser after removing the MCP tab, including narrow layout and the retained PAT Access tab.

## Validation Commands

Backend:

```bash
cd backend && yarn install --frozen-lockfile
cd backend && yarn typecheck
cd backend && yarn lint
cd backend && yarn test --runInBand
cd backend && yarn build
cd backend && docker build -t splice-backend:mcp-port .
```

Frontend:

```bash
cd frontend && yarn install --frozen-lockfile
cd frontend && yarn typecheck
cd frontend && yarn lint
cd frontend && yarn test
cd frontend && yarn build
```

Focused MCP checks (final paths may follow the implementation split):

```bash
cd backend && yarn test --runInBand test/mcp
cd backend && npx ts-node -r tsconfig-paths/register test/mcp/fixtures/render-mcp-app-resource.ts
rg -n "@modelcontextprotocol/sdk|StreamableHTTPServerTransport|elicitInput|splice_pat_|PersonalAccessTokenOnly" backend/src backend/README.md README.md docs frontend/src
```

Stack repository checks:

```bash
cd /Users/jtkw/projects/stack/control-plane/komodo/stacks/splice-app && docker compose config
cd /Users/jtkw/projects/stack/control-plane/komodo/stacks/splice-app && docker compose -f docker-compose.yml -f docker-compose.external.yml config
```

Public smoke checks:

```bash
curl -fsS https://splice-mcp.kw0.dev/.well-known/oauth-protected-resource/mcp
curl -i https://splice-mcp.kw0.dev/mcp
```

The second command must return an OAuth bearer challenge, not a successful anonymous response. Use the MCP Inspector or another OAuth-capable client for authenticated initialization and calls rather than putting a real token in the command line.

## Overall Exit Criteria

- `https://splice-mcp.kw0.dev/mcp` is a stateless, Auth0-protected SDK v2 Streamable HTTP endpoint implemented with a pinned public `@koonweee/mcp-kit` release on Node 24.
- All 27 existing tools, resources/templates, prompts, MCP Apps, structured outputs, and projection workflow remain usable; legacy `elicitInput` is replaced by the official v2 input-required flow.
- Functional parity includes both real write operations: `create_categorization_rule` and `apply_categorization_rule` still execute with their existing preview-token, validation, ownership, and result semantics. Every read uses `splice:read`; both writes use `splice:write`; create is mutating, apply is destructive/idempotent, and no server-side approval database or blocking workflow is introduced.
- No generalizable `mcp-kit` shortcoming is hidden behind Splice-local compatibility code. Every discovered kit-level gap is fixed, tested, documented, published, registry-verified, and consumed through a newly pinned release before Splice implementation continues.
- Auth0 subject mapping resolves only the existing Google-linked Splice user and fails closed for unknown identities. Tokens, claims, financial inputs/results, and internal failures are absent from logs and public errors.
- The API-origin PAT MCP endpoint and obsolete frontend configuration are removed, while PAT-backed ordinary REST API access remains supported.
- Backend/frontend tests, builds, Node 24 image build, Compose renders, local authenticated protocol tests, MCP App browser checks, public OAuth discovery, deterministic client smoke, and ChatGPT smoke all pass.
- Deployment and Auth0 changes live in their owning systems/repositories, with a recorded previous image/stack revision providing the rollback path.
