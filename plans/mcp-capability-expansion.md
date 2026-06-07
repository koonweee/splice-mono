# MCP Capability Expansion

## Status

Done

## Goal

Expand the read-only Splice MCP surface so AI clients can answer the same portfolio, forecasting, category, transaction-filtering, and rule-context questions that the web app already supports.

This plan covers all five recommended additions from the MCP audit:

- Investment holdings reads.
- Investment activity reads.
- Richer category metadata plus exact category transaction filters.
- Recurring manual transaction schedule reads.
- Analysis and categorization rule reads.

MCP should remain non-mutating. This plan does not add account linking, sync, backfill, balance updates, token management, notification changes, category/rule writes, manual transaction creation, or rule application through MCP.

## Current Behavior

- `backend/src/mcp/mcp.controller.ts` exposes a PAT-only Streamable HTTP MCP endpoint at `/mcp`; `GET` and `DELETE` return method-not-allowed responses.
- `backend/src/mcp/mcp.service.ts` registers one resource, `splice://mcp-guide`, and 10 tools: `get_user_context`, `get_accounts_snapshot`, `get_balance_history`, `search_transactions`, `list_transactions`, `list_balance_snapshots`, `list_categories`, `get_cashflow_analysis`, `list_cashflow_category_transactions`, and `get_cashflow_analysis_audit`.
- `backend/src/mcp/mcp-read.service.ts` owns raw paginated MCP reads for banking/manual transactions, balance snapshots, and category discovery. `list_transactions` filters by `categoryPrimary`, not exact category ID or detailed category.
- `backend/src/mcp/mcp.module.ts` currently registers `TransactionEntity`, `BalanceSnapshotEntity`, and `CategoryEntity` repositories, plus account, balance, currency, analysis, transaction, and user modules.
- The web app reads latest investment holdings and recent investment activity from account details through `frontend/src/components/AccountModal.tsx`, `frontend/src/hooks/useInvestmentHoldings.ts`, and `frontend/src/hooks/useInvestmentActivity.ts`. Backend endpoints already exist in `backend/src/investment/investment.controller.ts` and service methods in `backend/src/investment/investment.service.ts`.
- The web app manages recurring manual transaction schedules in `frontend/src/components/settings/RecurringManualTransactionsSection.tsx`; backend read support exists through `RecurringManualTransactionService.findAll()` and `RecurringManualTransactionController.findAll()`.
- The web app reads analysis rules, categorization rules, categorization recommendations, and category management inventories in `frontend/src/components/settings/AnalysisRulesSection.tsx`, `frontend/src/components/settings/CategorizationRulesSection.tsx`, and `frontend/src/components/settings/CustomCategoriesSection.tsx`.
- `backend/README.md` describes MCP as read-only but currently mentions "balance adjustment drilldowns", which no longer matches the registered tool list.

## Target Data Shape

MCP output should continue to return JSON-compatible structured content, with all `MoneyWithSign` values normalized through `normalizeMcpMoney()` into major units:

```ts
type McpMoney = {
  amount: number
  currency: string
  sign: 'positive' | 'negative'
}
```

New and updated MCP contracts should be implementation types in `backend/src/mcp/mcp-read.service.ts`, with tool schemas in `backend/src/mcp/mcp.service.ts`.

```ts
type McpListInvestmentHoldingsOptions = {
  accountIds?: string[]
  snapshotDate?: string
  latestOnly?: boolean
}

type McpInvestmentHolding = {
  id: string
  accountId: string
  accountName: string | null
  snapshotDate: string
  securityId: string
  securityName: string | null
  tickerSymbol: string | null
  type: string | null
  subtype: string | null
  quantity: string | null
  costBasis: string | null
  institutionPrice: string | null
  institutionValue: McpMoney | null
  currency: string | null
}

type McpListInvestmentActivityOptions = {
  accountIds?: string[]
  startDate?: string
  endDate?: string
  type?: string
  subtype?: string
  cursor?: string
  pageSize?: number
}

type McpListRecurringManualTransactionSchedulesOptions = {
  includePaused?: boolean
}

type McpListRulesOptions = {
  archived?: boolean
}
```

