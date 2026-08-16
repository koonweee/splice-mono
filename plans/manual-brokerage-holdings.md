# Manual Brokerage Holdings And Valuation

## Status

Done

## Implementation Report

Implemented and validated on 2026-08-16.

- Added holdings-valued manual brokerage accounts, Yahoo-backed US/SGX security search and quote resolution, durable last-good quote caching, mixed-currency normalization through the existing FX service, atomic snapshot replacement, manual refresh, and a batched weekday scheduler.
- Added the create/edit/clear/refresh UI, native and normalized holding values, quote as-of metadata, stale-price messaging, holdings-mode guards, responsive rendering, and regenerated API bindings.
- Recreated `Prime Account UI valuation test` through the local UI with `GOOGL 2`, `INTC 97`, `NVDA 7`, `TSM 8`, and `C6L.SI 200`. Live quotes produced a USD account value of `$16,724.40`; `C6L.SI` retained its `SGD 1,410.00` native value and normalized to `$1,103.18` at `0.7824 SGD→USD`.
- Verified all five saved positions in the editor, a fresh five-symbol manual refresh, persistence after reload, the dashboard/account balance, the latest balance-history point, desktop and mobile layouts, and browser runtime output. No browser errors or failed requests were observed; only an existing transient chart-size warning appeared while responsive containers changed size.
- Evidence is stored under `tmp/recordings/manual-brokerage/`, including the 3m28s H.264 MP4, full-speed source artifacts, desktop/mobile screenshots, and arithmetic worksheet.

## Goal

Let a user create a manual brokerage account by entering stock or ETF positions instead of a single balance. A position update is a complete snapshot of the shares held at that point; v1 does not infer or store trades, cost basis, realized/unrealized gains, dividends, or performance.

Resolve symbols and fetch prices server-side through `yahoo-finance2`. Preserve each holding's native quote currency, convert each position value into the brokerage account's selected valuation currency, and write the summed result into the account and its ordinary daily balance snapshot so existing account lists, net worth, currency conversion, and history continue to work.

The implementation must tolerate the unofficial Yahoo upstream: keep the last successful quote, never replace a known price with zero or null, show quote timestamps, and keep the provider behind an interface that can be replaced without changing portfolio logic.

## Current Behavior

- `backend/src/types/Account.ts`, `backend/src/account/account.entity.ts`, and `backend/src/account/account.service.ts` model every manual account as a directly entered balance. `AccountService.updateManualBalance()` keeps investment-account available balance at zero but has no way to distinguish a manually valued investment account from a holdings-valued brokerage.
- `backend/src/balance-snapshot/balance-snapshot.listener.ts` turns manual account creation and balance updates into one `BalanceSnapshotEntity` row per account and user-local date. `backend/src/balance-query/` and `frontend/src/lib/balance-utils.ts` already use those snapshots for account history, converted balances, and net worth.
- `backend/src/currency-exchange/currency-exchange.service.ts` stores/fetches dated fiat rates through Frankfurter, and `CurrencyConversionService` converts values in smallest currency units. This should remain the fiat conversion path; stock prices are market quotes, not currency exchange rates.
- `backend/src/investment/investment-security.entity.ts` and `backend/src/investment/investment-holding-snapshot.entity.ts` already persist user-owned securities and daily position snapshots. The holding uniqueness key `(accountId, snapshotDate, securityId)` already provides the required same-day overwrite behavior.
- `backend/src/investment/investment.service.ts` currently ingests Plaid holdings and serves latest/date-specific holdings. `backend/src/types/Investment.ts` currently uses `plaid` as the only provider value and has no manual write schemas or normalized holding value.
- `frontend/src/components/accounts/AddAccountModal.tsx` asks all manual accounts, including brokerage accounts, for one current balance. `frontend/src/components/AccountModal.tsx` offers `Update Balance` for every manual account and loads both holdings and provider activity for every investment account.
- `frontend/src/components/investments/InvestmentHoldingsTable.tsx` already renders native-currency price and value on desktop and mobile and masks monetary data when balances are hidden.
- The backend runs on Node 22, which is compatible with the current `yahoo-finance2` package. Yahoo access must remain backend-only; the browser should not call Yahoo directly.
- Existing manual and linked accounts must remain balance-valued after migration. Existing Plaid holdings remain supporting detail and must not start driving linked-account balances.

## Target Data Shape

Add an explicit account valuation discriminator and keep the default backward-compatible:

```ts
type AccountValuationMode = "balance" | "holdings";

type Account = {
  // existing fields
  valuationMode: AccountValuationMode;
};
```

Use a dedicated create contract for manual brokerages so the ordinary `POST /account` contract remains the balance-entry path:

```ts
type ManualBrokeragePositionInput = {
  // Canonical Yahoo symbol selected from backend search, e.g. AAPL or C6L.SI.
  symbol: string;
  // Positive decimal string; do not round fractional shares through a JS input number.
  quantity: string;
};

type CreateManualBrokerageAccountDto = {
  name: string;
  customName?: string | null;
  notes?: string | null;
  accountCurrency: string;
  positions: ManualBrokeragePositionInput[];
};

type ReplaceManualBrokerageHoldingsDto = {
  // Full replacement snapshot. An empty array is valid when clearing an account.
  positions: ManualBrokeragePositionInput[];
};

type ManualBrokeragePortfolioResponse = {
  account: Account;
  snapshot: InvestmentHoldingsResponse;
  // Symbols valued from a prior cached quote because the live refresh failed.
  staleSymbols: string[];
};
```

Split provider provenance instead of labeling Yahoo-derived securities as Plaid or manual:

```ts
type InvestmentSecurityProvider = "plaid" | "yahoo";
type InvestmentHoldingProvider = "plaid" | "manual";
type InvestmentActivityProvider = "plaid";
```

Extend manual holding snapshots with the exact normalization inputs/results while preserving the existing native fields:

```ts
type InvestmentHoldingSnapshot = {
  // Existing quantity, institutionPrice, institutionValue, and native currency.
  accountCurrency: string | null;
  exchangeRateToAccountCurrency: string | null;
  accountValue: string | null;
};

type InvestmentHoldingsResponse = {
  accountId: string;
  snapshotDate: string | null;
  accountCurrency: string | null;
  accountValue: MoneyWithSign | null;
  holdings: InvestmentHoldingSnapshot[];
};
```

For manual holdings, `institutionPrice` and `institutionValue` remain native-currency decimal strings. `exchangeRateToAccountCurrency` is `1` for matching currencies, and `accountValue` is rounded to the account currency's smallest unit before position values are summed. The account's `currentBalance` equals that sum, and `availableBalance` is zero in the same currency.

Add authenticated market-data and manual-portfolio routes under `InvestmentController`:

- `GET /investment/securities/search?query=...`
- `POST /investment/manual-account`
- `PUT /investment/account/:accountId/manual-holdings`
- `POST /investment/account/:accountId/refresh-prices`

The search response must include canonical symbol, name, quote type, exchange code/name, and currency. Only Yahoo results that can be resolved to a supported stock or ETF quote are selectable.

## Milestones

### 1. Add Valuation And Normalization Persistence

Implementation tasks:

- Add `AccountValuationModeSchema` and `valuationMode` to the public/internal account schemas in `backend/src/types/Account.ts`, the `AccountEntity` column and mapping in `backend/src/account/account.entity.ts`, and account mocks/tests.
- Create a migration under `backend/src/migrations/` that:
  - adds non-null `account_entity.valuationMode` with default `balance` and a `balance`/`holdings` check constraint;
  - adds nullable `accountCurrency`, `exchangeRateToAccountCurrency`, and `accountValue` columns to `investment_holding_snapshot_entity`;
  - leaves all existing accounts as `balance` and all existing Plaid holding normalization columns null;
  - has a complete `down()` path.
- Extend `InvestmentHoldingSnapshotEntity`, `InvestmentHoldingSnapshotSchema`, and mappings with the normalization fields.
- Replace the shared one-value `InvestmentProviderSchema` in `backend/src/types/Investment.ts` with security, holding, and activity provider schemas. Update `InvestmentSecurityEntity`, `InvestmentHoldingSnapshotEntity`, `InvestmentTransactionEntity`, Plaid ingestion, mocks, and generated API expectations accordingly.
- Add `MARKET_REFRESH` to `BalanceSnapshotType` so automatic quote refreshes are distinguishable from user position edits while remaining non-forward-filled balance facts.
- Enforce mode boundaries:
  - `AccountService.updateManualBalance()` rejects `holdings` accounts;
  - `BankLinkService.initiateLinking()` and the conversion completion path reject holdings-valued manual accounts, including the race where mode changes while Plaid Link is open;
  - scheduled/manual portfolio refreshes ignore linked and archived accounts.
