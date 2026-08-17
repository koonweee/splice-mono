# MCP App Host Data Integrity And Standard Runtime

## Status

Done

## Goal

Replace Splice's hand-written MCP Apps bridge and production fixture fallback
with a standards-based, reusable runtime built on the official
`@modelcontextprotocol/ext-apps` SDK. The shared behavior must be implemented
and released from `@koonweee/mcp-kit` first, then consumed from an exact public
registry pin in Splice.

After rollout, all four Splice MCP Apps must start in a neutral loading state,
render only authenticated MCP tool results, and show a truthful error state if
the host bridge is unavailable. Production App resources must never embed or
display fixture financial data. Deterministic fixture data remains available
only through test-owned host fixtures.

This plan includes installing the official MCP Apps agent skills, orchestrating
the separate mcp-kit implementation/release task, adopting the release in
Splice, validating the production image, deploying only `splice-app-sf`, and
recording exact rollout and rollback evidence.

## Completion Record

Completed on 2026-08-17. Splice pins registry-verified
`@koonweee/mcp-kit@0.4.1`, whose `/apps` entrypoint composes official
`@modelcontextprotocol/ext-apps@1.7.5`. The production browser bundle has no
fixture/default-data path, all four resources use versioned `v2` URIs, and
loading, authenticated result, helper, error, teardown, safe-area, and stale
business-data boundaries are covered by focused regressions.

Local validation passed backend typecheck/lint/build, 106 focused MCP tests,
874 full backend tests, frontend typecheck/lint/build and 285 tests, a Node 24
production image, both SF Compose renders, and the tagged official ext-apps
basic-host at desktop and mobile sizes. An independent review/fix loop found
and closed stale cache, late-helper, account-identity, primary-reload, and
safe-area issues; the final review found no major issue.

Application commit `0206798032a46f27abc5f70153e5406fcc233100` was validated by
deploy-comparison CI run `32049708220` and merged through protected PR #246 as
deploy revision `ea08ad9585792a354e8ad4acd0a36da4ffead1bc`. Komodo build
update `6a8342d1d28c58b2ef3c01d0` published backend `0.0.96` with image digest
`sha256:73b72b8a57083bc3a67162dd08cad52cab06c03b72ef730aaada0da2356473f5`.
Targeted deployment update `6a834475d28c58b2ef3c0227` redeployed only
`splice-app-sf`; the stack source remained `605ec5a`. Both SF app containers
became healthy, public API/frontend/discovery and the sanitized OAuth boundary
passed, the old API-origin MCP route remained absent, and authenticated
production calls to all four `show_*` tools returned the exact `v2` resource
URIs with structured and text fallbacks. The only ChatGPT-side follow-up is
Refresh/Scan Tools and a fresh attached conversation; Auth0, DNS, plugin
registration, and ingress do not change.

## Pre-Implementation Behavior

- `backend/src/mcp/apps/app-runtime.ts` implements the MCP Apps JSON-RPC bridge
  manually with `window.parent.postMessage`. It initializes its render envelope
  from fixture data and switches to real data only after receiving
  `ui/notifications/tool-result`.
- The same runtime starts a 350 ms timer. If it has not observed the bridge by
  then, it renders the fixture and displays `Rendering local fixture. MCP Apps
  host bridge was not detected.` The bridge request itself has a separate
  15-second timeout, so the warning and fixture can appear before initialization
  has conclusively failed.
- `backend/src/mcp/apps/app-shell.ts` imports `MCP_APP_FIXTURES` from production
  source and embeds one fixture envelope in every returned HTML resource under
  `#splice-mcp-app-fixture`.
- `backend/src/mcp/apps/app-fixtures.ts` contains realistic sample accounts,
  transactions, holdings, categorization rules, and cash-flow figures. The
  values seen in ChatGPT mobile, including `$6,250`, `-$3,120`, and `$3,130`,
  came from this file rather than the authenticated user's tool result.
- `backend/src/mcp/mcp-apps.ts` defines the four App resources, their shared
  `https://splice-mcp.kw0.dev` widget origin, `splice:read` resource policy,
  restrictive CSP, text/structured fallbacks, and current unversioned
  `ui://splice/*.html` resource URIs.
