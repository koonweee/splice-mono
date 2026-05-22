# Investment Holdings Snapshots And UI

## Status

Planned

## Goal

Persist Plaid investment holdings as first-class, date-stamped position snapshots while preserving existing account-level balance snapshots as the source of net worth totals. Surface latest investment positions in the UI so a user can inspect holdings behind an investment account balance.

Assumption from the grill step: holdings should be stored in separate position snapshot rows keyed by account, date, and security. Do not embed holdings JSON inside `balance_snapshot_entity`, and do not replace account-level balance snapshots with holdings-derived totals in the first implementation.

Final grill decisions:

- Store daily historical holding snapshots indefinitely. Upsert same-day rows by `(accountId, snapshotDate, securityId)` instead of storing intraday snapshots.
- Sync holdings after initial link completion, after manual account conversion, on Plaid `HOLDINGS: DEFAULT_UPDATE` webhooks, and through an explicit backend backfill/manual sync endpoint. Do not fetch holdings on every ordinary account or transaction sync in the first implementation.
- Do not add reconciliation metadata or warnings in the first implementation. Holdings are supporting position detail only.
- Persist normalized fields and provider IDs needed for idempotency; do not persist raw Plaid holding or security payloads.
- Implement generic Plaid investment holdings support, with IBKR as the first validation case.
- Historical holding data starts from the first successful holdings fetch. Do not reconstruct older holdings from Plaid investment transactions or other inferred sources.
- Keep manual/backfill sync backend-only in the first cut. Do not add a user-facing refresh button.
- In hidden-balances mode, mask monetary holding values only. Security names, tickers, and quantities can remain visible inside the account modal.
- Surface holdings only inside the account modal in the first cut. Defer row badges and Accounts-page expansion.
- Store cost basis if Plaid provides it, but do not show cost basis or unrealized gain/loss in the first UI until provider reliability is validated.

## Current Behavior

- Plaid Link requests `transactions` as a required product and `investments` as an optional product in `backend/src/bank-link/providers/plaid/plaid.provider.ts`.
- `PlaidProvider.getAccounts()` calls `/accounts/get` and maps only account-level balances into `APIAccount`.
- `BankLinkService.syncAccounts()` upserts `AccountEntity` rows, emits `LinkedAccountEvents.CREATED` / `UPDATED`, and `BalanceSnapshotListener` writes one `BalanceSnapshotEntity` row per account/date.
- `PlaidProvider.parseUpdateWebhook()` recognizes `HOLDINGS: DEFAULT_UPDATE`, but `BankLinkService.handleUpdateWebhook()` only calls `syncAccounts()` for holdings webhooks. It does not fetch or persist holdings.
- Existing balance history and net worth APIs are account-balance oriented:
  - `backend/src/balance-snapshot/balance-snapshot.entity.ts`
  - `backend/src/balance-query/balance-query.service.ts`
  - `backend/src/balance-query/balance-history-surface.service.ts`
- The Home page and account modal consume generated balance query hooks through `frontend/src/hooks/useBalanceData.ts`, `frontend/src/lib/balance-utils.ts`, `frontend/src/components/AccountSection.tsx`, `frontend/src/components/CompactAccountRow.tsx`, and `frontend/src/components/AccountModal.tsx`.
- The Accounts page lists linked accounts by institution through `frontend/src/routes/_authed/accounts.tsx`, `frontend/src/components/accounts/InstitutionSection.tsx`, and `frontend/src/components/accounts/AccountRow.tsx`.
- Local investigation showed Plaid IBKR holdings are available while investment transactions are incomplete. This plan therefore treats holdings as reliable current-position data and does not depend on Plaid investment transactions.

## Target Data Shape

Add a backend investment domain under `backend/src/investment/`.