Implementation may adjust exact field names, but the exit criteria require account context, date context, security/category/rule labels, pagination where row counts can grow, and normalized money where a value represents money.

## Milestones

### 1. Add Investment Holdings MCP Reads

Implementation tasks:

- Import `InvestmentModule` or otherwise provide `InvestmentService` and required repositories to `McpModule`.
- Add `McpReadService.listInvestmentHoldings(userId, options)` using existing `InvestmentService.findLatestHoldingsForAccount()` and `findHoldingsForAccountOnDate()` where practical, or repository queries if multi-account latest snapshots need one efficient query.
- Add `list_investment_holdings` in `SpliceMcpService.TOOL_NAMES` and `createServer()`.
- Support `accountIds?: uuid[]`, `snapshotDate?: YYYY-MM-DD`, and `latestOnly?: boolean` with clear semantics:
  - Default should return latest holdings for all owned investment accounts with available snapshots.
  - `snapshotDate` should return holdings on that date.
  - If both `snapshotDate` and `latestOnly` are supplied, reject the request as ambiguous.
- Normalize money-like holdings values. `institutionValue`, `vestedValue`, and `costBasis` are decimal strings in `backend/src/types/Investment.ts`; convert only values with a currency into MCP money, and preserve original decimal strings when sign/currency is absent or ambiguous.
- Include account name, account ID, snapshot date, security name, ticker, security type/subtype, quantity, price, and value fields.
- Update `MCP_GUIDE` to mention holdings as portfolio-position data, distinct from account balance snapshots.

Exit criteria:

- `backend/test/mcp/mcp.service.spec.ts` proves the tool is registered and delegates to the read service.
- `backend/test/mcp/mcp-read.service.spec.ts` or a new focused `backend/test/mcp/mcp-investments.spec.ts` covers ownership scoping, latest/default behavior, `snapshotDate` behavior, and empty holdings.
- Existing investment controller/service tests still pass.

### 2. Add Investment Activity MCP Reads

Implementation tasks:

- Add `McpReadService.listInvestmentActivity(userId, options)` backed by `InvestmentService.findActivity()` or equivalent cursor-based repository reads.
- Add `list_investment_activity` in `SpliceMcpService.TOOL_NAMES` and `createServer()`.
- Prefer cursor pagination over page-index pagination for MCP consistency. If `InvestmentService.findActivity()` is reused directly, wrap it with a cursor-compatible MCP contract or explicitly document page-index behavior in the tool description.
- Support `accountIds?: uuid[]`, `startDate?: YYYY-MM-DD`, `endDate?: YYYY-MM-DD`, `type?: string`, `subtype?: string`, `cursor?: string`, and `pageSize?: number`.
- Validate `startDate <= endDate` when both are present.
- Include account context, activity/provider dates, security summary, amount, quantity, price, fees, investment type/subtype, and cancellation metadata.
- Keep this separate from `list_transactions`; banking/manual transaction cashflow and investment activity should not be mixed in one tool.

Exit criteria:

- MCP service tests include registration and delegation for `list_investment_activity`.
- Read-service tests cover date filtering, account filtering, pagination, security nullable cases, and money normalization.
- Tool descriptions explicitly say investment activity is not included in banking cashflow analysis.

### 3. Enrich Categories And Transaction Filters

Implementation tasks:

- Extend `McpCategory` in `backend/src/mcp/mcp-read.service.ts` to include exact category IDs, colors, archived state where relevant, and detailed category metadata. Preserve existing `primary`, `primaryLabel`, and `detailedCategories` fields for compatibility.
- Add optional `includeArchived?: boolean` and, if useful, `management?: boolean` to `list_categories`; use `CategoryService.findManagement()` or repository queries to include usage metadata such as `transactionCount` and `lastUsedAt` where the web app already has it.
- Extend `McpListTransactionsOptions` and the `list_transactions` input schema with:
  - `categoryId?: uuid | 'UNCATEGORIZED'`
  - `categoryDetailed?: string`
  - `amountSign?: 'positive' | 'negative'`
- Define precedence clearly:
  - `categoryId` is exact and should not be combined with `categoryPrimary` or `categoryDetailed`.
  - `categoryDetailed` may be combined with `categoryPrimary` only when they refer to the same user category namespace.
  - Existing `categoryPrimary` behavior remains supported.