- `backend/test/mcp/mcp.service.spec.ts` currently requires production resource
  HTML to contain `splice-mcp-app-fixture`; that assertion must be inverted.
  `backend/test/mcp/fixtures/render-mcp-app-resource.ts` writes the production
  HTML directly to disk and relies on its embedded fixture instead of acting as
  an MCP Apps host.
- Splice pins public `@koonweee/mcp-kit@0.3.1`. That release owns typed App
  resource registration, metadata validation, compatibility aliases, and
  resource scope enforcement. It does not own the browser-side App lifecycle.
- The official `modelcontextprotocol/ext-apps` repository ships the
  `create-mcp-app` and `add-app-to-server` agent skills. Splice is an existing
  server, so `add-app-to-server` is the primary workflow; `create-mcp-app` is a
  useful lifecycle and reference-app companion.
- The official client contract uses `App` plus `PostMessageTransport`, with all
  lifecycle handlers registered before `app.connect()`. The official
  `basic-host` is the local integration oracle; ChatGPT web and mobile remain
  required host-specific smoke targets.
- The mcp-kit checkout at `/Users/jtkw/projects/mcp-kit` is clean but its local
  `main` was two commits behind `origin/main` when this plan was written. It
  must be synchronized before starting the package task. Its public registry
  release, not a sibling checkout, is the only allowed Splice dependency.
- Production uses the protected Splice `main` -> `deploy` workflow. The Komodo
  `splice-backend` build watches `deploy`; only `splice-app-sf` enables and
  serves the standalone MCP listener through the existing external Traefik
  route.
- The working tree contains unrelated untracked `logs/`, `tmp/backups/`, and
  `tmp/recordings/`. Preserve them throughout implementation.

## Target Data Shape

No REST API, database, OAuth claim, MCP tool input/output, or business-domain
shape changes are required. The existing 27-tool inventory, two scopes,
resource authorization, and text/`structuredContent` fallbacks remain intact.

The browser-side App lifecycle becomes conceptually:

```ts
type McpAppViewState<T> =
  | { status: 'loading'; data?: never; error?: never }
  | { status: 'ready'; data: T; error?: never }
  | { status: 'error'; data?: never; error: string };
```

Production must not have a `fixture` state or silently turn an error into
business data. Fixtures are injected by a test host as ordinary simulated tool
results.

Publish versioned replacement resource URIs so ChatGPT does not reuse cached
HTML from the broken implementation:

```text
ui://splice/cashflow-explorer/v2.html
ui://splice/projection-scenario-modeler/v2.html
ui://splice/portfolio-viewer/v2.html
ui://splice/category-rule-workbench/v2.html
```

## Fixed Decisions And Boundaries

- Use the official `@modelcontextprotocol/ext-apps` client implementation. Do
  not maintain a Splice-owned JSON-RPC/postMessage implementation.
- The official package owns the MCP Apps protocol. mcp-kit may compose it behind
  a thin, optional browser-safe entrypoint, but must not fork or reimplement the
  bridge protocol.
- Reusable connection lifecycle, loading/error semantics, teardown, host-style
  application, fixture exclusion, resource-version validation, and test-host
  seams are presumptively mcp-kit responsibilities.
- Splice owns its four view renderers, financial formatting, read-only
  interactions, tool/result mapping, and test fixture content.
- Fixtures must leave `backend/src/`. Production HTML and the production Docker
  image must contain neither fixture envelopes nor realistic fixture financial
  records. Do not add a production environment variable that can enable them.
- A host without MCP Apps continues to receive usable JSON text and validated
  `structuredContent` from every `show_*` tool.
- App resources and all bridge-triggered helper calls remain read-only and
  require `splice:read`. Do not change OAuth scopes, Auth0, DNS, Traefik, or the
  MCP endpoint.
- Leave the separate question of whether an inventory prompt should invoke a
  `show_*` tool out of scope.
- Do not start Splice adoption until the mcp-kit package is published and
  independently verified from the public npm registry.

## Milestones

### 1. Install And Pin The Official MCP Apps Skills

Implementation tasks:

- Resolve the current public `@modelcontextprotocol/ext-apps` version from npm,
  verify that its matching `v<version>` tag exists, and record the version, tag,
  commit, and package integrity in the implementation log.