- Keep ordinary `POST /account` behavior unchanged and force it to create `valuationMode: balance`; the specialized brokerage endpoint introduced later is the only v1 creation path for `valuationMode: holdings`.

Exit criteria:

- Migration tests prove the new columns/default/check constraint and rollback.
- Existing account, balance snapshot, Plaid holdings, and investment activity tests pass with legacy rows behaving as `balance`.
- Balance updates and manual-to-Plaid conversion fail closed for a holdings-valued account without affecting ordinary manual accounts.
- `cd backend && yarn test test/migrations test/account test/investment test/bank-link`
- `cd backend && yarn typecheck`

### 2. Add The Yahoo Market-Price Boundary

Implementation tasks:

- Add `yahoo-finance2` and a decimal arithmetic dependency such as `decimal.js` to `backend/package.json` with Yarn. Do not add an API key or browser dependency.
- Add a focused market-price boundary, for example:
  - `backend/src/market-price/market-price-provider.interface.ts`
  - `backend/src/market-price/yahoo-finance-market-price.provider.ts`
  - `backend/src/market-price/market-price.service.ts`
  - `backend/src/market-price/market-price.module.ts`
  - public/search and internal quote types in `backend/src/types/MarketPrice.ts`.
- Define provider operations for symbol search and batched quotes. Normalize Yahoo responses into canonical symbol, display name, quote type, native currency, exchange metadata, price, and quote timestamp/date.
- Accept stocks and ETFs only. Preserve Yahoo symbols such as `C6L.SI`; never infer SGX identity from bare `C6L`. Map known Yahoo exchange codes to MIC values (`XSES`, `XNAS`, `XNYS`, and `XASE`) and leave unknown mappings null rather than inventing a MIC.
- Configure server-side request timeouts, conservative queue/concurrency settings, and structured errors. Batch unique symbols for refreshes and deduplicate before calling Yahoo.
- Use `InvestmentSecurityEntity` rows with `provider: yahoo` as the durable last-good quote cache. A successful response updates name, type, currency, exchange metadata, `closePrice`, `closePriceAsOf`, and `updateDatetime`; a failed response never nulls those fields.
- Add `GET /investment/securities/search` to `InvestmentController`, protected by existing authentication and validated with a minimum query length and bounded result count.
- Keep the provider replaceable: portfolio services depend on `MarketPriceService`/an injection token, not directly on `yahoo-finance2` types.

Exit criteria:

- Provider tests cover US stock, US ETF, `C6L.SI`/SGD, unsupported quote types, malformed/missing prices, timeout, `401`, and `429` responses.
- Service tests prove symbol deduplication, batching, schema validation, and preservation of a cached quote on upstream failure.
- No default Jest test calls the live Yahoo service.
- `cd backend && yarn test test/market-price`
- `cd backend && yarn typecheck && yarn lint`

### 3. Create, Replace, And Revalue Manual Portfolios

Implementation tasks:

- Add the registered Zod request/response schemas from **Target Data Shape** to `backend/src/types/Investment.ts` (or a dedicated `ManualBrokerage.ts` imported by the investment module).
- Add `backend/src/investment/manual-brokerage.service.ts` to orchestrate account creation, full snapshot replacement, manual price refresh, and scheduled refresh. Keep Plaid ingestion behavior in `InvestmentService` unchanged except for shared entity/schema support.
- Validate every write before mutation:
  - account is owned, active, unlinked, `type: investment`, `subType: brokerage`, and `valuationMode: holdings` for updates;
  - symbols are canonical selections, unique case-insensitively, and resolve to stocks/ETFs;
  - quantities are finite positive decimal strings within the database precision;
  - account/native currencies are uppercase supported fiat codes.
- Resolve network data before opening the database transaction. Fetch missing/current quotes through `MarketPriceService`; use a last-good cached quote when a refresh fails; reject the whole create/update only when a requested symbol has never had a usable quote. Return the cached symbols in `staleSymbols`.
- Resolve each distinct native-currency-to-account-currency rate through `CurrencyExchangeService.getRate()` for the valuation date, using `1` when currencies match. Also ensure the account-currency-to-user-preferred-currency rate exists so the existing balance query can display the new balance immediately.
- Use decimal-string arithmetic for `quantity × price × FX`. Round each position's `accountValue` once to the account currency's smallest unit, then sum those rounded values to derive the account balance.
- In a single `DataSource.transaction()` per account:
  - lock the account row to serialize user edits and scheduled refreshes;
  - create/update Yahoo-backed `InvestmentSecurityEntity` rows;
  - fully replace manual holding rows for the user's local `snapshotDate`, including deleting omitted same-day positions;
  - update `AccountEntity.currentBalance` to the normalized total and `availableBalance` to zero;
  - upsert the same-date `BalanceSnapshotEntity` with `USER_UPDATE` for create/replace or `MARKET_REFRESH` for quote-only refresh.
