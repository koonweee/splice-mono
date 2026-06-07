# MCP Spec Capability Upgrade

## Status

Done

## Goal

Upgrade Splice's MCP surface from a read-tool catalog into a richer spec-aligned interface with typed outputs, interactive UI resources, reusable prompts, parameterized report resources, and structured user elicitation for projection assumptions.

This plan covers the five requested additions:

- Tool output schemas and read-only annotations.
- MCP Apps / generative UI resources.
- MCP prompts for repeatable finance workflows.
- Resource templates and report resources.
- Elicitation for non-sensitive projection inputs.

The default posture is conservative: existing MCP tools remain available, read-only data tools stay read-only, Apps support is standards-first, and elicitation gathers in-session assumptions without persisting them unless a later plan explicitly adds storage.

## Current Behavior

- `backend/src/mcp/mcp.controller.ts` exposes a stateless Streamable HTTP MCP endpoint at `POST /mcp`, protected by personal-access-token-only auth. `GET` and `DELETE` return method-not-allowed responses.
- `backend/src/mcp/mcp.service.ts` creates one `McpServer` per request, registers one static resource (`splice://mcp-guide`), and registers 16 tools for user context, accounts, balances, banking/manual transactions, investment reads, recurring schedules, rule introspection, cash-flow analysis, and audit/drilldown reads.
- `backend/src/mcp/mcp-read.service.ts` owns most raw MCP read mapping and cursor pagination. `toolResult()` in `backend/src/mcp/mcp.service.ts` normalizes money into `structuredContent` and mirrored text content, but tools do not currently declare `outputSchema`.
- `backend/test/mcp/mcp.service.spec.ts` uses `@modelcontextprotocol/sdk` `Client` plus `InMemoryTransport` to verify tool/resource registration and tool delegation. This is the right test seam for prompts, resource templates, annotations, and output schemas.
- `backend/package.json` uses `@modelcontextprotocol/sdk` `^1.29.0`. The installed SDK types expose `registerTool({ outputSchema, annotations, _meta })`, `registerPrompt()`, `ResourceTemplate`, `registerResource()` overloads for resource templates, `server.server.elicitInput()`, and experimental task helpers.
- `frontend/src/components/settings/McpConnectionSection.tsx` only describes the MCP endpoint and PAT usage. No generated frontend API artifacts represent MCP tools.
- `plans/index.md` tracks plan status; new plans should follow `plans/template.md` and include milestone exit criteria, tests, validation commands, and overall exit criteria.

Relevant MCP docs to use during implementation:

- Core spec: `https://modelcontextprotocol.io/specification/2025-11-25`
- Tools: `https://modelcontextprotocol.io/specification/2025-11-25/server/tools`
- Resources: `https://modelcontextprotocol.io/specification/2025-11-25/server/resources`
- Prompts: `https://modelcontextprotocol.io/specification/2025-11-25/server/prompts`
- Elicitation: `https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation`
- Extensions overview: `https://modelcontextprotocol.io/extensions`
- MCP Apps: `https://modelcontextprotocol.io/extensions/apps/overview`

## Target Data Shape

Milestone 1 should introduce reusable Zod output schemas in MCP code instead of relying only on TypeScript interfaces. These schemas should be close to the existing `structuredContent` shape so clients can validate responses without breaking current text output.

```ts
type McpToolRegistration = {
  title: string
  description: string
  inputSchema: z.ZodRawShape | z.ZodType
  outputSchema: z.ZodRawShape | z.ZodType
  annotations: {
    readOnlyHint: true
    destructiveHint: false
    idempotentHint: true
    openWorldHint: false
  }
}
```

Apps should be advertised through MCP Apps metadata, with an OpenAI Apps-compatible alias only if implementation confirms the target host expects it and the alias does not weaken standards-first behavior.

```ts
type SpliceMcpAppToolMeta = {
  ui: {
    resourceUri: 'ui://splice/cashflow-explorer.html'
    preferredDisplayMode?: 'inline' | 'fullscreen' | 'sidebar'
  }
  'openai/outputTemplate'?: 'ui://splice/cashflow-explorer.html'
}
```

Prompts should be argument-driven and should return messages that instruct clients to call existing MCP tools rather than duplicating business logic.

```ts
type SplicePromptArguments = {
  startDate?: string
  endDate?: string
  reportingCurrency?: string
  accountIds?: string[]
}
```

Resource templates should return `application/json` for report data and `text/markdown` for human-readable guides/summaries.