- Clone that exact tag to a disposable path, following the upstream skill's
  version-matched clone procedure rather than reading moving `main`:

  ```bash
  git clone --branch "v$(npm view @modelcontextprotocol/ext-apps version)" --depth 1 \
    https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps
  ```

- Use `$skill-installer` to install these two upstream skill directories into
  the Codex skill home:
  - `plugins/mcp-apps/skills/add-app-to-server` — primary Splice migration
    workflow.
  - `plugins/mcp-apps/skills/create-mcp-app` — lifecycle, scaffolding, and
    neutral package-fixture reference.
- Do not install `migrate-oai-app` because Splice is not an OpenAI Apps SDK
  migration. Do not install `convert-web-app` because the embedded views are not
  a conversion of the TanStack frontend.
- Restart or start fresh tasks after installation so both skills are actually
  discoverable. Read each selected `SKILL.md` completely before package or
  Splice implementation.

Exit criteria:

- Codex reports both installed skills by name in a fresh task.
- The source tag and commit match the installed public ext-apps package version.
- No files under `logs/`, `tmp/backups/`, or `tmp/recordings/` changed.

### 2. Orchestrate The Standard Runtime Task In mcp-kit

Implementation tasks:

- Confirm `/Users/jtkw/projects/mcp-kit` is clean, fetch the remote, and
  fast-forward local `main` to current `origin/main`. Read its `AGENTS.md`,
  current `docs/architecture.md`, release guide, package exports, and the
  already-released App resource implementation before designing the new seam.
- From this Splice parent task, create a separate Codex task rooted in
  `/Users/jtkw/projects/mcp-kit`. Do not create the goal in the child task. Use
  the following task contract:

  > Use the official ext-apps `create-mcp-app` skill and its pinned tagged
  > source to implement a browser-safe, optional mcp-kit layer for MCP Apps.
  > Compose the official `App` and `PostMessageTransport`; do not reimplement
  > the bridge protocol. Standardize handler-before-connect lifecycle,
  > loading/ready/error states, teardown, host context/styles, production-safe
  > no-fixture defaults, explicit test-host fixture injection, and reusable
  > tests. Keep service-specific views and data outside mcp-kit. Preserve all
  > existing server/resource/scope behavior and public entrypoints. Add the
  > narrowest justified public Apps entrypoint, packed ESM/CommonJS/browser
  > consumer coverage, a neutral basic-host integration, documentation, and a
  > complete review/fix loop. Publish the next unused semver minor (expected
  > `0.4.0`) through the existing trusted workflow, then independently verify
  > registry integrity, provenance/signatures, imports, runtime behavior, and
  > tagged-source artifact identity. Return the exact version, commit, tag,
  > integrity, API usage, migration notes, and validation evidence. Make no
  > Splice or live-infrastructure changes.

- Use the `implement-review-loop` skill in the child task. Require a failing
  regression first that demonstrates the current absence of a supported client
  lifecycle/no-fixture contract.
- The expected package design is an additive, optional Apps/browser entrypoint
  (for example `@koonweee/mcp-kit/apps`) that composes official ext-apps. The
  child task must verify the exact public API and dependency direction rather
  than blindly adopting that placeholder name.
- At minimum, package validation must prove:
  - official `App`/`PostMessageTransport` behavior is used;
  - handlers are installed before connection;
  - initial state contains no business data;
  - tool results transition loading -> ready;
  - initialization/transport failure transitions loading -> error without
    fixture substitution;
  - teardown removes listeners and timers;
  - host theme/style/safe-area context is applied through official helpers;
  - test fixtures are opt-in and cannot enter the production/default path;
  - existing App resources, `requiredScopes`, safe errors/logs, ESM/CommonJS
    exports, Node 24, and package boundaries do not regress.
- Wait for the mcp-kit task to return its completed release evidence. Do not
  bump Splice against an unpublished tarball, branch, local path, or prerelease.
- When the package task is complete, create or update the goal in this parent
  task—not in the mcp-kit task—with this objective:

  > Adopt the registry-verified mcp-kit MCP Apps runtime in Splice, eliminate
  > production fixture data, validate all four Apps in real hosts, deploy
  > `splice-app-sf`, and update the runbook with rollout and rollback evidence.

Exit criteria:

- mcp-kit has no major independent-review findings.
- Its full `pnpm verify`, packed browser/ESM/CommonJS consumers, official/basic
  host integration, Node 24 container, package inspection, release check, CI,
  trusted publication, and independent registry verification pass.