- Allow `PUT .../manual-holdings` with an empty list to record a real zero-position snapshot. For holdings-valued accounts, update `InvestmentService.findLatestHoldingsForAccount()` to use the latest non-forward-filled account balance snapshot as the snapshot header, then load holdings on that date; this prevents a cleared portfolio from falling back to yesterday's non-empty rows. Preserve the existing holding-row lookup for Plaid/balance-valued investment accounts.
- Add the create, replace, and refresh routes to `InvestmentController` with ownership tests and registered OpenAPI schemas.
- Add `backend/src/investment/manual-brokerage.scheduled.ts` with one weekday refresh after US market close (23:30 UTC). Load active holdings-valued accounts, batch distinct Yahoo symbols once, then revalue each account independently so one bad account does not block others. The existing `DISABLE_SCHEDULES` mechanism must continue to disable it in tests/local runs when requested.
- Treat provider failures as degraded data, not zero balances: preserve cached quotes, expose their per-holding as-of time, log structured counts for fresh/stale/failed symbols and refreshed/skipped accounts, and never use proxy rotation or other rate-limit circumvention.

Exit criteria:

- Creating a brokerage atomically produces an account, manual holding rows, and an equal account/balance snapshot total.
- Replacing positions overwrites the same user-local day, preserves prior dates, deletes omitted same-day holdings, and supports clearing to zero without resurrecting older holdings.
- Mixed USD/SGD fixtures prove native values remain unchanged while the stored account values sum exactly to the account balance.
- A quote failure uses a prior cached quote and reports it stale; a never-priced symbol rejects the write without partial account/holding/balance changes.
- Concurrent scheduled refresh and user replacement cannot leave holdings and the account balance out of agreement.
- The scheduler batches repeated symbols across accounts and continues after an account-level failure.
- `cd backend && yarn test test/investment test/market-price test/balance-snapshot test/currency-exchange`
- `cd backend && yarn typecheck && yarn lint`

### 4. Build The Manual Brokerage UI

Implementation tasks:

- Run `cd frontend && yarn orval` against the updated backend OpenAPI; do not hand-edit `frontend/src/api/**`.
- Add a reusable positions editor, for example `frontend/src/components/investments/ManualBrokeragePositionsEditor.tsx`:
  - debounced backend symbol search with loading, empty, and error states;
  - selection labels that include symbol, company, exchange, and quote currency;
  - add/remove rows and positive decimal-string quantity inputs that preserve fractional shares;
  - duplicate-symbol prevention and inline validation;
  - accessible labels and controls that work in the full-screen mobile modal.
- Update `frontend/src/components/accounts/AddAccountModal.tsx` so selecting the manual `Investment`/brokerage type changes the form from `Current Balance` to the positions editor while retaining account name and account currency. Keep 401(k), HSA, cash, credit, loan, and other manual account flows on the existing balance contract.
- Submit brokerages through `POST /investment/manual-account`, invalidate account/balance/holding query keys, and keep the modal open with actionable symbol/quote errors if valuation fails.
- Add an edit modal, for example `frontend/src/components/investments/ManualBrokerageHoldingsModal.tsx`, initialized from the latest snapshot and saved as a full replacement through `PUT .../manual-holdings`.
- Update `frontend/src/lib/balance-utils.ts` so `AccountSummaryData` carries `valuationMode` from balance-query account results.
- Update `frontend/src/components/AccountModal.tsx` for holdings-valued manual accounts:
  - show `Edit holdings` and `Refresh prices` instead of `Update Balance`;
  - do not fetch or display provider Activity, because v1 has no manual transactions;
  - retain Holdings and balance history;
  - show snapshot date plus each quote's `Price as of` metadata;
  - show native price/value and the normalized account-currency value when the currencies differ;
  - invalidate accounts, balance history, and latest holdings after edits/refreshes;
  - report cached/stale symbols without discarding the successful update.
