# Manual Transaction Creation

## Status

Planned

## Goal

Add first-class manual transaction creation, editing, and deletion for Splice without changing account balances or balance snapshots.

Manual transactions should be created from the Transactions page, associated with any active existing account, categorized at creation time, and displayed in existing transaction reporting surfaces. They should stay separate from provider-synced transactions and never be auto-matched, merged, or removed by provider sync.

## Current Behavior

- `backend/src/transaction/transaction.controller.ts` exposes raw `POST /transaction`, `PATCH /transaction/:id`, and `DELETE /transaction/:id` endpoints using the provider-shaped `CreateTransactionDtoSchema` and `UpdateTransactionDtoSchema`.
- The frontend generated client already includes `transactionControllerCreate`, but `frontend/src/routes/_authed/transactions.tsx` does not use it today.
- Provider sync bypasses the controller and writes transactions through `TransactionService.processSyncResults()` in `backend/src/transaction/transaction.service.ts`.
- `TransactionEntity` in `backend/src/transaction/transaction.entity.ts` stores provider metadata, amount, account, dates, and user category fields, but has no explicit source marker.
- Existing category changes on provider transactions are override semantics through `TransactionService.updateCategory()` and `categoryUpdatedAt`.
- Existing reporting-date edits write `reportingDateOverride`; for manual transactions, date edits should instead mutate canonical `providerDate`.
- Transaction summary and table conversion already convert native transaction currencies to the user's preferred currency through `CurrencyConversionService.getRateMap()` and `convertAmount()` in `backend/src/currency-exchange/currency-conversion.service.ts`.
- Account balances and snapshots are managed separately through `AccountService`, `BalanceSnapshotService`, and `BalanceSnapshotListener`. Manual transaction creation must not emit account or snapshot changes.

UX references:

- [Rocket Money's manual transaction flow](https://help.rocketmoney.com/en/articles/4402227-adding-transactions-manually) starts from the Transactions tab, asks for spend/income, name, date, amount, and category, then saves the row back into Transactions.
- [Monarch manual accounts](https://help.monarchmoney.com/hc/en-us/articles/360058187072-Manual-Accounts) allow adding manual transactions from account or transaction contexts.
- [Monarch CSV import](https://help.monarchmoney.com/hc/en-us/articles/4409682789908-Import-transaction-data-manually-from-banks-or-other-finance-apps) documents that synced-account imports do not change account balance history and accepts signed amounts, with negative values for purchases/debits and positive values for credits/deposits.
- [Quicken Simplifi transaction management](https://support.simplifi.quicken.com/en/articles/3348103-managing-transactions-in-quicken-simplifi) and [Monarch editing](https://help.monarchmoney.com/hc/en-us/articles/360048393532-Editing-Transactions) both support editing transaction fields from transaction/detail surfaces, which supports using a modal/details action rather than a separate page.

## Target Data Shape

Add an explicit transaction source marker:

```ts
type TransactionSource = 'provider' | 'manual'
```

`TransactionSchema` should include:

```ts
source: TransactionSource
```

Existing transactions should migrate to `source = 'provider'`. Provider sync inserts and pending-to-posted updates should preserve provider source. Manual endpoints should set and require `source = 'manual'` for edit/delete.

Add focused manual DTOs rather than using the provider-shaped create/update DTO:

```ts
type CreateManualTransactionDto = {
  accountId: string
  amount: MoneyWithSign
  merchantName: string
  providerDate: string
  categoryId: string
}

type UpdateManualTransactionDto = {
  accountId: string
  amount: MoneyWithSign
  merchantName: string
  providerDate: string
  categoryId: string
}
```

Server-side rules:

- `accountId` must belong to the current user and must not be archived.
- Currency is derived from the selected account's current balance currency. The backend must reject or overwrite any client-supplied amount currency that differs from the selected account currency.
- `amount.money.amount` must be a non-zero integer.
- `amount.sign` determines flow direction: `negative` is outflow and `positive` is inflow. There is no separate flow-direction field.
- `categoryId` is required and must resolve through `CategoryService.findActiveAssignableCategory()`.
- `providerDate` is the user-entered transaction date and may be past, present, or future.
- `reportingDateOverride`, `authorizedDate`, `authorizedDatetime`, `providerDatetime`, pending fields, external provider IDs, provider category hints, and provider metadata remain null for manual transactions.
- Manual create/edit/delete must not update `AccountEntity`, create or update `BalanceSnapshotEntity`, or emit balance snapshot events.

## Shared UI Components And Conventions

- Use the existing Transactions page structure in `frontend/src/routes/_authed/transactions.tsx`; add the manual entry action through `PageHeader` actions instead of creating a separate route or page.
- Build the create/edit UI with Mantine primitives already used in the app: `Modal`, `Stack`, `Group`, `TextInput`, `NumberInput`, `Select`, `Button`, `ActionIcon`, `Tooltip`, and `Text`.
- Reuse `CategorySelect` from `frontend/src/components/categories/CategorySelect.tsx` for required category selection so custom category rendering, color swatches, search, and clear behavior remain consistent.
- Reuse `getViewportAwareComboboxProps()` and `viewportAwareDropdownMaxHeight` from `frontend/src/lib/mobile-combobox.ts` for account and category selects in the modal.
- Reuse `getDecimalPlaces()` and `MoneyWithSignSign` from the existing frontend formatting/API model layer for signed amount conversion and precision.
- Reuse the existing transaction query invalidation pattern from `transactions.tsx` and `TransactionsTable.tsx` so list, summary, category, and analysis-adjacent surfaces refresh consistently.
- Keep the transaction list/table visually unchanged: do not add a `Manual` list badge, source column, or new persistent row chrome.
- Place manual-only edit/delete affordances in existing details/action surfaces:
  - Desktop: extend `TransactionsTable.tsx` metadata/details/action affordances.
  - Mobile: extend the `TransactionsMobileList.tsx` details drawer/action area.
- Follow existing responsive conventions: desktop keeps dense table behavior; mobile keeps the purpose-built transaction list and bottom/drawer-style details interaction.
- Follow existing icon-button conventions by using lucide icons with accessible labels/tooltips for add, edit, and delete actions where icons are used.

## Milestones

### 1. Backend Source And Manual Contract

Implementation tasks:

- Add `TransactionSourceSchema`, `TransactionSource`, `CreateManualTransactionDtoSchema`, and `UpdateManualTransactionDtoSchema` in `backend/src/types/Transaction.ts`.
- Add a non-null `source` column to `TransactionEntity` in `backend/src/transaction/transaction.entity.ts`, defaulting to provider for existing rows.
- Add a migration under `backend/src/migrations/` that adds `"source" character varying NOT NULL DEFAULT 'provider'` to `transaction_entity`.
- Update `TransactionEntity.fromDto()` and `toObject()` so provider-created paths default to `source: 'provider'`.
- Update provider sync paths in `TransactionService.processSyncResults()` so inserted provider rows and pending-to-posted updates stay `source: 'provider'`.
- Regenerate frontend API models after backend endpoints are added in a later milestone.

Exit criteria:

- Existing transaction fixtures and service tests can construct provider transactions without manually setting source.
- `TransactionSchema` responses include `source`.
- Migration is reversible and preserves existing rows as provider-sourced.

### 2. Manual Transaction Service Methods

Implementation tasks:

- Inject or otherwise access the account repository/service in `backend/src/transaction/transaction.service.ts` to validate account ownership and `archivedAt === null`.
- Add helper logic to derive account currency from `account.currentBalance.currency`.
- Add `createManual(userId, dto)` that builds a `TransactionEntity` with source `manual`, selected account, derived currency, required category, canonical `providerDate`, `pending: false`, and null provider metadata.
- Add `updateManual(id, userId, dto)` that only updates transactions with `source = 'manual'`, validates active account and assignable category, mutates `providerDate` directly, and clears/keeps `reportingDateOverride` as null.
- Add `removeManual(id, userId)` that deletes only transactions with `source = 'manual'`.
- Ensure manual update/delete returns null for missing rows, provider-sourced rows, archived accounts, or unavailable categories in the same style as existing service/controller behavior.

Exit criteria:

- Manual create/edit/delete never calls `AccountService.updateManualBalance()`, `BalanceSnapshotService`, or event emitters.
- Provider transactions cannot be edited or deleted through manual methods.
- Account changes on manual edit reinterpret the same submitted numeric amount in the new account currency; no currency conversion is attempted.

### 3. Manual Transaction Endpoints

Implementation tasks:

- Add dedicated controller endpoints in `backend/src/transaction/transaction.controller.ts`:
  - `POST /transaction/manual`
  - `PATCH /transaction/:id/manual`
  - `DELETE /transaction/:id/manual`
- Use `ZodApiBody`, `ZodApiResponse`, and `ZodValidationPipe` with the new manual DTO schemas.
- Keep the existing raw transaction endpoints in place and do not deprecate or remove them in this plan.
- Return normal `TransactionSchema` objects for create/edit and 204 for manual delete.

Exit criteria:

- Swagger/OpenAPI exposes distinct manual endpoints and generated clients can call them.
- Manual endpoint responses include `source: 'manual'`.
- Provider rows return 404 through manual edit/delete paths.

### 4. Generated Client And Frontend Form

Implementation tasks:

- Run `cd frontend && yarn orval` after backend OpenAPI includes the manual endpoints.
- Add a reusable `ManualTransactionModal` under `frontend/src/components/transactions/` or colocate under the Transactions route if local state coupling stays high.
- Reuse the shared UI components and conventions listed above rather than adding bespoke styling or a new transaction-entry page.
- The create form fields are account, signed amount, read-only currency, date, merchant/name, and required category.
- Do not add an inflow/outflow toggle. Negative signed amount submits `MoneyWithSignSign.negative`; positive signed amount submits `MoneyWithSignSign.positive`; zero disables submit and is rejected client-side.
- Default account to the current Transactions page `accountId` filter when present; otherwise use the first active account from `useAccountControllerFindAll()`.
- Show the selected account currency as read-only. When the account changes, update currency display and decimal precision from the new account currency.
- Category is required and starts empty on create.
- Close the modal after successful create or edit.

Exit criteria:

- A user can open the create modal from `frontend/src/routes/_authed/transactions.tsx`, enter required fields, save, and see the transaction in the refreshed list/summary.
- The form blocks missing account, zero amount, empty merchant/name, missing date, and missing category before submit.
- The frontend never allows editing transaction currency directly.

### 5. Manual Edit And Delete UI

Implementation tasks:

- Add an "Add transaction" action to the Transactions page header using existing `PageHeader` action patterns.
- Add manual-only edit/delete affordances in the existing transaction details/action surface:
  - Desktop: use the current metadata/details/action area in `frontend/src/components/TransactionsTable.tsx` rather than adding a list-level source badge or new source column.
  - Mobile: expose edit/delete in `frontend/src/components/transactions/TransactionsMobileList.tsx` details drawer/action area.
- Reuse the same modal for manual edit, prefilled with account, signed amount, merchant/name, provider date, and category.
- For manual edits, date and category mutate canonical fields through `PATCH /transaction/:id/manual`; they are not reporting-date or category-override semantics.
- Add a confirmation step for manual delete and call `DELETE /transaction/:id/manual`.
- Invalidate transaction list, transaction summary, analysis/category-dependent query keys, and any manual endpoint mutation state consistently with existing transaction invalidation behavior in `transactions.tsx` and `TransactionsTable.tsx`.

Exit criteria:

- Manual rows can be edited and deleted from desktop and mobile.
- Provider rows do not show manual edit/delete actions.
- No visible list-level `Manual` badge or source column is added.

### 6. Currency Conversion And Reporting Checks

Implementation tasks:

- Add tests or assertions around manual transactions with non-preferred account currencies so `GET /transaction?convert=true` and `GET /transaction/summary` request the correct source-to-preferred pair through `CurrencyConversionService.getRateMap()`.
- Verify `normalizeCurrencyPair()` behavior remains sufficient for account-derived manual currencies, including USD-involved pairs and non-USD pairs.
- Confirm manual future-dated rows flow through existing date filters and analysis behavior without special casing.

Exit criteria:

- Manual transactions in a foreign account currency display converted amounts in the existing table/mobile details behavior when conversion rates exist.
- Summary totals include manual transaction buckets and convert them through the existing preferred-currency summary path.
- Missing conversion rates behave like existing provider transactions: native data remains present, and unavailable converted totals are not invented.

## Tests

### Backend

- Update `backend/test/transaction/transaction.service.spec.ts` for:
  - default provider source on existing provider-style creation.
  - manual create derives currency from account and requires active account ownership.
  - manual create rejects zero amount and missing/unassignable category.
  - manual update mutates amount, account, merchant, provider date, and category for source `manual`.
  - manual update/delete returns null for source `provider`.
  - manual operations do not emit or call balance snapshot/account update paths.
  - provider sync inserts and pending-to-posted updates keep `source: 'provider'`.
- Update `backend/test/transaction/transaction.controller.spec.ts` for manual create/edit/delete delegation, 404 behavior, and response shape.
- Add migration tests if local migration test conventions are expanded for transaction schema changes.

### Frontend

- Update `frontend/src/routes/_authed/transactions.test.tsx` for:
  - Add transaction button opens the modal.
  - account preselection from filter.
  - signed amount conversion to `MoneyWithSign`.
  - required category and zero amount validation.
  - successful save closes modal and invalidates transaction queries.
- Add or update component tests for `ManualTransactionModal`.
- Update `frontend/src/components/TransactionsTable.test.tsx` for manual-only edit/delete affordances and provider-row omission.
- Update `frontend/src/components/transactions/TransactionsMobileList.test.tsx` for mobile manual edit/delete affordances.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/transaction/transaction.service.spec.ts test/transaction/transaction.controller.spec.ts
cd backend && yarn lint
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/routes/_authed/transactions.test.tsx src/components/TransactionsTable.test.tsx src/components/transactions/TransactionsMobileList.test.tsx
cd frontend && yarn typecheck
cd frontend && yarn lint
```

Browser validation:

```bash
cd frontend && yarn dev
```

- Use `$agent-browser` to open `http://localhost:4000/transactions`.
- Validate create flow on desktop and mobile widths.
- Validate manual edit/delete actions for manual rows only.
- Validate provider rows do not expose manual edit/delete actions.
- Validate account changes update the read-only currency display and amount precision.

## Overall Exit Criteria

- Users can create manual transactions from the Transactions page with active account, signed non-zero amount, account-derived read-only currency, date, merchant/name, and required category.
- Users can edit and delete only manual transactions through dedicated manual endpoints.
- Manual transactions never mutate account balances or balance snapshots.
- Manual and provider transactions remain separate; provider sync never matches, updates, or removes manual transactions.
- Existing provider transaction category/reporting-date override behavior remains intact.
- Transaction lists, summaries, analysis inputs, and converted amount displays include manual transactions through existing transaction query and currency conversion paths.
- Generated frontend API client reflects the new manual endpoints and source field.
- Focused backend/frontend tests, frontend typecheck, lint, and browser validation pass or any blockers are documented.