```ts
type InvestmentSecurity = {
  id: string
  userId: string
  provider: 'plaid'
  externalSecurityId: string
  institutionId: string | null
  institutionSecurityId: string | null
  name: string | null
  tickerSymbol: string | null
  isin: string | null
  cusip: string | null
  sedol: string | null
  type: string | null
  subtype: string | null
  isCashEquivalent: boolean | null
  closePrice: string | null
  closePriceAsOf: string | null
  updateDatetime: string | null
  isoCurrencyCode: string | null
  unofficialCurrencyCode: string | null
  marketIdentifierCode: string | null
  sector: string | null
  industry: string | null
}

type InvestmentHoldingSnapshot = {
  id: string
  userId: string
  accountId: string
  securityId: string
  provider: 'plaid'
  snapshotDate: string
  quantity: string | null
  costBasis: string | null
  institutionPrice: string | null
  institutionPriceAsOf: string | null
  institutionPriceDatetime: string | null
  institutionValue: string | null
  isoCurrencyCode: string | null
  unofficialCurrencyCode: string | null
  vestedQuantity: string | null
  vestedValue: string | null
  security: InvestmentSecurity
}
```

Database constraints:

- `investment_security_entity`: unique on `(userId, provider, externalSecurityId)`.
- `investment_holding_snapshot_entity`: unique on `(accountId, snapshotDate, securityId)`.
- Use `numeric` columns for Plaid decimal values such as quantity, price, cost basis, and value, and serialize them as strings in APIs to avoid precision loss.
- Do not store raw Plaid holding/security payloads.
- Keep `balance_snapshot_entity` unchanged. Account-level `currentBalance` continues to drive net worth and charts.

## Milestones

### 1. Backend Investment Model And API Contracts

Implementation tasks:

- Add `backend/src/types/Investment.ts` with registered Zod schemas for securities, holding snapshots, latest holdings responses, and optional date query params.
- Add `backend/src/investment/investment-security.entity.ts` and `backend/src/investment/investment-holding-snapshot.entity.ts`.
- Add a TypeORM migration after `1776800000000-AddRefreshTokenRotationMetadata.ts` creating both tables, indexes, FKs to `user_entity` and `account_entity`, and uniqueness constraints.
- Add `backend/src/investment/investment.service.ts` with:
  - `upsertPlaidHoldings(userId, accountIdMap, snapshotDate, response)` to upsert securities and holding snapshots.
  - `findLatestHoldingsForAccount(userId, accountId)` to return the newest snapshot date for an account.
  - `findHoldingsForAccountOnDate(userId, accountId, snapshotDate)` for historical lookup.
- Add `backend/src/investment/investment.controller.ts`:
  - `GET /investment/account/:accountId/holdings/latest`
  - `GET /investment/account/:accountId/holdings?snapshotDate=YYYY-MM-DD`
- Add `backend/src/investment/investment.module.ts` and import/export it where needed.

Exit criteria:

- Migration creates and drops the tables cleanly.
- `InvestmentService` rejects or returns empty results for accounts not owned by the current user.
- OpenAPI includes the new investment schemas and endpoints.

### 2. Plaid Holdings Sync

Implementation tasks:

- Extend `backend/src/bank-link/providers/bank-link-provider.interface.ts` with optional `syncInvestmentHoldings(authentication)` returning provider-normalized accounts, holdings, and securities.
- Add Plaid mapping in `backend/src/bank-link/providers/plaid/plaid.provider.ts` using `client.investmentsHoldingsGet({ access_token })`.
- Parse `INVESTMENTS_TRANSACTIONS` webhooks as a known no-op or future type, so logs distinguish unsupported transaction history from unknown webhooks.
- Inject `InvestmentService` into `BankLinkService` by importing `InvestmentModule` in `backend/src/bank-link/bank-link.module.ts`.
- Add `BankLinkService.syncInvestmentHoldings(bankLinkId, userId)`:
  - verify the bank link belongs to the user.
  - call the provider method only when supported.
  - map Plaid external account IDs to internal `AccountEntity.id`.
  - use the user's timezone to choose the same `YYYY-MM-DD` snapshot date convention as `BalanceSnapshotListener`.
  - upsert holdings through `InvestmentService`.