- Update `frontend/src/components/investments/InvestmentHoldingsTable.tsx` to render the optional normalized value without changing Plaid rows whose normalization fields are null. Hidden-balance mode must mask native prices, native values, normalized values, and the account total while keeping names, symbols, exchanges, quantities, and dates visible.
- Update `frontend/src/components/accounts/AccountRow.tsx` to omit the Plaid conversion control for holdings-valued accounts; the backend remains authoritative.

Exit criteria:

- A user can create, view, fully replace, clear, and refresh a manual brokerage without entering a balance directly.
- Ordinary manual-account creation/update behavior remains unchanged.
- Manual brokerages do not show a misleading empty provider-activity section or a direct balance editor.
- Component tests cover symbol selection, duplicate prevention, fractional quantities, mixed currencies, stale/error responses, clearing positions, query invalidation, hidden balances, and mobile rendering.
- `cd frontend && yarn test src/components/accounts src/components/investments src/components/AccountModal.test.tsx`
- `cd frontend && yarn typecheck && yarn lint && yarn build`
- `$agent-browser` validates create/edit/refresh/clear behavior at desktop and mobile widths, keyboard operation, visible error states, console errors, and network failures against local dev.

### 5. Recreate And Verify The Reference Portfolio Locally

Implementation tasks:

- Use `$splice-local-dev` to start/inspect PostgreSQL, backend, and frontend with schedules disabled for deterministic setup. Authenticate through the documented local auth bypass at `http://localhost:3000/user/dev/login?redirect=/accounts`.
- Use `$agent-browser` to create a USD-valued manual brokerage named `Prime Account UI valuation test` entirely through the UI with the quantities read from `IMG_1329.PNG`:
  - `GOOGL`: 2 shares
  - `INTC`: 97 shares
  - `NVDA`: 7 shares
  - `TSM`: 8 shares
  - `C6L.SI`: 200 shares
- Treat the screenshot solely as the source of symbols and quantities. Its displayed prices and totals are historical and must not be asserted against current Yahoo quotes. Do not import the screenshot's cost or P&L fields, which are out of scope.
- Confirm the search UI resolves the four US listings as USD and Singapore Airlines (`C6L.SI`) as an SGX/XSES SGD quote.
- Open the created account and record each displayed quantity, native quote, native value, normalized account-currency value, and quote as-of time. Verify:
  - all five positions are present with the entered quantities;
  - each native value equals quantity times native price to the displayed/native precision;
  - the four USD position values remain unchanged by FX;
  - the SGD position shows both its SGD value and USD-normalized value;
  - the five rounded USD account values sum exactly to the account's displayed USD current balance;
  - that same balance appears on Accounts/home and in the latest balance-history point.
- Trigger `Refresh prices` and verify the UI remains internally consistent whether Yahoo returns fresh quotes or a cached/stale result. Reload the page to prove the positions and value are persisted rather than local component state.
- Capture desktop and mobile screenshots of the completed account and note Yahoo/Frankfurter quote timestamps/rates used in the implementation handoff. Check the browser console and failed requests.

Exit criteria:

- The reference five-position portfolio is recreated through the local UI and its live mixed-currency account value passes the arithmetic checks above.
- Refresh and reload preserve a truthful value; an upstream failure leaves the last value visible with stale/as-of messaging rather than showing zero.
- Desktop and mobile screenshots plus the arithmetic worksheet/results are included in the implementation report.

## Tests

### Backend

- `backend/test/migrations/add-manual-brokerage-valuation.spec.ts`
  - new account/holding columns, backward-compatible default/check, indexes if added, and rollback.
- `backend/test/market-price/yahoo-finance-market-price.provider.spec.ts`
  - normalization for GOOGL/US, C6L.SI/SGD, ETFs, exchange mapping, malformed responses, timeout, authentication failure, and rate limiting.
- `backend/test/market-price/market-price.service.spec.ts`
  - batching/deduplication, last-good cache updates, and no destructive update on provider error.
- `backend/test/investment/manual-brokerage.service.spec.ts`
  - ownership/mode/archive/link checks; symbol and quantity validation; USD-only and mixed USD/SGD math; smallest-unit rounding; same-day replacement; empty snapshots; stale cached prices; never-priced failures; transaction rollback; concurrent refresh/update; scheduler aggregation.
  - include a deterministic version of the reference portfolio. Choose unrounded fixture prices whose per-position values reproduce the screenshot's USD subtotal where useful, then test SGD normalization with a fixed FX rate; do not call live providers.
- `backend/test/investment/investment.controller.spec.ts`
  - authenticated search/create/replace/refresh routing, request validation, ownership denial, and response schemas.