```ts
type SpliceResourceTemplate =
  | 'splice://reports/cashflow/{startDate}/{endDate}'
  | 'splice://accounts/{accountId}/snapshot'
  | 'splice://categories/taxonomy'
  | 'splice://rules/analysis'
  | 'splice://portfolio/holdings/latest'
```

Elicitation should produce ephemeral assumption objects used by an MCP call result, not persisted database records.

```ts
type ProjectionAssumptions = {
  goalName?: string
  horizonDate: string
  recurringIncomeAdjustment?: number
  recurringExpenseAdjustment?: number
  oneTimeEvents?: Array<{
    label: string
    date: string
    amount: number
    currency: string
    sign: 'positive' | 'negative'
  }>
  expectedAnnualReturnPercent?: number
}
```

## Milestones

### 1. Add Output Schemas And Tool Annotations

Implementation tasks:

- Create reusable MCP Zod schemas in a new `backend/src/mcp/mcp-schemas.ts` or a similarly scoped file:
  - `McpMoneySchema`
  - pagination schemas
  - account snapshot schemas
  - balance history schemas
  - transaction, category, investment, recurring schedule, rule, cash-flow analysis, and audit schemas
- Update `toolResult()` or a small registration helper in `backend/src/mcp/mcp.service.ts` so registered tools consistently provide:
  - `outputSchema`
  - `annotations.readOnlyHint: true`
  - `annotations.destructiveHint: false`
  - `annotations.idempotentHint: true`
  - `annotations.openWorldHint: false`
- Keep existing `content` text output and `structuredContent` output for backward compatibility.
- Prefer exact schemas for stable contract fields and permissive nested schemas only where backing domain views already contain broad JSON structures, such as rule conditions or provider payload hints.
- Update `backend/test/mcp/mcp.service.spec.ts` to assert that every listed tool has an `outputSchema` and read-only annotations.
- Add one or two tool-call tests that prove SDK structured-output validation still accepts returned content after `outputSchema` is present.
- Update `backend/README.md` and `MCP_GUIDE` to mention typed structured outputs for clients.

Exit criteria:

- `client.listTools()` shows every existing tool with `outputSchema` and read-only annotations.
- Existing MCP tool calls still return both JSON text content and `structuredContent`.
- `cd backend && yarn test test/mcp` passes.
- `cd backend && yarn typecheck` and `cd backend && yarn lint` pass.

### 2. Add MCP Apps / Generative UI Resources

Implementation tasks:

- Add a standards-first MCP Apps implementation using the official extension shape:
  - UI resources use `ui://splice/...` URIs.
  - HTML resources use `mimeType: 'text/html;profile=mcp-app'`.
  - Tool definitions point to apps through `_meta.ui.resourceUri`.
- If implementation confirms the target host needs OpenAI Apps compatibility, add `_meta['openai/outputTemplate']` as a non-authoritative alias on app-backed tools.
- Decide the app implementation seam during implementation:
  - Preferred backend-only first pass: static, CSP-restricted HTML resources generated from files under `backend/src/mcp/apps/`.
  - Optional richer pass: a small Vite-built React bundle under `frontend/` or a dedicated package only if static resources are too limiting.
- Add read-only app-backed tools in `backend/src/mcp/mcp.service.ts`:
  - `show_cashflow_explorer`
  - `show_projection_scenario_modeler`
  - `show_portfolio_viewer`
  - `show_category_rule_workbench`
- Each app-backed tool should return enough `structuredContent` for non-App clients to answer textually, and the UI should use only read-only tool calls through the MCP bridge.
- Keep app resources self-contained and avoid embedding secrets, PATs, account tokens, raw provider payloads, or external script origins.
- If app assets are built from frontend code, add a repeatable build command and avoid hand-editing generated bundles.
- Update `backend/test/mcp/mcp.service.spec.ts` to assert app tools are registered, app `_meta` points to the expected `ui://` resources, and `client.readResource()` returns HTML resources with the MCP Apps MIME type.
- Add a lightweight HTML validation test for required app shell markers, CSP metadata if present, and no accidental PAT/secret strings.
- Add `$agent-browser` validation to the implementation checklist:
  - render each app HTML in a local fixture or supported MCP Apps host,
  - verify charts/tables/forms are nonblank,
  - check desktop and mobile widths,
  - check console errors.

Exit criteria:

- App-backed tools are discoverable and return useful non-App fallback structured data.
- App resources are readable through MCP and have `text/html;profile=mcp-app`.
- App metadata uses standards-first `_meta.ui.resourceUri`, with any compatibility alias documented.
- Browser validation shows the UI resources render without console errors or text/layout overlap.
- `cd backend && yarn test test/mcp`, `cd backend && yarn typecheck`, and `cd backend && yarn lint` pass.
- If frontend-built app assets are added, `cd frontend && yarn build`, `cd frontend && yarn typecheck`, and `cd frontend && yarn lint` pass.

### 3. Add Workflow Prompts

Implementation tasks:

- Register prompts in `SpliceMcpService.createServer()` using `server.registerPrompt()`:
  - `monthly_cashflow_review`
  - `projection_builder`
  - `category_cleanup_audit`
  - `portfolio_snapshot`
  - `tax_or_refund_anomaly_review`
- Keep prompt callbacks deterministic: they should assemble prompt messages and argument context, not call business services directly.
- Define prompt argument schemas with date ranges, optional reporting currency, optional account/category filters, and a `detailLevel` option where useful.
- Prompt text should tell the client which Splice MCP tools to call, how to page through results, how to treat pending transactions, and when to ask the user for assumptions instead of inventing them.
- Add `backend/test/mcp/mcp.service.spec.ts` coverage for:
  - `client.listPrompts()` includes all prompts.
  - `client.getPrompt()` validates arguments and returns messages containing the expected tool-use sequence.
  - invalid dates or unsupported prompt arguments are rejected by the SDK.
- Update `splice://mcp-guide` to mention available prompts without making them mandatory.
- Update `backend/README.md` with a short prompt catalog.

Exit criteria:

- Prompt discovery and retrieval work through the MCP client test harness.
- Prompt text references actual tool names currently registered in `SpliceMcpService.TOOL_NAMES`.
- Prompts do not expose or request secrets.
- `cd backend && yarn test test/mcp`, `cd backend && yarn typecheck`, and `cd backend && yarn lint` pass.

### 4. Add Resource Templates And Report Resources

Implementation tasks:

- Import `ResourceTemplate` from `@modelcontextprotocol/sdk/server/mcp.js` in `backend/src/mcp/mcp.service.ts`.
- Register parameterized resource templates:
  - `splice://reports/cashflow/{startDate}/{endDate}`
  - `splice://accounts/{accountId}/snapshot`
  - `splice://categories/taxonomy`
  - `splice://rules/analysis`
  - `splice://portfolio/holdings/latest`
- For each template, route reads through existing services:
  - cashflow report: `TransactionAnalysisService.getAnalysis()`
  - account snapshot: `AccountsSurfaceService.getAccountsSnapshot()`
  - categories: `McpReadService.listCategories()`
  - rules: `McpReadService.listAnalysisRules()` and `listCategorizationRules()`
  - portfolio holdings: `McpReadService.listInvestmentHoldings()`
- Add completion callbacks where useful:
  - account IDs from the user's account snapshot,
  - dates from `get_user_context.today`-relative defaults only if the SDK callback can access user context safely.
- Return JSON resources for machine-readable reports and markdown resources only for explanatory guides.
- Add explicit date validation for template variables and ownership validation for account IDs.
- Add `backend/test/mcp/mcp.service.spec.ts` coverage for:
  - `client.listResourceTemplates()`,
  - successful `client.readResource()` for each template,
  - invalid date and unknown account errors,
  - service delegation.
- Update `MCP_GUIDE` so clients know when to prefer resources over tools.

Exit criteria:

- Resource templates are discoverable and readable through the SDK client.
- Template reads are user-scoped and do not leak cross-user data.
- Resource responses match the same money normalization rules as tools.
- `cd backend && yarn test test/mcp`, `cd backend && yarn typecheck`, and `cd backend && yarn lint` pass.

### 5. Add Elicitation For Projection Assumptions

Implementation tasks:

- Add a focused projection-assumption tool such as `collect_projection_assumptions` or extend `show_projection_scenario_modeler` only if implementation confirms the host supports elicitation.
- Use the request-handler `extra` argument in the tool callback to access the connected server context and call `server.server.elicitInput()` only when `getClientCapabilities()?.elicitation` indicates support.
- Define a form-mode elicitation schema for non-sensitive projection inputs:
  - horizon date,
  - goal label,
  - income/expense adjustments,
  - one-time events,
  - expected annual return assumption.
- Do not request secrets, credentials, payment details, bank tokens, or PATs through elicitation.
- Do not persist elicited assumptions. Return them as part of the tool result for the current workflow and include a clear `source: 'elicited'` marker.
- Add graceful fallback behavior when a client does not support elicitation:
  - return a structured `inputRequired` object with the same fields and suggested prompt text,
  - do not fail the whole projection workflow.