- Call `syncInvestmentHoldings()` after successful account sync for investment-capable links:
  - after new Plaid link completion.
  - after manual-account conversion to Plaid.
  - when `handleUpdateWebhook()` receives `HOLDINGS`.
- Add an explicit backend-only user-scoped backfill/manual sync endpoint for existing links.
- Keep `/investments/refresh` out of automated sync. The current Plaid account is not authorized for `investments_refresh`, and refresh has separate billing.

Exit criteria:

- `HOLDINGS: DEFAULT_UPDATE` creates or updates position snapshots without changing `balance_snapshot_entity`.
- Non-investment Plaid Items and providers without holdings support skip holdings sync without failing account sync.
- Logs include counts of mapped accounts, securities, and holdings, but do not log raw holdings payloads or access tokens.

### 3. Snapshot Semantics And Balance Integration

Implementation tasks:

- Keep `BalanceSnapshotEntity` and `BalanceQueryService` API shapes unchanged for the first slice.
- Use account-level `currentBalance` from Plaid `/accounts/get` as the account total for net worth and account balance charts.
- Treat holding snapshots as a drilldown of a balance snapshot date, not as the canonical account total.
- Do not add reconciliation metadata, warnings, or blocking checks in the first implementation.

Exit criteria:

- Existing balance query tests continue to pass without generated API changes to balance query models.
- Latest holdings for an account can be fetched for the same day as the account balance snapshot.
- The system can represent multiple currencies in holdings without forcing conversion at persistence time.

### 4. Frontend API Generation And Data Hooks

Implementation tasks:

- Regenerate frontend client files with `cd frontend && yarn orval` after backend OpenAPI exposes investment endpoints.
- Add a frontend hook, likely `frontend/src/hooks/useInvestmentHoldings.ts`, wrapping generated `useInvestmentController...` hooks and preserving disabled-query behavior when no account is selected.
- Extend `frontend/src/lib/format.ts` only as needed for compact quantity, price, and cost basis formatting. Reuse existing money formatting for `institutionValue` display.
- Add typed transformation helpers for:
  - latest holdings table rows.
  - position display values.

Exit criteria:

- Generated files under `frontend/src/api/**` are regenerated, not hand-edited.
- Hooks handle loading, error, empty holdings, and multi-currency holdings.
- Typecheck passes with generated investment models.

### 5. Account UI Surfaces

Implementation tasks:

- Add `frontend/src/components/investments/InvestmentHoldingsTable.tsx` and focused tests.
- Render latest holdings inside `frontend/src/components/AccountModal.tsx` for investment/brokerage accounts:
  - columns: security, ticker, quantity, price, value.
  - compact mobile layout using the existing dense account-modal style.
  - empty state for investment accounts with no holdings returned.
  - error state that does not hide the existing balance history.
- Do not add row badges, account-row fetching, or Accounts-page expansion in the first cut.
- Respect the existing home balance privacy toggle:
  - when balances are hidden, hide holding price and value.
  - security names/tickers and share quantities remain visible inside the account modal.

Exit criteria:

- Opening an IBKR investment account modal shows Plaid holdings from the latest snapshot.
- Balance history remains visible even if holdings fail to load.
- Hidden balances mode masks holding values consistently with account balances.
- `$agent-browser` validation covers desktop and mobile account-modal layouts with holdings, empty, loading, and error states.

### 6. Backfill, Operations, And Observability

Implementation tasks:

- Add a guarded endpoint or service method for holdings backfill:
  - `POST /bank-link/sync-all-investment-holdings`, scoped to current user.
  - optional `bankLinkId` support only if needed by the UI.
- Add structured logs around holdings sync counts and per-bank-link failures.
- Decide whether to include investment holdings in MCP. Initial plan: do not extend `McpReadService.listBalanceSnapshots()` because holdings are position snapshots, not balance snapshots. Add separate MCP tools later if needed.
- Document that Plaid investment transactions are not part of this implementation because IBKR returned incomplete investment transaction history.