- Existing `backend/test/investment/investment.service.spec.ts`
  - Plaid snapshot behavior remains unchanged and normalization fields remain nullable.
- Existing account, balance-query, bank-link conversion, currency conversion, and scheduler tests cover the new valuation boundary and snapshot type.

### Frontend

- Add editor/modal tests for debounced search, result selection, duplicate prevention, row removal, decimal quantities, validation, stale/error notices, and full replacement payloads.
- Extend `frontend/src/components/accounts/ManualBalancePayloads.test.tsx` or split a brokerage-specific test proving ordinary accounts still send balance payloads while manual brokerages send the five-position portfolio contract.
- Extend `frontend/src/components/AccountModal.test.tsx` for holdings-mode controls, no activity fetch/surface, refresh/edit invalidations, error states, and account valuation metadata.
- Extend `frontend/src/components/investments/InvestmentHoldingsTable.test.tsx` for SGD native values, USD normalized values, quote timestamps, hidden balances, and unchanged Plaid rows.
- Add/extend `AccountRow` tests proving holdings-valued accounts do not offer Plaid conversion.
- Keep live Yahoo/Frankfurter behavior out of Vitest; exercise it only in the explicit local browser validation.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/migrations/add-manual-brokerage-valuation.spec.ts
cd backend && yarn test test/market-price test/investment test/account test/balance-snapshot test/balance-query test/currency-exchange test/bank-link
cd backend && yarn typecheck
cd backend && yarn lint
cd backend && yarn build
cd backend && yarn migration:show
```

Frontend, with the updated backend serving OpenAPI at `http://localhost:3000/api`:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/components/accounts src/components/investments src/components/AccountModal.test.tsx
cd frontend && yarn typecheck
cd frontend && yarn lint
cd frontend && yarn build
```

Local browser validation:

```text
$splice-local-dev
$agent-browser
http://localhost:3000/user/dev/login?redirect=/accounts
```

## Risks And Open Questions

- Yahoo Finance is unofficial and has no SLA. The provider boundary, timeout/backoff, batching, durable last-good cache, visible as-of metadata, and manual refresh make that acceptable for this personal project but do not make it suitable for a commercial uptime promise.
- Yahoo symbols are provider-specific identities. Store the canonical Yahoo symbol (`C6L.SI`, not `C6L`) and exchange metadata so later provider replacement has an explicit migration/mapping seam.
- Exchange calendars and quote timestamps differ. A portfolio snapshot is dated in the user's timezone and may legitimately contain holdings whose latest market closes differ; retain per-position quote dates rather than claiming a single universal market close.
- Same-day balance snapshots are unique by account/date, so a quote refresh after a user edit replaces that day's balance history point. Holdings on that day must be replaced in the same transaction to preserve the invariant.
- Existing `CurrencyExchangeService.getRate()` fetches and stores a missing dated rate. Portfolio valuation must filter same-currency pairs to rate `1` and must not request `USD→USD` or `SGD→SGD` from Frankfurter.
- Decimal precision and rounding are correctness-sensitive. Define the position-round-then-sum rule once in the backend and have the frontend display stored results rather than recomputing authoritative totals.
- v1 deliberately excludes cash positions, short/negative quantities, options, bonds, mutual funds, transaction history, cost basis, dividends, splits, tax lots, P&L, and performance. Stock splits or symbol changes require the user to replace the position snapshot until corporate-action support is planned.

## Overall Exit Criteria

- Manual brokerage creation and editing use complete share snapshots, never synthetic transactions.
- US and Singapore stocks/ETFs resolve through the Yahoo provider, including `C6L.SI`, with durable last-good prices and truthful as-of metadata.
- Holdings retain native quote currencies; stored normalized account values sum exactly to the account and balance snapshot in the selected account currency.
- Existing balance-valued manual accounts, Plaid investment accounts, net-worth calculations, currency conversion, archiving, and hidden-balance behavior remain compatible.
- Direct manual balance updates and manual-to-Plaid conversion cannot violate a holdings-valued account's derived-balance invariant.
- The scheduled refresh is low-frequency, batches symbols, skips archived/linked accounts, and never turns provider failure into a zero balance.
- The five-position reference portfolio is recreated through the local UI and its live mixed-currency value is verified on account, account list/home, and balance history surfaces.
- Targeted and full-risk-area tests, backend/frontend typechecks and lint, backend/frontend builds, migration verification, generated API client regeneration, and `$agent-browser` desktop/mobile validation pass.