- The returned npm version is immutable, exact, publicly installable, and tied
  to a specific reviewed commit/tag and integrity value.
- The mcp-kit worktree is clean and synchronized after release.

### 3. Pin The Released Runtime And Establish A Real App Build

Implementation tasks:

- In `backend/package.json`, replace exact `@koonweee/mcp-kit@0.3.1` with the
  newly registry-verified exact release and regenerate `backend/yarn.lock`.
  Never use a caret, Git URL, file dependency, or sibling checkout.
- Add the exact official ext-apps/browser and build dependencies only when the
  released mcp-kit public contract requires the consumer to import or bundle
  them directly. Let Yarn resolve a single compatible ext-apps version; document
  and test any peer dependency.
- Replace the raw string returned by
  `backend/src/mcp/apps/app-runtime.ts` with typed browser source that consumes
  the released mcp-kit Apps layer and, underneath it, official ext-apps.
- Follow `add-app-to-server` for the existing-server shape. Add a deterministic
  single-file build using Vite plus `vite-plugin-singlefile`, or the smallest
  equivalent explicitly supported by the released mcp-kit API. The production
  Nest/Docker build must build the four App resources before they are read by
  `mcp-apps.ts`.
- Keep the browser bundle self-contained under the existing empty external
  resource/connect CSP. Do not use CDN scripts or direct backend fetches; all
  authenticated reads continue through host-mediated MCP tool calls.
- Update all four `APP_RESOURCES` and linked `show_*` descriptors to the exact
  versioned `v2` URIs. Preserve the canonical widget origin, legacy ChatGPT
  aliases, `splice:read` resource/tool scopes, border preference, and
  OpenAI-submission validation.
- Keep the production image build reproducible on Node 24 with a frozen Yarn
  install. Ensure generated/bundled App artifacts are either deterministically
  built during `yarn build` or intentionally committed according to existing
  repository conventions; do not hand-edit generated output.

Exit criteria:

- `yarn why @koonweee/mcp-kit` shows only the exact new public version and the
  expected official ext-apps dependency graph.
- `rg '@modelcontextprotocol/sdk' backend/package.json backend/yarn.lock`
  remains empty; the split official SDK v2 dependency policy is preserved.
- A clean `yarn install --frozen-lockfile && yarn build` produces all four
  versioned single-file resources.
- No external JavaScript, stylesheet, finance API, or credential origin is
  required by the App CSP.
- The exact 27-tool inventory and all non-App MCP tests remain unchanged.

### 4. Remove Production Fixtures And Make Every State Truthful

Implementation tasks:

- Remove `backend/src/mcp/apps/app-fixtures.ts` and all production imports,
  embedded fixture script tags, default fixture envelopes, sample dates,
  accounts, transactions, holdings, rules, and financial totals.
- Move deterministic fixture content under `backend/test/mcp/fixtures/`.
  Fixtures must be delivered to the real production UI bundle by a test host as
  simulated `ui/notifications/tool-input` and
  `ui/notifications/tool-result` traffic, not embedded in resource HTML.
- Initialize each App in a neutral loading view with no balances, transactions,
  categories, rules, holdings, or scenario results visible.
- On a validated tool result, transition to ready and render only that result.
  Existing App controls may call only the current read-only MCP tools through
  the official client.
- On initialization timeout, malformed host response, tool failure, or bridge
  teardown, display a concise state such as `Unable to load live Splice data.`
  Do not expose internal errors and do not retain stale business data after a
  failed refresh.
- Preserve working UI state only where it is presentation-only: selected tab,
  sort, filters, expanded detail, and unsaved projection inputs. Never treat
  presentation state as authoritative financial data.
- Apply host theme, font variables, safe-area insets, size changes, visibility,
  and teardown behavior through the official runtime where supported.

Exit criteria:

- Authenticated MCP resource reads for every `v2` URI contain no
  `splice-mcp-app-fixture`, fixture identifiers, fixture values, or alternate
  demo-data fallback.
- Loading and error views contain no realistic financial or identifying data.
- A simulated real tool result renders the expected data for each App.
- A missing or broken host bridge renders an error, never a fixture.
- Headless/text-only clients still receive the existing validated text and
  `structuredContent` fallbacks.

