# Account Activity And Investment Transactions Clean Model

## Status

Planned

## Goal

Build the clean target model for account activity by introducing a real shared `account_activity` spine, splitting banking transactions and investment transactions into separate domain detail tables, syncing Plaid investment transactions as best-effort activity, and removing synthetic balance adjustments entirely.

This plan intentionally ignores migration cost. The goal is the best long-term domain model, not the smallest patch from the current schema.

## Current Behavior

- Banking/manual transactions are stored directly in `backend/src/transaction/transaction.entity.ts`.
  - The table combines shared activity fields (`userId`, `accountId`, provider ID, amount, provider dates) with banking-specific fields (`merchantName`, category, payment channel, Plaid PFC hints, counterparties, location, payment metadata).
  - `TransactionService.processSyncResults()` in `backend/src/transaction/transaction.service.ts` maps Plaid `/transactions/sync` rows into this table and emits `ProviderTransactionsSyncedEvent`.
- Manual transactions are also stored as `TransactionEntity` rows and participate in the Transactions page, categories, analysis, and MCP.
- Investment holdings now live in `backend/src/investment/`.
  - `InvestmentSecurityEntity` stores provider securities.
  - `InvestmentHoldingSnapshotEntity` stores point-in-time current positions.
  - `InvestmentService.upsertPlaidHoldings()` treats holdings snapshots independently from banking transactions.
- Plaid investment transactions are not currently stored.
  - `PlaidProvider` explicitly recognizes `INVESTMENTS_TRANSACTIONS` webhooks in `BankLinkService.handleWebhook()` but logs and returns without syncing.
  - Prior IBKR validation showed Plaid investment transaction history is incomplete. Holdings are useful current-position data; investment transactions should be treated as best-effort activity, not as an authoritative performance ledger.
- Cash-flow analysis in `backend/src/transaction-analysis/transaction-analysis.service.ts` reads `TransactionEntity` and also synthesizes balance adjustments from balance snapshots.
  - The clean target model removes this balance adjustment concept entirely.
- The frontend Transactions route (`frontend/src/routes/_authed/transactions.tsx`) and `TransactionsTable` are built around banking transactions, categories, merchant metadata, manual edits, and bulk category workflows.
- MCP exposes banking transaction and cashflow tools through `backend/src/mcp/mcp.service.ts` and `backend/src/mcp/mcp-read.service.ts`, including balance-adjustment-aware guidance and tools that must be removed or rewritten.

## Target Data Shape

Use a physical shared activity table plus domain-specific one-to-one detail tables.

```ts
type AccountActivityKind = 'banking_transaction' | 'investment_transaction'
type AccountActivityProvider = 'plaid' | 'manual'

type AccountActivity = {
  id: string
  userId: string
  accountId: string
  provider: AccountActivityProvider
  externalActivityId: string | null
  activityKind: AccountActivityKind
  activityDate: string
  providerDate: string
  providerDatetime: string | null
  amount: MoneyWithSign
  createdAt: Date
  updatedAt: Date
}

type BankingTransaction = {
  id: string
  activityId: string
  source: 'provider' | 'manual'
  merchantName: string | null
  providerTransactionName: string | null
  originalDescription: string | null
  pending: boolean
  pendingTransactionId: string | null
  accountOwner: string | null
  logoUrl: string | null
  website: string | null
  merchantEntityId: string | null
  paymentChannel: string | null
  transactionCode: string | null
  personalFinanceCategoryIconUrl: string | null
  personalFinanceCategoryConfidenceLevel: string | null
  providerCategoryProvider: 'plaid' | null
  providerCategoryPrimary: string | null
  providerCategoryDetailed: string | null
  counterparties: Array<Record<string, unknown>> | null
  location: Record<string, unknown> | null
  paymentMeta: Record<string, unknown> | null
  authorizedDate: string | null
  authorizedDatetime: string | null
  reportingDateOverride: string | null
  categoryId: string | null
  categoryUpdatedAt: Date | null
  providerPayload: Record<string, unknown> | null
}

type InvestmentTransaction = {
  id: string
  activityId: string
  securityId: string | null
  externalSecurityId: string | null
  name: string
  quantity: string
  price: string
  fees: string | null
  investmentType: string
  investmentSubtype: string
  cancelExternalActivityId: string | null
  providerPayload: Record<string, unknown> | null
}
```

