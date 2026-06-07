# Interactive MCP App Panes

## Status

Done

## Goal

Turn the four current Splice MCP App panes into genuinely interactive, read-only app surfaces that can be rendered by MCP Apps-capable hosts while continuing to return useful structured fallback data to non-App clients.

The current panes are:

- Cashflow Explorer
- Projection Scenario Modeler
- Portfolio Viewer
- Category Rule Workbench

The target behavior is interactive exploration inside the MCP host: filters, tabs, drilldowns, sortable tables, local scenario inputs, loading/error states, and bridge-backed calls to existing read-only Splice MCP tools. This plan does not add write actions such as creating rules, accepting recommendations, applying categorization rules, or persisting projection assumptions.

## Current Behavior

- `backend/src/mcp/mcp.service.ts` owns all MCP server registration, including:
  - `APP_RESOURCES`
  - `MCP_APP_MIME_TYPE`
  - `htmlResource()`
  - `appToolResult()`
  - the four `ui://splice/...` app resource registrations
  - the four app-backed tools: `show_cashflow_explorer`, `show_projection_scenario_modeler`, `show_portfolio_viewer`, and `show_category_rule_workbench`
- The app resources currently return inline static HTML with simple cards, bars, forms, or tables. They do not include JavaScript, app state, bridge calls, tool-result hydration, tabs, sorting, filtering, drilldown panels, or robust empty/error states.
- The app-backed tools already fetch the right first-pass data and return it in `structuredContent.app`, `structuredContent.data`, and `structuredContent.fallback`:
  - `show_cashflow_explorer` calls `TransactionAnalysisService.getAnalysis()` and maps it through `mcpCashflowAnalysis()`.
  - `show_projection_scenario_modeler` calls `AccountsSurfaceService.getAccountsSnapshot()` and `McpReadService.listRecurringManualTransactionSchedules()`.
  - `show_portfolio_viewer` calls `McpReadService.listInvestmentHoldings()` and `McpReadService.listInvestmentActivity()`.
  - `show_category_rule_workbench` calls `listCategories()`, `listAnalysisRules()`, `listCategorizationRules()`, and `listCategorizationRuleRecommendations()`.
- `backend/src/mcp/mcp-schemas.ts` has `AppToolOutputSchema`, but it intentionally treats `data` as `unknown`. That is acceptable for fallback compatibility, but the app implementation will need narrower internal view-model shapes.
- `backend/test/mcp/mcp.service.spec.ts` verifies app resource discovery, `_meta.ui.resourceUri`, `openai/outputTemplate`, resource reads, and basic app tool fallback calls.
- The frontend has useful interaction patterns, but they are regular web app components, not MCP Apps resources:
  - `frontend/src/components/analysis/AnalysisSankeyChart.tsx` has clickable cash-flow categories and drilldown callbacks.
  - `frontend/src/components/Chart.tsx` has hover-driven chart state.
  - `frontend/src/components/investments/InvestmentHoldingsTable.tsx` and `frontend/src/components/investments/InvestmentActivityTable.tsx` show responsive holdings/activity table behavior.
  - `frontend/src/components/settings/AnalysisRulesSection.tsx` and `frontend/src/components/settings/CategorizationRulesSection.tsx` show search, tabs/panels, archived toggles, and recommendation preview patterns.
- `frontend/package.json` already includes Mantine, Recharts, Vite, and React, but the current MCP Apps resources are backend-served HTML strings and do not use frontend generated API clients or routes.
- MCP Apps documentation confirms the right architecture for this change: tools point to `ui://` resources through `_meta.ui.resourceUri`, hosts render sandboxed iframes, the app receives tool input/result from the host, and the app can call MCP tools through the host bridge. Host support is variable, so structured fallback results remain required.

## Target Data Shape

No database schema, REST API, generated frontend client, or MCP read-tool contract changes are required.

Add MCP app-local view models under the MCP app implementation seam so the renderer is not coupled to loose `unknown` fallback data:

```ts
type SpliceMcpAppDefinition = {
  id:
    | 'cashflow_explorer'
    | 'projection_scenario_modeler'
    | 'portfolio_viewer'
    | 'category_rule_workbench'
  title: string
  resourceUri: `ui://splice/${string}.html`
  description: string
  initialToolName: string
}

type SpliceMcpAppEnvelope<TData> = {
  app: SpliceMcpAppDefinition
  data?: TData
  fallback: string
}

