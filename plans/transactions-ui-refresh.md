# Transactions UI Refresh

## Status

Implemented

## Goal

Refresh the Transactions surface so it matches a modern, flat, information-dense finance workflow. The page should show accurate filtered totals, keep desktop transaction review table behavior, and provide a mobile-first transaction list instead of squeezing a desktop grid into a phone viewport.

The first implementation slice is intentionally scoped to the Transactions route and shared transaction components. It should not change transaction sync, category semantics, auth, account management, or the Analysis route.

## Current Behavior

- `frontend/src/routes/_authed/transactions.tsx` owns transaction filter state, builds paginated `/transaction` query params, and renders one `TransactionsTable` for desktop and mobile.
- `frontend/src/components/TransactionsTable.tsx` uses Mantine React Table with compact density, virtualized infinite loading, inline category review/edit actions, and merchant metadata popovers.
- Mobile currently uses the same table component, which is less ergonomic than a grouped transaction list.
- The backend paginated transaction response in `backend/src/types/Transaction.ts` includes `data`, `total`, `pageIndex`, and `pageSize`, but no filtered totals. Any frontend-only KPI row would only summarize the loaded page and would be misleading.
- `backend/src/transaction/transaction.service.ts` already centralizes transaction filters through `applyQueryFilters` and `buildFilteredTransactionQuery`.

## Target Data Shape

Add a transaction summary API response generated from the same filters as the paginated transaction list:

```ts
type TransactionSummary = {
  currency: string
  inflow: MoneyWithSign
  outflow: MoneyWithSign
  net: MoneyWithSign
  transactionCount: number
  pendingCount: number
  needsReviewCount: number
}
```

The summary should aggregate all matching transactions, not only the currently loaded page. When `convert=true`, totals should be reported in the user's preferred currency using the existing currency conversion service.

## Milestones

### 1. Filtered Summary Contract

Implementation tasks:

- Add `TransactionSummarySchema` and `TransactionSummary` type in `backend/src/types/Transaction.ts`.
- Add `GET /transaction/summary` in `backend/src/transaction/transaction.controller.ts`.
- Add `TransactionService.getSummary(userId, filters)` that reuses existing query-filter behavior and aggregates filtered rows.
- Support `accountId`, `startDate`, `endDate`, `categoryPrimary`, `amountSign`, and `categoryReviewStatus`.
- Convert non-preferred-currency rows when `convert=true`, using the existing conversion service at the controller boundary.

Exit criteria:

- Summary totals are computed across all filtered rows.
- Category filters use effective category behavior consistent with the paginated list.
- Controller ignores invalid review status values as the paginated endpoint does.

### 2. Frontend Summary Strip

Implementation tasks:

- Regenerate `frontend/src/api/**` with `yarn orval`.
- Add a `TransactionSummaryStrip` component under `frontend/src/components/transactions/`.
- Fetch summary from the Transactions route using the same filter params as the infinite table query.
- Show inflow, outflow, net, transaction count, pending count, and needs-review count in a compact KPI strip.
- Preserve existing filter popover/drawer behavior.

Exit criteria:

- KPI values update when filters change.
- Loading and error states do not block the transaction table.
- The strip remains compact on desktop and wraps cleanly on mobile.

### 3. Desktop Table Polish

Implementation tasks:

- Add a status column for pending/review state.
- Right-align and color financial amount cells.
- Add merchant logo/initial fallback in `MerchantCell`.
- Keep existing metadata popover and category edit/review/reset workflows.
- Tune CSS for thinner borders, compact rows, and chip-like category/status presentation.

Exit criteria:

- Desktop table remains sortable and virtualized.
- Category editing and review actions still work.
- Amounts and statuses are scannable without adding large row height.

### 4. Mobile Transaction List

Implementation tasks:

- Add `TransactionsMobileList` under `frontend/src/components/transactions/`.
- Branch in the route: desktop uses `TransactionsTable`; mobile uses grouped list rows.
- Group rows by date, show merchant, account, category, amount, pending/review indicators, and a compact metadata affordance.
- Reuse the existing infinite-loading scroll callback.

Exit criteria:

- Mobile no longer renders the desktop grid.
- Date groups and transaction rows are touch-friendly and information-dense.
- Infinite loading still fetches more transactions near the bottom.

## Tests

### Backend

- Add service tests for summary totals, filters, pending count, and needs-review count.
- Add controller tests for default summary behavior, valid review-status forwarding, invalid review-status omission, and converted totals.

### Frontend

- Update route tests for summary hook params, summary strip rendering, and mobile list branching.
- Update table tests for status chips, merchant avatar fallback, and amount sign styling.
- Add mobile list tests for date grouping and fetch-more-on-scroll behavior.

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

## Overall Exit Criteria

- The Transactions page has an accurate filtered summary strip.
- Desktop remains a dense, sortable transaction review table with clearer merchant, amount, category, and status scanning.
- Mobile renders a date-grouped transaction list rather than a desktop grid.
- Existing category edit, review, reset, bulk review, and infinite loading behaviors continue to work.
- Generated API client reflects the new backend contract.
- Focused backend/frontend tests, frontend typecheck, and lint pass or any remaining failures are documented with concrete blockers.
