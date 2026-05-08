# Transaction Reporting Date Override

## Status

Planned

## Goal

Allow users to set an optional `reportingDateOverride` on a transaction. When present, Splice treats that date as the transaction's `activityDate` for list filters, sorting, monthly summaries, transaction analysis, category counts, and MCP transaction reads.

Provider and authorized dates remain preserved and visible. This feature changes reporting behavior only; it does not rewrite bank/provider facts.

`hasReportingDateOverride` is intentionally not added. Consumers can check `reportingDateOverride !== null`.

## Current Behavior

- `activityDate` is currently derived as `authorizedDate ?? providerDate`.
- That rule is duplicated in several backend places:
  - `backend/src/transaction/transaction.entity.ts` serializes `activityDate`.
  - `backend/src/transaction/transaction.service.ts` filters, sorts, summarizes, and surfaces transactions by activity date.
  - `backend/src/transaction-analysis/transaction-analysis.service.ts` filters analysis windows and drilldowns by activity date.
  - `backend/src/mcp/mcp-read.service.ts` filters, paginates, and serializes MCP transaction reads by activity date.
  - `backend/src/category/category.service.ts` uses activity-date-style expressions for category transaction metadata.
- MCP instructions currently tell clients that transaction ranges use `activityDate`, defined as authorized date when available, otherwise provider date.
- Frontend generated API models under `frontend/src/api/**` mirror the backend OpenAPI contract and must be regenerated, not hand-edited.

## Target Data Shape

Database:

```sql
ALTER TABLE "transaction_entity"
  ADD "reportingDateOverride" date;
```

Backend API:

```ts
type Transaction = {
  activityDate: string
  reportingDateOverride: string | null
  providerDate: string
  providerDatetime: string | null
  authorizedDate: string | null
  authorizedDatetime: string | null
}
```

Date precedence:

```ts
activityDate =
  reportingDateOverride ?? authorizedDate ?? providerDate
```

Update payload:

```ts
type UpdateTransactionDto = {
  reportingDateOverride?: string | null
}
```

MCP transaction rows should keep returning `activityDate`, `providerDate`, and `authorizedDate`, and should additionally return `reportingDateOverride`.

## Milestones

### 1. Persist Reporting Date Override

Implementation tasks:

- Add a TypeORM migration that adds nullable `reportingDateOverride date` to `transaction_entity`.
- Add `reportingDateOverride: string | null` to `TransactionEntity`.
- Initialize imported/provider-created transactions with `reportingDateOverride = null`.
- Add `reportingDateOverride` to `TransactionSchema`, `CreateTransactionDtoSchema` if needed for test/manual creation, and `UpdateTransactionDtoSchema`.
- Update `TransactionEntity.toObject()` so `activityDate` uses `reportingDateOverride ?? authorizedDate ?? providerDate`.

Exit criteria:

- Existing transactions migrate without data backfill and keep the same `activityDate`.
- A transaction updated with `reportingDateOverride = '2026-05-01'` serializes `activityDate = '2026-05-01'`.
- A transaction updated with `reportingDateOverride = null` falls back to `authorizedDate ?? providerDate`.

### 2. Centralize Activity Date Logic

Implementation tasks:

- Add a shared backend transaction date helper, for example `backend/src/transaction/transaction-date.ts`.
- Export SQL expressions:

```ts
export const TRANSACTION_ACTIVITY_DATE_EXPRESSION =
  'COALESCE(transaction."reportingDateOverride", transaction."authorizedDate", transaction."providerDate")'

export const TRANSACTION_ACTIVITY_DATETIME_EXPRESSION =
  'COALESCE(transaction."authorizedDatetime", transaction."providerDatetime")'
```

- Export an object helper:

```ts
export function getTransactionActivityDate(transaction: TransactionEntity) {
  return (
    transaction.reportingDateOverride ??
    transaction.authorizedDate ??
    transaction.providerDate
  )
}
```

- Replace local `COALESCE(transaction."authorizedDate", transaction."providerDate")` constants and helper methods in transaction, analysis, MCP, and category services.
- Keep the public field name `activityDate`.

Exit criteria:

- There is one source of truth for the activity date precedence in backend TypeScript.
- List, summary, transaction analysis, MCP reads, and category counts all use the same SQL expression.
- No remaining backend SQL date filters use `COALESCE(transaction."authorizedDate", transaction."providerDate")` directly unless they are intentionally raw-date-specific and documented.

### 3. API Endpoints And Generated Client

Implementation tasks:

- Ensure `PATCH /transaction/:id` can set, change, and clear `reportingDateOverride`.
- Add or update OpenAPI metadata through the existing zod schema registration flow.
- Regenerate frontend API clients with:

```bash
cd frontend && yarn orval
```

- Update generated model consumers to use the new `reportingDateOverride` field where needed.

Exit criteria:

- Frontend generated models include `reportingDateOverride`.
- Existing transaction list and analysis API calls continue to accept `startDate` and `endDate`; those filters now apply to effective `activityDate`.
- Clearing the override through the API restores previous date behavior.

### 4. Frontend Transaction Editing

Implementation tasks:

- Add an editable reporting date control to the desktop transactions table, following the existing category edit pattern in `TransactionsTable`:
  - Inline row cell/action behavior, not a separate settings page.
  - Hover-revealed action icons matching the current category actions style.
  - Pencil action opens a compact inline popover/editor.
  - Escape/cancel closes the editor without changing the date.
  - Reset action appears only when `reportingDateOverride !== null`.
- Prefer placing the edit affordance in/near the activity date cell. If the table does not currently have an explicit date column because rows are grouped by date, add the affordance where the effective date is visible or add a compact date cell without disrupting existing table density.
- Add mobile editing to the transaction details drawer/modal after tapping a transaction in `TransactionsMobileList`.
  - Keep the list row itself read-only.
  - Show the current effective `activityDate` in the drawer header/details.
  - Add a reporting date input and reset action in the drawer body.
  - Reuse the existing drawer interaction style used for mobile category edits.
- Display the effective `activityDate`, but make overrides visible when present.
- Show enough raw-date context to avoid ambiguity, for example:
  - `Activity date: May 1`
  - `Reporting override: May 1`
  - `Bank date: Apr 29`
  - `Authorized date: Apr 29`
- Add a reset action that sets `reportingDateOverride` to `null`.
- Invalidate transaction, summary, analysis, and category queries after updates, matching existing category override invalidation patterns.
- Add a transaction filter chip or subtle row indicator for overridden dates only if the current transaction UI can accommodate it without clutter. This is optional for the first implementation.

Exit criteria:

- A user can move an April 29 salary transaction into May reporting without changing provider or authorized dates.
- On desktop, the reporting date can be edited inline through hover actions consistent with category editing.
- On mobile, the reporting date can be edited from the transaction details drawer/modal after opening the transaction.
- Transaction list, monthly summary, and analysis views update after the override.
- A user can reset the transaction back to bank-date behavior.
- UI does not need `hasReportingDateOverride`; it checks `reportingDateOverride`.

### 5. MCP Contract And Instructions

Implementation tasks:

- Add `reportingDateOverride` to MCP transaction serialization.
- Update MCP tool descriptions and system prompt text:
  - Date ranges use `activityDate`.
  - `activityDate` means `reportingDateOverride` when set, otherwise `authorizedDate`, otherwise `providerDate`.
  - Raw provider/authorized dates are available for audit and explanation.
- Ensure MCP pagination cursors still encode the effective `activityDate`.

Exit criteria:

- MCP clients that call `list_transactions` or `search_transactions` automatically analyze by overridden reporting dates.
- MCP clients can explain that a transaction appears in a month because `reportingDateOverride` is set.
- Existing cursors remain valid in shape; cursor date semantics become the updated `activityDate`.

## Tests

### Backend

- Migration test or migration validation:
  - New nullable column exists.
  - Existing rows are not modified.
- Transaction entity/service tests:
  - `activityDate` falls back to `authorizedDate`.
  - `activityDate` falls back to `providerDate` when `authorizedDate` is null.
  - `activityDate` uses `reportingDateOverride` when present.
  - Updating a transaction can set and clear `reportingDateOverride`.
- Transaction list/summary tests:
  - A transaction with provider/authorized date in April and override in May appears in May filters and not April filters.
  - Sorting by `activityDate` uses the override.
  - Summary totals use the override.
- Transaction analysis tests:
  - Category inflow/outflow aggregation windows use the override.
  - Category drilldown uses the same effective date.
  - Neutralization behavior still works after effective-date filtering.
- MCP tests:
  - `list_transactions` filters by overridden `activityDate`.
  - Response includes `reportingDateOverride`.
  - Cursor pagination works when overridden dates are involved.
- Category service tests:
  - Category transaction counts and latest transaction dates use the effective activity date.

### Frontend

- Transaction table/edit tests:
  - Existing transactions with no override render normally.
  - Setting an override calls the update mutation with `{ reportingDateOverride: 'YYYY-MM-DD' }`.
  - Resetting calls the update mutation with `{ reportingDateOverride: null }`.
  - Desktop edit affordance follows the inline hover-action category edit pattern.
  - Rows with overrides display both effective activity date and raw bank date context.
- Mobile transaction drawer tests:
  - Tapping a transaction opens details with reporting date controls.
  - Setting and resetting an override from the drawer call the same update endpoint.
- Route/query tests:
  - Transaction query invalidation after override update refreshes list and summary consumers.
  - Typecheck verifies generated API models include `reportingDateOverride`.

## Validation Commands

Backend:

```bash
cd backend && yarn migration:show
cd backend && yarn test
cd backend && yarn lint
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test
cd frontend && yarn lint
cd frontend && yarn typecheck
```

Targeted commands should be added during implementation for the exact touched test files.

## Overall Exit Criteria

- Users can set, edit, and clear `reportingDateOverride` for a transaction.
- `activityDate` remains the public effective date field and now respects the override.
- Provider and authorized dates remain unchanged and visible for auditability.
- Monthly transaction list filters, summary totals, transaction analysis, category counts, and MCP transaction reads all use the same effective activity date.
- Generated frontend API clients are regenerated from backend OpenAPI; no generated frontend files are hand-edited.
- Backend and frontend validation commands pass.