- Update `buildTransactionQuery()` to apply exact category filters against `transaction.categoryId` and `category.detailed`.
- Update `search_transactions` only if needed for compatibility; `list_transactions` should be the primary analysis tool.
- Update docs and guide text so provider category hints remain guidance only and category filters are user-category filters.

Exit criteria:

- Existing MCP category and transaction tests continue to pass.
- New tests cover exact category ID filtering, detailed category filtering, uncategorized filtering, invalid filter combinations, archived category inclusion, and output metadata.
- `list_categories` remains backward-compatible for clients that only read primary category codes.

### 4. Add Recurring Manual Transaction Schedule MCP Reads

Implementation tasks:

- Import `RecurringManualTransactionModule` or provide `RecurringManualTransactionService` to `McpModule`.
- Add `McpReadService.listRecurringManualTransactionSchedules(userId, options)` or delegate directly from `SpliceMcpService` if no extra MCP-specific mapping is needed.
- Add `list_recurring_manual_transaction_schedules` in `SpliceMcpService.TOOL_NAMES` and `createServer()`.
- Return active schedules by default, matching `RecurringManualTransactionService.findAll()`.
- Add `includePaused?: boolean` only if the current service behavior does not already include paused-but-active schedules. Paused schedules should be visible enough for forecasting tools to explain whether they are excluded or pending.
- Include schedule ID, account ID/name, merchant, amount, category ID/labels/color, frequency, day of month, start/end dates, next occurrence, last generated occurrence, paused status, and archived status if included.
- Update `MCP_GUIDE` to tell clients to use schedules for user-known recurring cashflow assumptions before asking users to restate them.

Exit criteria:

- MCP service tests prove tool registration and delegation.
- Read-service or service-wrapper tests cover active schedules, paused schedules, archived exclusion, category/account labels, and money normalization.
- Documentation explicitly says schedules are projection inputs and not generated future transactions.

### 5. Add Rule Introspection MCP Reads

Implementation tasks:

- Import `AnalysisRuleModule` and transaction categorization modules into `McpModule`, or add a small read-only service that can access `AnalysisRuleService`, `TransactionCategorizationService`, and `CategorizationRuleRecommendationService`.
- Add these tools:
  - `list_analysis_rules`
  - `list_categorization_rules`
  - `list_categorization_rule_recommendations`
- Use a shared `archived?: boolean` option for rule lists, matching existing controllers.
- Keep all rule tools read-only. Do not expose create/update/archive, apply, generate, regenerate, accept, or dismiss operations through MCP in this plan.
- Return rule IDs, names, types, priorities, conditions/scopes, target category summaries, archived status, and timestamps.
- Include enough analysis rule scope context for an MCP client to explain the difference between `list_transactions` raw rows and `get_cashflow_analysis` rule-adjusted summaries.
- Include latest categorization recommendation generation status, pending suggestions, suggested rule draft, confidence/evidence fields as available from `backend/src/types/CategorizationRuleSuggestion.ts`, and target category context.
- Update `MCP_GUIDE` to recommend `list_analysis_rules` for explaining active rules and `get_cashflow_analysis_audit` for date-range-specific rule effects.

Exit criteria:

- MCP service tests prove all three tools are registered and delegate to the correct service.
- Tests cover active and archived rule listings, empty recommendation state, pending generation state, and pending suggestions.
- No MCP tool can mutate rules or recommendations.

### 6. Documentation, Generated API Awareness, And Cleanup

Implementation tasks:

- Update `backend/README.md` MCP section to list the new tools and remove or replace the stale "balance adjustment drilldowns" claim.
- Update `frontend/src/components/settings/McpConnectionSection.tsx` copy only if needed to describe the broader read surface; keep it concise because Settings already focuses on endpoint configuration.
- Update `frontend/src/components/settings/McpConnectionSection.test.tsx` if frontend copy changes.
- Update `plans/index.md` when this plan is created and again when status changes.
- Decide whether frontend generated API artifacts should change:
  - MCP itself is not represented as typed tools in Orval.
  - If any HTTP controllers or Zod schemas are changed for shared backing services, run `cd frontend && yarn orval`.