Exit criteria:

- Existing `sync-all` behavior can populate holdings for already-linked Plaid Items.
- A failed holdings sync does not prevent account balances from syncing.
- Manual verification can compare latest Plaid holdings to the UI without exposing access tokens or raw provider IDs.

## Tests

### Backend

- `backend/test/bank-link/plaid.provider.spec.ts`
  - maps Plaid securities and holdings from `investmentsHoldingsGet`.
  - rejects invalid authentication.
  - parses `INVESTMENTS_TRANSACTIONS` webhooks into a known type or known no-op.
- `backend/test/bank-link/bank-link.service.spec.ts`
  - calls holdings sync for `HOLDINGS` webhooks.
  - skips holdings sync for unsupported providers.
  - does not fail transaction/account sync when holdings sync rejects.
  - maps external Plaid account IDs to internal account IDs before persistence.
- New `backend/test/investment/investment.service.spec.ts`
  - upserts securities idempotently.
  - upserts one holding snapshot per `(accountId, snapshotDate, securityId)`.
  - returns latest holdings scoped by user.
  - blocks cross-user account access.
  - preserves numeric precision as string API values.
- New `backend/test/investment/investment.controller.spec.ts`
  - validates latest and date-specific account holdings routes.
  - covers unauthorized/cross-user account access.
- Migration test or schema assertion for the two investment tables and uniqueness constraints.

### Frontend

- New `frontend/src/components/investments/InvestmentHoldingsTable.test.tsx`
  - renders holdings with security, ticker, quantity, price, and value.
  - handles cash-equivalent holdings.
  - handles missing ticker and multiple currencies.
  - masks values when balances are hidden.
- `frontend/src/components/AccountModal.test.tsx`
  - fetches and renders holdings for investment accounts.
  - does not fetch holdings for depository/credit accounts.
  - keeps balance history visible when holdings are loading or errored.
  - renders empty holdings state.
- Add or update route/component tests if Accounts page receives holdings affordances.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/investment/investment.service.spec.ts test/investment/investment.controller.spec.ts
cd backend && yarn test test/bank-link/plaid.provider.spec.ts test/bank-link/bank-link.service.spec.ts
cd backend && yarn typecheck
cd backend && yarn lint
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/components/investments/InvestmentHoldingsTable.test.tsx src/components/AccountModal.test.tsx
cd frontend && yarn typecheck
cd frontend && yarn lint
```

UI validation:

```bash
cd frontend && yarn dev
```

Use `$agent-browser` to verify:

- `/home` desktop account modal with IBKR holdings.
- `/home` mobile account modal with holdings table/list.
- hidden balances mode masks holding values.
- empty and error states do not break account balance history.

## Overall Exit Criteria

- Plaid investment holdings are persisted as date-stamped position snapshots for linked investment accounts.
- Existing account-level balance snapshots, net worth charts, analysis, and MCP balance snapshot reads keep their current behavior.
- `HOLDINGS: DEFAULT_UPDATE` and user-triggered sync can update holdings without requiring Plaid `investments_refresh`.
- The IBKR account modal shows latest positions with security, ticker, quantity, price, and value.
- No access tokens or raw holdings payloads are exposed in UI or logs.
- Backend tests, frontend tests, lint, typecheck, generated API client, and `$agent-browser` UI validation pass.

## Risks And Open Questions

- Plaid data quality: IBKR investment transactions are incomplete, so cost basis and holdings should be treated as provider-supplied current-position data, not a full performance ledger.
- Currency conversion: holdings can be USD while account balances are SGD or another currency. Persist provider currency values first; add converted per-holding values only after deciding how to price historical FX.
- Privacy: hidden balances masks monetary values, not share quantities or tickers. Add a separate positions privacy mode later only if needed.