Key invariants:

- `account_activity.amount` always means account cash impact in the activity currency.
  - For Plaid banking transactions, invert Plaid `amount` as the app does today.
  - For Plaid investment transactions, invert Plaid `InvestmentTransaction.amount`; Plaid documents positive values as cash debited and negative values as cash credited.
- Holdings snapshots and investment transactions remain independent.
  - Holdings snapshots are current-position facts.
  - Investment transactions are best-effort provider activity rows.
- `/transactions` returns banking transactions only.
- Investment activity appears in investment-specific surfaces and explicitly labeled account activity feeds only.
- Balance adjustments are removed from API contracts, UI, MCP, and analysis behavior.

## Milestones

### 1. Account Activity Spine

Implementation tasks:

- Add `backend/src/account-activity/account-activity.entity.ts`, `account-activity.module.ts`, and supporting domain types in `backend/src/types/AccountActivity.ts`.
- Model `AccountActivityEntity` with:
  - `userId`, `accountId`, `provider`, `externalActivityId`, `activityKind`, `activityDate`, `providerDate`, `providerDatetime`, and embedded `BalanceColumns amount`.
  - uniqueness for provider rows: `userId`, `accountId`, `provider`, `externalActivityId`, where `externalActivityId` is non-null.
  - joins to `AccountEntity`.
- Add an `AccountActivityService` for shared ownership checks, external account mapping helpers, amount normalization helpers, and idempotent activity upserts.
- Register the module in `backend/src/app.module.ts`.
- Add a migration creating the activity table and indexes for:
  - `userId`, `activityDate`, `id`
  - `accountId`, `activityDate`
  - provider identity lookup.

Exit criteria:

- Migration test covers table creation, uniqueness, and rollback.
- `cd backend && yarn test test/account-activity`
- `cd backend && yarn typecheck`

### 2. Banking Transaction Detail Model

Implementation tasks:

- Replace the monolithic `TransactionEntity` shape with:
  - `AccountActivityEntity` for shared fields.
  - `BankingTransactionEntity` for banking/manual-specific fields.
- Keep public `Transaction` API behavior banking-only by composing `AccountActivityEntity` plus `BankingTransactionEntity` in `TransactionService`.
- Preserve current transaction endpoints in `backend/src/transaction/transaction.controller.ts`:
  - `GET /transaction`
  - manual create/update/delete endpoints
  - category update and bulk category update endpoints.
- Update `TransactionService.findAllPaginated()`, manual transaction operations, category updates, and `processSyncResults()` to read/write through the activity spine.
- Keep manual transactions as banking transactions:
  - `account_activity.provider = 'manual'`
  - `externalActivityId = null`
  - `banking_transaction.source = 'manual'`.
- Move Plaid raw banking payload storage into `banking_transaction.providerPayload`.
- Preserve `ProviderTransactionsSyncedEvent` for new provider banking transactions.

Exit criteria:

- Existing transaction controller/service tests pass after being rewritten for the composed model.
- Manual transaction create/update/delete behavior is unchanged from the frontend perspective.
- Provider sync remains idempotent for added, modified, removed, and pending-to-posted banking rows.
- `cd backend && yarn test test/transaction test/bank-link`

### 3. Remove Synthetic Balance Adjustments

Implementation tasks:

- Remove balance adjustment generation and drilldown behavior from `backend/src/transaction-analysis/transaction-analysis.service.ts`.
- Remove `getBalanceAdjustments()` and the `GET /transaction-analysis/balance-adjustments` endpoint from `backend/src/transaction-analysis/transaction-analysis.controller.ts`.
- Update `backend/src/types/TransactionAnalysis.ts`:
  - remove `BalanceAdjustment`, `BalanceAdjustmentFlowDirection`, balance adjustment query/response schemas, and `balanceAdjustments` from `TransactionAnalysisResponse`.
- Update analysis aggregation so it only reports real banking transactions after rules and neutralization.
- Remove frontend balance-adjustment UI:
  - `frontend/src/components/BalanceAdjustmentsTable.tsx`
  - balance adjustment branch in `frontend/src/components/CategoryTransactionsModal.tsx`
  - balance-adjustment logic in `frontend/src/components/analysis/AnalysisSankeyChart.tsx`.
- Update MCP guidance and tools:
  - remove `list_cashflow_balance_adjustments`.
  - remove wording that cashflow includes synthetic balance adjustments.
  - update `get_cashflow_analysis` output shape.

Exit criteria:

- Analysis API response no longer contains `balanceAdjustments`.
- Category drilldowns no longer special-case `BALANCE_ADJUSTMENT`.
- MCP no longer exposes or documents balance adjustment tools.
- `cd backend && yarn test test/transaction-analysis test/mcp`
- `cd frontend && yarn test src/routes/_authed/analysis.test.tsx src/components/CategoryTransactionsModal.test.tsx src/components/analysis/AnalysisSankeyChart.test.tsx`

### 4. Plaid Investment Transaction Sync

Implementation tasks:

- Add investment transaction provider types in `backend/src/types/Investment.ts`:
  - normalized provider investment transaction rows.
  - investment transaction sync request/response metadata.
- Extend `IBankLinkProvider` with `syncInvestmentTransactions(authentication, startDate, endDate)`.
- Implement Plaid `/investments/transactions/get` in `PlaidProvider`:
  - page with `count` and `offset`.
  - request up to the chosen lookback range.
  - map `investment_transaction_id`, `account_id`, `security_id`, `date`, `name`, `quantity`, `amount`, `price`, `fees`, `type`, `subtype`, and currency fields.
  - preserve provider payload.
- Add `InvestmentTransactionEntity` under `backend/src/investment/`.
  - one-to-one with `AccountActivityEntity`.
  - nullable FK to `InvestmentSecurityEntity`.
  - stores `externalSecurityId` even when security mapping is missing.
- Extend `InvestmentService` with `upsertPlaidInvestmentTransactions()`.
  - upsert securities from Plaid response using existing deduped security upsert behavior.
  - upsert `account_activity` rows with `activityKind = 'investment_transaction'`.
  - upsert `investment_transaction` detail rows.
  - use `account_activity.amount` as inverted Plaid investment transaction amount.
- Add `BankLinkService.syncInvestmentTransactions()` and `syncAllInvestmentTransactions()`.
  - skip providers without support.
  - skip bank links without investment accounts.
  - use a rolling lookback window because Plaid investment transactions are date-range based, not cursor based.
  - store sync metadata on `bankLink.authentication` or a typed provider sync state if that exists by implementation time.
- Wire Plaid `INVESTMENTS_TRANSACTIONS` webhook to trigger investment transaction sync instead of logging and returning.
- Add a manual endpoint, e.g. `POST /bank-link/sync-all-investment-transactions`, returning synced/failed/skipped counts.

Exit criteria:

- Plaid provider tests cover pagination, amount sign inversion, security mapping, cash-only rows, and provider payload persistence.
- Bank link service tests cover skip/failure counts and webhook handling.
- Investment service tests cover idempotent upsert, missing security mapping, duplicate securities, and same external transaction update.
- `cd backend && yarn test test/investment test/bank-link`

### 5. Investment Activity API

Implementation tasks:

- Add public Zod schemas for investment activity responses in `backend/src/types/Investment.ts`.
- Add investment activity endpoints to `InvestmentController` or a dedicated `InvestmentActivityController`:
  - `GET /investment/account/:accountId/activity`
  - optional `GET /investment/activity` with account/date/type filters.
- Return investment detail plus shared activity fields:
  - `activityDate`, cash-impact amount, account name, security, quantity, price, fees, type/subtype, provider name, and raw provider description.
- Ensure ownership checks use `userId` and account ownership.
- Do not expose `providerPayload` by default; keep it internal unless a debugging endpoint is explicitly added later.

Exit criteria:

- Controller tests cover ownership, empty results, filters, pagination, and response shape.
- Generated OpenAPI includes investment activity schemas and endpoints.
- `cd backend && yarn test test/investment`

### 6. Frontend Investment Activity Surface

Implementation tasks:

- Regenerate frontend API client with `cd frontend && yarn orval` after backend OpenAPI changes.
- Add investment activity hooks under `frontend/src/hooks/` or use generated hooks directly.
- Add `frontend/src/components/investments/InvestmentActivityTable.tsx`.
  - Columns: date, security/name, type/subtype, quantity, price, fees, cash impact.
  - Use existing money formatting and privacy masking conventions.
  - Do not include category controls.
- Add investment account modal section or tab in `frontend/src/components/AccountModal.tsx`.
  - Keep Holdings and Activity visually distinct.
  - Empty state should say provider activity is unavailable or incomplete, not imply there were no real-world trades.
- Add a larger investments route only if needed after modal validation; otherwise keep v1 scoped to account modal activity.

Exit criteria:

- Investment accounts can show holdings and activity without changing the `/transactions` page.
- Hidden-balance mode masks cash impact, price, and fees while keeping security names, tickers, type/subtype, and quantities visible unless product decisions later say otherwise.
- `cd frontend && yarn test src/components/investments`
- `$agent-browser` validation against local dev:
  - open an investment account modal.
  - verify Holdings and Activity sections render.
  - verify empty/loading/error states.
  - verify hidden-balance masking.
  - capture desktop and mobile screenshots.

### 7. Account Activity Feed

Implementation tasks:

- Add an explicitly labeled combined account activity API:
  - `GET /account/:accountId/activity`
  - returns discriminated rows for `banking_transaction` and `investment_transaction`.
- Use the `account_activity` table for sorting, pagination, and filtering.
- Add a combined account activity UI only inside account-specific contexts.
  - Do not add investment rows to `/transactions`.
  - Use discriminated rendering so investment rows do not show category or merchant controls.

Exit criteria:

- Combined feed returns stable cursor/page behavior across banking and investment rows.
- UI labels investment and banking rows clearly.
- `cd backend && yarn test test/account-activity`
- `$agent-browser` validation for account modal/feed interaction.

### 8. MCP, Notifications, And Contracts

Implementation tasks:

- Keep existing MCP `list_transactions` banking-only and update descriptions to say so.
- Add a new MCP tool for investment activity only if useful:
  - `list_investment_activity`
  - include warning that provider history can be incomplete.
- Keep new-synced banking transaction notifications wired to banking transaction sync only.
- Decide whether investment activity sync needs a separate notification type. Default to no notification in v1.
- Regenerate frontend API clients and remove generated balance adjustment models after backend contract changes.

Exit criteria:

- MCP tests cover banking-only transaction listing and absence of balance adjustment tools.
- Notification tests confirm investment activity sync does not trigger banking new transaction notifications.
- `cd backend && yarn test test/mcp test/notification`
- `cd frontend && yarn orval`
- `cd frontend && yarn typecheck`

## Tests

### Backend

- `test/account-activity/account-activity.service.spec.ts`
  - shared activity upsert, ownership, cursor ordering, provider identity uniqueness.
- `test/transaction/transaction.service.spec.ts`
  - banking/manual transaction behavior through `AccountActivityEntity`.
  - pending-to-posted provider update.
  - manual transaction CRUD.
  - category update and bulk update.