- Update `backend/test/mcp/mcp.service.spec.ts` expected tool list and `backend/test/mcp/mcp-read.service.spec.ts` coverage.
- Add or update documentation in the MCP guide resource for tool-use order, investment/cashflow separation, pagination, category filtering, and projection assumptions.

Exit criteria:

- `backend/README.md`, `MCP_GUIDE`, and Settings copy, if changed, agree on the MCP surface.
- `plans/index.md` includes this plan.
- No generated frontend files are hand-edited.

## Tests

### Backend

- Update `backend/test/mcp/mcp.service.spec.ts`:
  - Expected tool list includes the new tools.
  - Each new tool delegates with parsed and validated arguments.
  - `splice://mcp-guide` mentions investments, recurring schedules, category IDs, and rule introspection.
- Extend `backend/test/mcp/mcp-read.service.spec.ts` or split into focused files:
  - Investment holdings: latest/default, explicit date, all accounts, one account, no holdings, unauthorized account filtering or ownership checks.
  - Investment activity: date/account/type/subtype filters, pagination, security nullable rows, money normalization.
  - Transactions: `categoryId`, `categoryDetailed`, `amountSign`, invalid filter combinations, unchanged `categoryPrimary`, `UNCATEGORIZED`.
  - Categories: IDs, colors, detailed metadata, counts, archived inclusion.
  - Recurring schedules: active, paused, archived exclusion, money/category/account mapping.
  - Rules/recommendations: active/archived analysis rules, active/archived categorization rules, empty/pending recommendation states.
- Keep existing domain service tests for investment, recurring transactions, analysis rules, categorization rules, and categories passing.

### Frontend

- Frontend tests are only required if Settings MCP copy changes.
- If copy changes, update `frontend/src/components/settings/McpConnectionSection.test.tsx`.
- Do not add browser-visible UI tests for backend-only MCP tool additions; this plan does not add a new web UI workflow.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/mcp
cd backend && yarn test test/investment test/recurring-manual-transaction test/analysis-rule test/transaction-categorization test/category test/transaction/transaction.service.spec.ts
cd backend && yarn lint
```

Frontend, only if Settings copy or generated API artifacts change:

```bash
cd frontend && yarn test src/components/settings/McpConnectionSection.test.tsx
cd frontend && yarn typecheck
cd frontend && yarn lint
```

Generated API, only if implementation changes HTTP controller schemas:

```bash
cd frontend && yarn orval
```

## Overall Exit Criteria

- MCP remains PAT-only and read-only.
- AI clients can read investment holdings, investment activity, recurring manual transaction schedules, analysis rules, categorization rules, and categorization recommendations through MCP.
- MCP clients can filter transactions by exact category ID, detailed category, primary category, flow sign, account, merchant, activity date, pending state, and converted amount.
- MCP category discovery includes enough IDs, labels, colors, and usage metadata for exact category filters and readable explanations.
- Investment activity is clearly separated from banking/manual transaction cashflow in tool descriptions and documentation.
- Recurring schedules are presented as projection assumptions, not generated future transactions.
- Rule reads explain configured rule context, while `get_cashflow_analysis_audit` remains the date-range-specific explanation tool.
- `backend/README.md`, `MCP_GUIDE`, and any Settings copy consistently describe the available MCP surface.
- Focused backend MCP tests and relevant domain tests pass, and frontend validation passes if frontend files change.

## Risks And Open Questions

- Investment holdings currently expose decimal strings for quantities, prices, and values. Implementation must avoid pretending a decimal string is normalized money unless a currency and sign convention are explicit.
- Multi-account latest holdings may be inefficient if implemented by calling `findLatestHoldingsForAccount()` for every account. Prefer a repository query when the number of investment accounts can grow.
- `InvestmentService.findActivity()` uses page-index pagination today. MCP should use cursor pagination for consistency unless the implementation intentionally documents a page-index exception.
- Rule introspection can expose sensitive user behavior patterns to any holder of a personal access token. This matches existing MCP transaction access risk, but docs should continue to emphasize PAT handling.
- Documentation should avoid saying MCP mirrors every web-app action; it should describe a read-only analysis surface.