type SpliceAppBridge = {
  hasHostBridge: boolean
  initialInput: Record<string, unknown> | null
  initialResult: unknown | null
  callTool: <TResult>(
    name: string,
    args: Record<string, unknown>,
  ) => Promise<TResult>
  updateModelContext?: (message: string) => Promise<void>
}
```

The bridge adapter should be isolated from app rendering code. During implementation, verify the exact MCP Apps view-side bridge API against the installed SDK/package documentation before coding message names. Prefer an official `@modelcontextprotocol/ext-apps` helper if it removes protocol ambiguity; otherwise keep the local adapter small and covered by browser smoke tests.

## Milestones

### 1. Extract App Resources And Add A Shared Interactive Runtime

Implementation tasks:

- Move app resource definitions and HTML generation out of `backend/src/mcp/mcp.service.ts` into a dedicated MCP app seam, such as:
  - `backend/src/mcp/mcp-apps.ts` for `APP_RESOURCES`, resource registration helpers, and app result helpers.
  - `backend/src/mcp/apps/app-shell.ts` for the shared HTML shell, CSS, script injection, CSP metadata, and fixture support.
  - `backend/src/mcp/apps/app-runtime.ts` or an equivalent source asset for shared client-side rendering helpers.
- Preserve the existing `APP_RESOURCES` ids and `ui://splice/...` URIs so clients do not need to rediscover different app resources.
- Replace inline static body strings with one app renderer per pane:
  - `backend/src/mcp/apps/cashflow-explorer.ts`
  - `backend/src/mcp/apps/projection-scenario-modeler.ts`
  - `backend/src/mcp/apps/portfolio-viewer.ts`
  - `backend/src/mcp/apps/category-rule-workbench.ts`
- Add a shared bridge adapter that:
  - hydrates from host-provided initial tool input/result when an MCP Apps host supplies it,
  - can call read-only MCP tools through the host bridge when supported,
  - falls back to a local fixture block for unit/browser smoke tests,
  - reports a clear "host bridge unavailable" state while still rendering the structured fallback data,
  - never embeds PATs, session cookies, provider raw payloads, or external script origins.
- Add `_meta.ui.csp` to returned app resource contents. Keep it restrictive by default: no external `resourceDomains`, no external `connectDomains`, and only widen it if a verified bridge implementation requires an explicit allowed origin.
- Decide during this milestone whether to add `@modelcontextprotocol/ext-apps`:
  - Add it if the view-side app bridge or server helper avoids hand-rolled protocol assumptions.
  - Do not add it only for `RESOURCE_MIME_TYPE`; the current `text/html;profile=mcp-app` constant is already enough for that.
- Keep all app tools read-only with the existing `READ_ONLY_ANNOTATIONS`.

Exit criteria:

- `backend/src/mcp/mcp.service.ts` delegates app resource registration and app tool result construction to the new MCP app seam.
- `client.readResource()` still returns all four `ui://splice/...` resources with `text/html;profile=mcp-app`.
- `client.listTools()` still shows `_meta.ui.resourceUri` and `openai/outputTemplate` for all four app-backed tools.
- Each resource includes the shared runtime and renders a deterministic fallback fixture when loaded outside an MCP Apps host.
- `cd backend && yarn test test/mcp` passes.

### 2. Make Cashflow Explorer Interactive

Implementation tasks:

- Build Cashflow Explorer state around the existing `show_cashflow_explorer` fallback data and additional bridge calls to:
  - `get_cashflow_analysis`
  - `list_cashflow_category_transactions`
  - `get_cashflow_analysis_audit`
- Add controls for:
  - date range inputs with quick presets,
  - inflow/outflow/net summary selection,
  - category search,
  - inflow/outflow category toggles,
  - include-pending visibility copy based on the returned data,
  - audit/drilldown panel visibility.
- Render an accessible chart/list hybrid that does not require Recharts inside the MCP iframe:
  - proportional bars for categories,
  - summary tiles for totals,
  - keyboard-clickable category rows,
  - transaction drilldown table for the selected category,
  - audit rows explaining rule and neutralization effects.
- Handle empty categories, no matching transactions, bridge-call failures, invalid date ranges, and long category labels without layout overlap.
- Keep color handling consistent with the frontend category-color behavior where possible, but do not import frontend generated artifacts into backend MCP app code.

Exit criteria:

- A user can change the date range, reload cash-flow data, click a category, and see the matching category transactions.
- Audit data can be opened for the same date range without leaving the pane.
- Non-App clients still receive the current structured fallback data from `show_cashflow_explorer`.
- MCP app browser validation covers desktop and mobile widths, category click, date reload, transaction drilldown, and no console errors.

### 3. Make Projection Scenario Modeler Interactive

Implementation tasks:

- Build a local scenario model from existing read-only data:
  - `get_accounts_snapshot`
  - `list_balance_snapshots`
  - `list_recurring_manual_transaction_schedules`
  - optional `collect_projection_assumptions` only when host elicitation is useful outside the iframe.
- Add controls for:
  - projection horizon date,
  - scenario name,
  - monthly recurring income adjustment,
  - monthly recurring expense adjustment,
  - expected annual return percentage,
  - one-time events with label/date/amount/sign/currency,
  - account inclusion toggles for projection baseline.
- Render:
  - current account baseline summary,
  - recurring schedule assumptions pulled from Splice,
  - local projected net-flow and ending-balance estimates,
  - a compact timeline/table of scenario events,
  - validation messages for invalid dates, invalid percentages, and malformed amounts.
- Keep calculations clearly labeled as in-session estimates. Do not persist assumptions and do not create future transactions.
- Provide a bridge action to update model context with the scenario summary if the MCP Apps host supports that capability; otherwise provide the same summary in the pane for the user/model to read.

Exit criteria:

- A user can edit scenario inputs and see projected summary values update without a server write.
- Recurring schedules and account baselines are visible as read-only inputs to the scenario.
- Invalid assumptions block scenario summary updates with inline validation.
- Non-App clients still get account and recurring schedule fallback data from `show_projection_scenario_modeler`.
- MCP app browser validation covers adding/removing one-time events, changing horizon/return values, mobile layout, and no console errors.

### 4. Make Portfolio Viewer Interactive

Implementation tasks:

- Build Portfolio Viewer state around:
  - `show_portfolio_viewer`
  - `list_investment_holdings`
  - `list_investment_activity`
  - optionally `get_accounts_snapshot` for account labels and account-type context.
- Add controls for:
  - account filter,
  - latest/date-specific holdings toggle,
  - holdings search,
  - holdings sort by security, ticker, quantity, price, or value,
  - activity type filter,
  - investment activity pagination using returned `pageInfo.nextCursor`.
- Render:
  - total holdings value by account/currency where available,
  - allocation bars or compact distribution by security/account,
  - responsive holdings table/list,
  - responsive activity table/list,
  - empty states for accounts with no holdings or no activity.
- Preserve the frontend table ergonomics from `InvestmentHoldingsTable.tsx` and `InvestmentActivityTable.tsx`: mobile list rows, desktop scrollable tables, truncated long security names, and right-aligned numeric columns.

Exit criteria:

- A user can filter by account, sort holdings, search securities, change holding date mode, and page through activity.
- The pane remains usable when there are no holdings, no activity, or partial provider data.
- Non-App clients still receive holdings and first-page activity fallback data from `show_portfolio_viewer`.
- MCP app browser validation covers sorting, filtering, pagination, desktop/mobile tables, and no console errors.

### 5. Make Category Rule Workbench Interactive

Implementation tasks:

- Build Category Rule Workbench state around:
  - `show_category_rule_workbench`
  - `list_categories`
  - `list_analysis_rules`
  - `list_categorization_rules`
  - `list_categorization_rule_recommendations`
  - optionally `get_cashflow_analysis_audit` when a date range is supplied for rule effects.
- Add tabs or segmented controls for:
  - Categories
  - Analysis Rules
  - Categorization Rules
  - Recommendations
  - Audit Effects
- Add controls for:
  - search,
  - archived/active filtering where tool data exposes it,
  - rule status filtering,
  - category primary/detailed filters,
  - date range for audit effects.
- Render read-only detail panels for:
  - category metadata and color,
  - analysis rule scopes,
  - categorization rule conditions,
  - recommendation preview reasons and proposed categories,
  - audit rows for matched transactions and neutralization effects.
- Explicitly omit mutating actions. Do not surface "accept", "dismiss", "apply", "create", "edit", or "archive" controls in the MCP pane.

Exit criteria:

- A user can switch tabs, search, filter, open rule/category details, and load audit effects for a date range.
- Recommendations are inspectable but cannot be accepted or dismissed from the MCP pane.
- Non-App clients still receive category, rule, and recommendation fallback data from `show_category_rule_workbench`.
- MCP app browser validation covers all tabs, search, detail panels, audit date range, mobile layout, and no console errors.

### 6. Documentation, Tests, And Host Validation

Implementation tasks:

- Update `MCP_GUIDE` in `backend/src/mcp/mcp.service.ts` or the extracted guide seam to describe the interactive panes and their read-only boundaries.
- Update backend MCP documentation, currently referenced from `backend/README.md`, with:
  - current app pane catalog,
  - the host-support fallback behavior,
  - bridge/CSP expectations,
  - which panes call which read-only MCP tools.
- Extend `backend/test/mcp/mcp.service.spec.ts` or add `backend/test/mcp/mcp-apps.spec.ts` for:
  - all four app resources include the shared runtime,
  - app resources include restrictive `_meta.ui.csp`,
  - app resources avoid accidental secret/PAT strings,
  - all app tool metadata remains stable,
  - app tool fallback data remains schema-valid.
- Add a small app-resource extraction fixture for browser validation, such as `backend/test/mcp/fixtures/render-mcp-app-resource.ts`, that writes each returned HTML resource to `/tmp` with deterministic fixture data.
- Use `$agent-browser` for browser-observable validation:
  - load every extracted app resource,
  - verify nonblank rendering,
  - click each pane's core controls,
  - inspect console errors,
  - repeat at desktop and mobile viewport widths.
- If a frontend/Vite bundle is introduced, add explicit commands and keep generated app bundles out of hand-edited source paths. Do not hand-edit `frontend/src/api/**` or `frontend/src/routeTree.gen.ts`.

Exit criteria:

- Documentation reflects the actual interactive pane behavior and read-only limits.
- MCP tests cover app resource shape, tool metadata, fallback data, and resource safety.
- Browser validation evidence exists for all four panes across desktop and mobile widths.
- Backend validation passes.
- Frontend validation passes only if the implementation introduces frontend code or a frontend-built bundle.

## Tests

### Backend

- Extend `backend/test/mcp/mcp.service.spec.ts` or add `backend/test/mcp/mcp-apps.spec.ts` to cover resource registration, tool metadata, resource MIME type, `_meta.ui.csp`, runtime presence, no secret strings, and stable app ids/URIs.
- Add focused tests for every app-backed tool's structured fallback data:
  - `show_cashflow_explorer`
  - `show_projection_scenario_modeler`
  - `show_portfolio_viewer`
  - `show_category_rule_workbench`
- Add app renderer tests for deterministic HTML output when fixture data is supplied.
- Keep existing MCP client harness coverage with `@modelcontextprotocol/sdk` `Client` and `InMemoryTransport`.

### Frontend

- No frontend tests are required if the implementation stays backend-served and self-contained.
- If a frontend/Vite bundle is introduced for MCP Apps, add focused Vitest coverage for app data mappers and state reducers, not low-value CSS declaration tests.
- Do not hand-edit generated frontend API files.

### Browser

- Use `$agent-browser` to validate the rendered MCP app HTML resources because this work is browser-visible.
- Validate desktop and mobile widths for each pane.
- Check console errors, nonblank content, keyboard/click interaction, long labels, empty states, loading states, and error states.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/mcp
cd backend && yarn typecheck
cd backend && yarn lint
```

Frontend, only if frontend code or a frontend-built app bundle is introduced:

```bash
cd frontend && yarn test
cd frontend && yarn typecheck
cd frontend && yarn lint
cd frontend && yarn build
```

Browser:

```bash
# Use the repo's MCP app resource extraction fixture, then validate with $agent-browser.
```

## Overall Exit Criteria

- All four current MCP App panes are interactive in an MCP Apps-capable host or extracted browser fixture.
- All four panes remain useful for non-App clients through their existing structured fallback output.
- Every bridge-backed action calls only existing read-only MCP tools.
- The panes do not expose mutating controls, credentials, PATs, session cookies, or raw provider payload secrets.
- App resources have restrictive CSP metadata and no external script/resource origins unless explicitly justified by the bridge implementation.
- Desktop and mobile browser validation passes with no console errors and no incoherent text/layout overlap.
- `cd backend && yarn test test/mcp`, `cd backend && yarn typecheck`, and `cd backend && yarn lint` pass.
- Frontend validation commands pass if frontend code or a frontend-built bundle is added.