### 5. Regression, Browser, Security, And Independent Review Gates

Implementation tasks:

- Replace the existing fixture-presence assertions in
  `backend/test/mcp/mcp.service.spec.ts` with production-absence assertions and
  exact `v2` resource/tool-link checks.
- Add focused browser-runtime tests for all state transitions and teardown:
  loading, tool input, tool result, helper tool call, helper failure, malformed
  result, bridge timeout, host context update, and teardown.
- Add a production artifact scan that fails if the returned App HTML or Docker
  image contains `splice-mcp-app-fixture`, representative fixture IDs, or the
  known fixture amounts/dates. Avoid a broad assertion that would reject
  legitimate source-level test fixtures.
- Update the resource extraction harness into a real fixture host, or use the
  tagged official `examples/basic-host`, so agent-browser sees the same
  production bundle and receives fixture data only through host notifications.
- Use `agent-browser` outside the sandbox to validate all four Apps at desktop
  and mobile viewports. Check loading, successful data render, read-only
  controls, bridge calls, error state, responsive layout, safe areas, console,
  and network activity. Close every browser session started by the task.
- Run the official basic-host against the local Splice MCP listener and verify
  App initialization/result delivery before any ChatGPT smoke.
- Run the full backend suite, lint, typecheck, build, Node 24 production Docker
  build, packed dependency checks, and Compose rendering.
- Run `implement-review-loop` over the entire plan and obtain a final independent
  review. Fix every major finding and repeat affected validation.

Exit criteria:

- Focused App/MCP tests, all backend tests, lint, typecheck, build, Docker image
  build, Node version check, and `git diff --check` pass.
- All four Apps pass official basic-host and agent-browser desktop/mobile checks
  without console errors, direct finance API calls, or fixture leakage.
- The production image contains the exact verified mcp-kit version and Node 24.
- No major independent-review issue remains.

### 6. Update The Canonical Runbook And Rollout Records

Implementation tasks:

- Update `docs/mcp.md` before deployment to make these rules explicit:
  - production App resources never contain fixture data;
  - fixtures are test-host-only;
  - the official ext-apps bridge is authoritative;
  - loading, ready, and error state meanings;
  - versioned resource URIs are cache keys;
  - local basic-host and agent-browser commands;
  - exact mcp-kit and ext-apps versions/integrities;
  - ChatGPT refresh and fresh-conversation requirements;
  - production smoke, observability, and rollback commands.
- Update `backend/README.md` only if it contains conflicting App development
  guidance; keep `docs/mcp.md` canonical.
- Add a correction note to `plans/interactive-mcp-app-panes.md` identifying
  this plan as the production data-integrity follow-up without rewriting the
  completed plan's history.
- Update this plan and `plans/index.md` as milestones complete. Record exact
  package commit/tag/integrity, Splice main/deploy revisions, GitHub workflow
  runs, Komodo build/deploy updates, image digest, production smoke evidence,
  and rollback inputs.
- The stack topology is unchanged, so do not edit Auth0, DNS, Traefik, or Komodo
  TOML merely for this code release. If implementation unexpectedly introduces
  a durable stack requirement, pause, update the stack repository declaratively
  under its `AGENTS.md`, render Compose, sync the ResourceSync, and document why.

Exit criteria:

- The canonical runbook no longer instructs operators to inspect fixture
  fallbacks as a production-equivalent validation.
- A new operator can reproduce local standard-host validation and production
  smoke testing without hidden commands or fixture ambiguity.
- Runbook versions and rollout evidence match installed and deployed artifacts.

### 7. Protected Deploy, Targeted Redeploy, And Production Smoke

Implementation tasks:

- Commit and push the reviewed Splice changes to `main`. Trigger the protected
  `.github/workflows/deploy.yml` workflow with `confirm=deploy`; do not merge
  directly into protected `deploy`.
- Wait for the workflow-dispatched `main` -> `deploy` CI comparison to pass and
  for the deploy PR to merge the exact validated main SHA.
- Verify the Komodo `splice-backend` webhook build from the new `deploy`
  revision completes and publishes the Node 24 backend image. Record the build
  update and immutable image digest.
- Before mutation, record the currently deployed SF app revision, stack
  revision, image digest, container health, and public discovery response as
  rollback inputs.