- `test/investment/investment.service.spec.ts`
  - investment transaction upsert, security mapping, missing security, duplicate securities, cash-only transactions.
- `test/bank-link/plaid.provider.spec.ts`
  - `/investments/transactions/get` pagination and mapping.
- `test/bank-link/bank-link.service.spec.ts`
  - manual sync-all investment transactions.
  - `INVESTMENTS_TRANSACTIONS` webhook sync.
  - skip and failure counts.
- `test/transaction-analysis/transaction-analysis.service.spec.ts`
  - analysis excludes investment activity.
  - synthetic balance adjustments are gone.
- `test/mcp`
  - banking transaction tools remain banking-only.
  - balance adjustment tool is removed.

### Frontend

- `frontend/src/components/investments/InvestmentActivityTable.test.tsx`
  - renders security, type, quantity, price, fees, cash impact.
  - loading, error, empty, hidden-balance states.
- `frontend/src/components/AccountModal.test.tsx`
  - investment account renders Holdings and Activity sections.
  - non-investment accounts do not fetch investment activity.
- `frontend/src/routes/_authed/transactions.test.tsx`
  - Transactions page continues to query banking transactions only.
- `frontend/src/routes/_authed/analysis.test.tsx`
  - analysis response no longer expects balance adjustments.
- `frontend/src/components/CategoryTransactionsModal.test.tsx`
  - no balance-adjustment branch.
- `frontend/src/components/analysis/AnalysisSankeyChart.test.tsx`
  - no balance-adjustment category handling.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/account-activity test/transaction test/investment test/bank-link test/transaction-analysis test/mcp test/notification
cd backend && yarn typecheck
cd backend && yarn lint
cd backend && yarn migration:show
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/components/investments src/components/AccountModal.test.tsx src/routes/_authed/transactions.test.tsx src/routes/_authed/analysis.test.tsx src/components/CategoryTransactionsModal.test.tsx src/components/analysis/AnalysisSankeyChart.test.tsx
cd frontend && yarn typecheck
cd frontend && yarn lint
```

Browser:

```bash
$agent-browser against local dev server
```

Required browser checks:

- Investment account modal shows holdings and investment activity as separate sections.
- Hidden balances masks cash impact, price, and fees.
- Non-investment accounts do not fetch investment activity.
- Transactions page remains banking/manual-only.
- Analysis page no longer renders balance-adjustment categories or drilldowns.

## Overall Exit Criteria

- The database has a real `account_activity` spine with separate banking and investment transaction detail tables.
- `/transactions`, category workflows, manual transaction workflows, banking sync, cashflow analysis, and MCP transaction listing remain banking/manual-only.
- Plaid investment transactions sync into `investment_transaction` plus `account_activity` without affecting normal cashflow analysis.
- Plaid `INVESTMENTS_TRANSACTIONS` webhooks trigger investment transaction sync.
- Investment holdings snapshots continue to be independent from investment transactions.
- Synthetic balance adjustments are completely removed from backend, frontend, generated API contracts, MCP, and tests.
- Frontend investment account UI surfaces holdings and best-effort activity with clear empty/error language.
- Backend and frontend targeted tests, typechecks, lints, API generation, and browser validation pass.

## Risks And Open Questions

- Plaid IBKR investment transaction coverage is known to be incomplete. Product copy must avoid implying a complete ledger.
- `account_activity` uniqueness with `externalActivityId = null` needs careful handling for manual transactions; manual rows should use internal IDs and not rely on provider uniqueness.
- Investment transaction cancellations may require post-v1 linking from `cancelExternalActivityId` to an `account_activity.id` after both rows exist.
- Existing notification semantics should stay banking-only unless a separate investment-activity notification type is explicitly designed.
- Removing balance adjustments changes analysis totals. This is intentional per product decision, but release notes should call it out.