- Update `MCP_GUIDE` and prompt text so clients know when elicitation may be used and when they should ask normally.
- Add tests using the SDK or a mocked request path to cover:
  - supported elicitation request shape,
  - unsupported-client fallback,
  - validation of returned assumptions,
  - rejection of invalid dates or negative horizon assumptions where applicable.

Exit criteria:

- Projection workflows can collect structured assumptions from compatible clients.
- Incompatible clients receive a useful structured fallback instead of an error.
- No elicitation schema asks for sensitive data.
- Elicited assumptions are not written to the database.
- `cd backend && yarn test test/mcp`, `cd backend && yarn typecheck`, and `cd backend && yarn lint` pass.

## Tests

### Backend

- Update `backend/test/mcp/mcp.service.spec.ts` for:
  - tool `outputSchema` and annotations,
  - prompt discovery and retrieval,
  - resource template discovery and reads,
  - app resource reads and app tool metadata,
  - elicitation-supported and elicitation-unsupported flows.
- Add or update focused helpers under `backend/test/mcp/` if the test file becomes too large:
  - `mcp-schemas.spec.ts`
  - `mcp-prompts.spec.ts`
  - `mcp-resources.spec.ts`
  - `mcp-apps.spec.ts`
  - `mcp-elicitation.spec.ts`
- Keep direct unit tests for `backend/src/mcp/mcp-read.service.ts` when new resources reuse read-service methods.
- Add negative cases for invalid dates, unknown account IDs, unsupported clients, and unsafe elicitation fields.

### Frontend

- No Orval regeneration is expected because MCP tools/resources are not frontend REST API contracts.
- If MCP Apps use frontend-built React assets, add component or build tests for the app entrypoints and run:
  - `cd frontend && yarn build`
  - `cd frontend && yarn typecheck`
  - `cd frontend && yarn lint`
- If Settings copy changes, update `frontend/src/components/settings/McpConnectionSection.test.tsx`.
- For app UI resources, include `$agent-browser` validation for rendered HTML resources or a supported MCP Apps host:
  - desktop and mobile screenshots,
  - console/runtime errors,
  - nonblank chart/table rendering,
  - form input behavior for projection assumptions.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/mcp
cd backend && yarn typecheck
cd backend && yarn lint
```

Broader backend regression pass when resources or prompts call domain services beyond mocked MCP tests:

```bash
cd backend && yarn test test/transaction-analysis test/investment test/category test/analysis-rule test/transaction-categorization
```

Frontend, only if MCP Apps use frontend-built assets or Settings copy changes:

```bash
cd frontend && yarn test
cd frontend && yarn typecheck
cd frontend && yarn lint
cd frontend && yarn build
```

Manual/browser validation for MCP Apps:

```bash
# Use $agent-browser against a local fixture or supported MCP Apps host.
# Verify each UI resource renders at desktop and mobile widths without console errors.
```

## Overall Exit Criteria

- Every existing MCP tool declares a useful output schema and read-only annotations while preserving existing tool names, inputs, text content, and structured content.
- MCP Apps tools and UI resources are discoverable, standards-first, read-only, and have a non-App fallback response.
- Prompts are discoverable and provide deterministic workflows grounded in registered Splice tool names.
- Resource templates expose reusable account, cash-flow, category, rule, and portfolio report reads without cross-user leakage.
- Elicitation supports structured, non-sensitive, in-session projection assumptions and gracefully falls back for clients without elicitation support.
- `backend/README.md`, `splice://mcp-guide`, and `plans/index.md` agree on the new MCP surface.
- Required backend checks pass; frontend checks pass if frontend-built assets or Settings copy are changed.

## Risks And Open Questions

- MCP Apps host support varies. Implementation should remain useful for clients that only read `structuredContent`, and Apps should be treated as progressive enhancement.
- `@modelcontextprotocol/ext-apps` may be needed for convenience wrappers, but the installed core SDK already supports `_meta` and HTML resources. If adding the extension package, verify dependency installation and lockfile updates intentionally.
- OpenAI Apps compatibility metadata should be added only if the intended host needs it. The primary metadata should remain `_meta.ui.resourceUri`.
- Elicitation is client-capability-dependent. Unsupported-client fallback is required and should be tested.
- If Apps become frontend-built bundles, decide whether they live in `frontend/` or a dedicated MCP app asset directory before implementation to avoid mixing generated bundles into handwritten source.