- Because the stack definition and MCP configuration are unchanged, do not sync
  unrelated stacks. Redeploy only `splice-app-sf` onto the newly built backend
  image. Do not redeploy `splice-app-vps`, `splice-app-sg`, the database,
  external Traefik, Auth0, or DNS.
- Verify after redeploy:
  - SF backend and frontend containers are healthy;
  - existing frontend and REST API health remain good;
  - protected-resource discovery returns the canonical issuer/resource/scopes;
  - unauthenticated `/mcp` returns the sanitized bearer challenge;
  - the legacy API-origin `/mcp` remains absent;
  - authenticated MCP initialization lists exactly 27 tools;
  - all four `v2` resources expose the expected domain/CSP/scopes and contain no
    fixture data;
  - all four `show_*` calls retain text/structured fallbacks;
  - a real App-capable client receives tool results and renders them;
  - server logs contain no claims, arguments, results, fixture data, or internal
    failures.
- In ChatGPT developer settings, use **Refresh** or **Scan Tools** on the
  existing Splice connection so the `v2` resource descriptors replace cached
  `v1` HTML. No new Auth0 client import, DNS record, consent configuration, or
  plugin recreation is expected.
- Start a fresh supported Chat/Work conversation, attach Splice, and explicitly
  open each App. Confirm real data arrives, the fixture warning and known sample
  numbers never appear, read-only controls work, and error behavior remains
  truthful. Repeat at least Cashflow Explorer on ChatGPT mobile/iOS because that
  host exposed the original defect.

Exit criteria:

- The exact reviewed image is healthy on `splice-app-sf` and no other Splice
  replica was unnecessarily redeployed.
- Production HTML and live rendering contain no fixture data.
- ChatGPT web and mobile render authenticated tool results through the official
  bridge after one metadata refresh.
- No Auth0 or DNS change was required.
- `docs/mcp.md` contains the final rollout and rollback record.

## Tests

### mcp-kit

- Unit-test client lifecycle ordering, loading/ready/error transitions, host
  context, tool calls, timeout, teardown, and explicit test fixture injection.
- Prove default/production APIs cannot receive fixture business data implicitly.
- Compile and run packed ESM, CommonJS, and browser consumers against the public
  entrypoint and official ext-apps types.
- Run a neutral MCP server/view through the tagged official basic-host.
- Preserve all existing resource scope, safe boundary, Auth0, Node adapter, and
  registry tests.

### Splice Backend And Apps

- Resource inventory: four exact `v2` URIs, MIME type, canonical domain, empty
  external CSP, border preference, legacy aliases, and `splice:read` denial.
- Tool inventory: exactly 27 names, four exact App links, unchanged annotations,
  and unchanged text/`structuredContent` fallbacks.
- Production-resource safety: no fixture script, IDs, accounts, transactions,
  holdings, rules, known amounts, known dates, token-like strings, or secrets.
- Runtime: loading without data; real tool result render; malformed/error result;
  bridge unavailable; helper read success/failure; host context; resize; teardown.
- App behavior: cash-flow date reload/drilldown/audit; projection in-memory
  assumptions with no persistence; portfolio filter/sort/page; rule workbench
  search/filter/detail/audit, all through existing read-only tools.
- Authorization: App resource/provider and bridge helper calls never run without
  `splice:read`.
- Container: Node 24, exact mcp-kit/ext-apps dependency versions, deterministic
  UI build, and no fixture artifacts outside tests.

### Browser And Production

- Tagged official basic-host at desktop and mobile viewports.
- Agent-browser fixture-host loading, result, interaction, error, console, and
  network checks for all four Apps; terminate the session.
- ChatGPT web: refresh metadata, attach in a fresh supported conversation, open
  all four Apps, and verify real result delivery.
- ChatGPT mobile/iOS: repeat Cashflow Explorer and verify the original fixture
  banner and values are absent.

## Validation Commands

mcp-kit task, using the package's current documented commands:

```bash
cd /Users/jtkw/projects/mcp-kit
pnpm install --frozen-lockfile
pnpm verify
pnpm release:check -- v<new-version>
pnpm test:registry -- v<new-version>
```

Splice backend and MCP Apps:

```bash
cd /Users/jtkw/projects/splice-mono/backend
yarn install --frozen-lockfile
yarn why @koonweee/mcp-kit
yarn typecheck
yarn lint
yarn test --runInBand test/mcp
yarn test --runInBand
yarn build
docker build -t splice-backend:mcp-app-data-integrity .
docker run --rm --entrypoint node splice-backend:mcp-app-data-integrity --version
```

Production-resource leakage checks must target built resource output rather than
rejecting intentional test fixtures:

```bash
rg -n "splice-mcp-app-fixture|fixture-account-|fixture-transaction-|2026-03-31|6,250|3,120|3,130" \
  backend/dist backend/src/mcp \
  --glob '!**/*.map' --glob '!**/*.tsbuildinfo'
```

Expected result: no production/built App-resource match. Test-owned fixture
directories are intentionally excluded. TypeScript incremental build metadata
is also excluded because its numeric file-ID arrays can coincidentally contain
comma-separated sequences such as `3,120`; it is not an App resource or
executable browser payload.

Compose and repository checks:

```bash
cd /Users/jtkw/projects/stack/control-plane/komodo/stacks/splice-app
docker compose config --quiet
docker compose -f docker-compose.yml -f docker-compose.external.yml config --quiet

cd /Users/jtkw/projects/splice-mono
git diff --check
```

Use the exact local fixture-host/basic-host and agent-browser commands added to
`docs/mcp.md`; do not preserve the old standalone HTML server procedure that
relied on embedded production fixtures.

## Rollback

- mcp-kit versions are immutable. Do not unpublish or overwrite the new package.
  If its artifact is defective, publish a normal follow-up version and keep
  Splice pinned to the last known-good release until verified.
- Before the SF redeploy, record the current protected `deploy` revision, Komodo
  stack revision, backend image digest, and mcp-kit version.
- For an App regression, redeploy only `splice-app-sf` with the recorded prior
  backend image/application revision. No database rollback is expected because
  this plan changes no persistent data.
- Leave Auth0, DNS, and the stack topology unchanged. After rollback, refresh
  the ChatGPT plugin so its descriptors point back to the prior resource URIs.
- Confirm frontend/API health, discovery, bearer challenge, 27-tool inventory,
  representative reads, and the four text/structured fallbacks after rollback.

## Risks And Operator Notes

- ChatGPT web and mobile can implement the same standard with different timing
  or lifecycle behavior. The tagged official basic-host passed at desktop and
  mobile sizes; after deployment, Refresh/Scan Tools and a fresh attached
  ChatGPT conversation remain the client-cache verification step.
- mcp-kit `0.4.1` isolates the browser entrypoint from Node/Auth0/core imports,
  and its packed browser and Node consumers passed. Splice therefore needs no
  direct ext-apps production dependency or local bridge adapter.
- Versioned resource URIs intentionally require a ChatGPT metadata refresh.
  Do not revert to unversioned URIs merely to accommodate an old conversation's
  cached descriptor.
- Production fixture removal makes bridge failures visually less impressive but
  more truthful. An error view is the required behavior; never restore demo
  finance data as an availability workaround.

## Overall Exit Criteria

- The two official upstream MCP Apps skills are installed from a version-matched
  tagged source and used during implementation.
- A separate mcp-kit task implements the smallest reusable layer on official
  ext-apps, completes review, publishes it, and independently verifies the
  public registry artifact before Splice adoption.
- Splice pins that exact release and uses the official bridge for all four Apps.
- Production App HTML, JavaScript, and image contain no fixture business data;
  fixtures exist only under test-owned paths and arrive through a test host.
- All four Apps show loading, authenticated real data, and truthful errors with
  no silent fixture fallback.
- Versioned resource URIs prevent stale ChatGPT HTML reuse while preserving
  domain, CSP, scopes, compatibility aliases, 27 tools, and headless fallbacks.
- Full mcp-kit, backend, MCP, browser, Node 24 image, Compose, independent review,
  and production smoke gates pass with no major issue.
- The protected deploy workflow builds the exact reviewed revision and only
  `splice-app-sf` is redeployed.
- ChatGPT requires only Refresh/Scan Tools plus a fresh attached conversation;
  Auth0, DNS, and plugin registration do not change.
- `docs/mcp.md` records exact package, commit, workflow, image, deployment,
  validation, and rollback evidence, and `plans/index.md` accurately reflects
  final status.
