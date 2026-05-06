# Transaction Category Review Plan

## Status

Done

## Goal

Add a lightweight category review workflow for transactions.

Transactions should show their category as needing review by default. Users can accept the current category with a compact inline check action, or change the category through the existing inline category editor. Once reviewed, the category review dot disappears. Bulk review should operate on the current filtered transaction set, be count-aware, and show an undo toast.

For v1, review applies only to the transaction category. The data model should leave room for later property-level review, but this plan should not introduce a generalized review table yet.

## Current Behavior

- Transactions have a provider/system category in `transaction_entity.categoryId`.
- Transactions can have a user category override in `transaction_entity.userCategoryId`.
- `TransactionEntity.toObject()` exposes `effectiveCategory = userCategory ?? category`.
- The transactions table renders the effective category and already has compact hover/focus inline actions for edit and reset.
- `PATCH /transaction/:id/category` changes or clears the user category override.
- Transaction list filtering already uses effective category semantics for `categoryPrimary`.
- Plaid modified-transaction sync currently updates transaction fields through `applyUpdate()`, including `categoryId`.
- There is no category review status, review filter, single accept action, bulk accept action, or undo toast.

Important existing files:

- `backend/src/transaction/transaction.entity.ts`
- `backend/src/types/Transaction.ts`
- `backend/src/transaction/transaction.service.ts`
- `backend/src/transaction/transaction.controller.ts`
- `frontend/src/routes/_authed/transactions.tsx`
- `frontend/src/components/TransactionsTable.tsx`
- `frontend/src/components/TransactionsTable.module.css`

## Product Decisions

- Use "review" language in the UI: `Needs review`, `Reviewed`, `Mark as reviewed`.
- All existing transactions may remain unreviewed after migration. Do not backfill existing rows as reviewed.
- Pending transactions participate in the same review workflow as posted transactions.
- Resetting to the Plaid category counts as reviewed because the user made an explicit category decision.
- Uncategorized transactions can be reviewed.
- Bulk review only updates transactions that are currently unreviewed.
- Once a transaction category is reviewed, later Plaid syncs should not update that transaction's base `categoryId`. Other transaction fields may continue to sync.
- Do not add `categoryReviewedCategoryId` in v1.
- Do not add a separate review entity in v1.

## Target Data Shape

Add direct review metadata to `transaction_entity`:

```text
transaction_entity.categoryReviewedAt      -- timestamptz, nullable
transaction_entity.categoryReviewMethod    -- varchar, nullable
```

Use these method values:

```ts
type TransactionCategoryReviewMethod =
  | 'manual_accept'
  | 'manual_change'
  | 'bulk_accept'
```

Expose the review status in the transaction API:

```ts
type Transaction = {
  categoryId: string | null
  category?: Category | null

  userCategoryId: string | null
  userCategory?: Category | null
  userCategoryUpdatedAt: Date | null

  effectiveCategoryId: string | null
  effectiveCategory?: Category | null

  categoryReviewedAt: Date | null
  categoryReviewMethod: TransactionCategoryReviewMethod | null
  categoryNeedsReview: boolean
}
```

For v1:

```ts
categoryNeedsReview = categoryReviewedAt === null
```

Do not infer review status from `userCategoryId`; a transaction can be reviewed as uncategorized or reviewed while using the provider category.

## Milestones

### 1. Database and API Shape

Implementation tasks:

- Add a TypeORM migration after the current latest migration:
  - Add nullable `categoryReviewedAt timestamptz`.
  - Add nullable `categoryReviewMethod varchar`.
  - Do not backfill either column.
- Update `TransactionEntity`:
  - Add `categoryReviewedAt`.
  - Add `categoryReviewMethod`.
  - Initialize both fields to null in `fromDto()`.
  - Include both fields in `toObject()`.
  - Add computed `categoryNeedsReview`.
- Update `backend/src/types/Transaction.ts`:
  - Add review method schema.
  - Add `categoryReviewedAt`, `categoryReviewMethod`, and `categoryNeedsReview` to `TransactionSchema`.
- Regenerate frontend API models after backend OpenAPI changes.

Exit criteria:

- Fresh migrations create the new nullable fields.
- Migration reverts cleanly.
- Existing transactions serialize with `categoryNeedsReview: true`.
- Reviewed transactions serialize with `categoryNeedsReview: false`.
- Generated frontend models include the new review fields.

### 2. Single Transaction Review API

Implementation tasks:

- Add a focused endpoint for the inline check action:

  ```http
  PATCH /transaction/:id/category-review
  {
    "reviewed": true
  }
  ```

- Add support for undo through the same endpoint:

  ```http
  PATCH /transaction/:id/category-review
  {
    "reviewed": false
  }
  ```

- Endpoint rules:
  - `reviewed: true` sets `categoryReviewedAt = now` and `categoryReviewMethod = 'manual_accept'`.
  - `reviewed: false` clears `categoryReviewedAt` and `categoryReviewMethod`.
  - Transaction ownership must be scoped to the current user.
  - Return the updated `Transaction`.

Exit criteria:

- Clicking accept can mark a transaction reviewed without changing `categoryId` or `userCategoryId`.
- Undo can return the same transaction to needs-review state.
- Cross-user transaction review attempts are rejected.

### 3. Category Change Review Semantics

Implementation tasks:

- Update `TransactionService.updateCategory()` so any explicit category action marks the transaction reviewed:
  - Selecting a category different from the provider category sets `userCategoryId`, sets `userCategoryUpdatedAt`, sets `categoryReviewedAt = now`, and sets `categoryReviewMethod = 'manual_change'`.
  - Selecting the provider category clears `userCategoryId`, clears `userCategoryUpdatedAt`, sets `categoryReviewedAt = now`, and sets `categoryReviewMethod = 'manual_change'`.
  - Sending `categoryId: null` clears `userCategoryId`, clears `userCategoryUpdatedAt`, sets `categoryReviewedAt = now`, and sets `categoryReviewMethod = 'manual_change'`.
- Keep existing validation for assignable categories and user-owned custom categories.

Exit criteria:

- Editing a category removes the needs-review dot after mutation success.
- Resetting to the Plaid category removes the needs-review dot.
- Marking an uncategorized transaction as reviewed is possible through reset/null semantics.
- Existing override behavior still works.

### 4. Sync Lifecycle

Implementation tasks:

- Update the modified-transaction sync path so reviewed transactions do not have `categoryId` overwritten by Plaid.
- Keep provider category writes for unreviewed transactions:
  - New transactions still receive provider `categoryId`.
  - Modified unreviewed transactions may update provider `categoryId`.
  - Modified reviewed transactions keep their existing `categoryId`.
- Continue syncing non-category fields for reviewed transactions.

Exit criteria:

- Plaid modified sync updates merchant/date/amount/pending fields on reviewed transactions.
- Plaid modified sync does not update `categoryId` when `categoryReviewedAt` is not null.
- Plaid modified sync may update `categoryId` when `categoryReviewedAt` is null.
- User category overrides are still not overwritten by sync.

### 5. Review Filtering and Bulk Review API

Implementation tasks:

- Add a transaction list filter:

  ```text
  categoryReviewStatus=needs_review | reviewed
  ```

- Apply the filter in `findAllPaginated()`:
  - `needs_review`: `categoryReviewedAt IS NULL`.
  - `reviewed`: `categoryReviewedAt IS NOT NULL`.
- Add a bulk endpoint for current-filter review:

  ```http
  POST /transaction/category-review/bulk
  {
    "filters": {
      "accountId": "...",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "categoryPrimary": "...",
      "amountSign": "positive" | "negative",
      "categoryReviewStatus": "needs_review"
    }
  }
  ```

- Bulk endpoint rules:
  - Always update only transactions where `categoryReviewedAt IS NULL`.
  - Apply the same filter semantics as the transactions table.
  - Set `categoryReviewedAt = now` and `categoryReviewMethod = 'bulk_accept'`.
  - Return affected transaction IDs and count:

    ```ts
    type BulkTransactionCategoryReviewResponse = {
      count: number
      transactionIds: string[]
    }
    ```

- Add an undo endpoint for the toast:

  ```http
  POST /transaction/category-review/bulk/undo
  {
    "transactionIds": ["..."]
  }
  ```

- Bulk undo rules:
  - Scope IDs to the current user.
  - Clear review metadata only for IDs from the undo payload.
  - Do not change `categoryId` or `userCategoryId`.

Exit criteria:

- The transactions API can return only needs-review rows.
- The transactions API can return only reviewed rows.
- Bulk review marks only unreviewed transactions matching the current filters.
- Bulk undo reopens only the transactions affected by the bulk action.
- Bulk review does not alter category values.

### 6. Transactions Page Controls

Implementation tasks:

- Add a review status filter to `frontend/src/routes/_authed/transactions.tsx`:
  - `All`
  - `Needs review`
  - `Reviewed`
- Include `categoryReviewStatus` in the generated transaction query params.
- Show the bulk action when the current review status is `Needs review`:

  ```text
  Mark 42 as reviewed
  ```

- Scope the bulk action to the current filters:
  - Date range.
  - Account.
  - Category.
  - Amount sign.
  - Needs-review status.
- After bulk success:
  - Invalidate transaction queries.
  - Show Mantine toast:

    ```text
    Marked 42 transactions as reviewed. Undo
    ```

- Undo calls the bulk undo endpoint with returned transaction IDs, then invalidates transaction queries.

Exit criteria:

- Users can filter the table to needs-review transactions.
- Bulk action count matches the filtered needs-review total.
- Bulk action does not imply it affects loaded rows only; it applies to all matching filters.
- Undo restores the affected rows to the needs-review filter.

### 7. Transactions Table Review UI

Implementation tasks:

- Update the category cell in `TransactionsTable.tsx`:
  - Show a small dot before the category label when `categoryNeedsReview` is true.
  - The dot has an accessible label or tooltip: `Category needs review`.
  - Keep the dot visually quiet and do not rely on color alone.
- Add a compact check icon to the existing hover/focus action group:
  - Show only when `categoryNeedsReview` is true.
  - Tooltip: `Mark category as reviewed`.
  - Calls the single review endpoint with `reviewed: true`.
- Keep the existing edit icon and category picker:
  - Editing category continues to use the existing inline action style.
  - Mutation success should remove the dot because category changes mark reviewed.
- Add single-review toast with undo:

  ```text
  Category marked as reviewed. Undo
  ```

- Undo calls the single review endpoint with `reviewed: false`.

Exit criteria:

- Unreviewed rows show a dot before the category label.
- Reviewed rows do not show the dot.
- Hover/focus reveals a check action for unreviewed rows.
- The check action marks the row reviewed.
- The single-review undo toast restores the dot.
- Category edit and reset actions remain compact and accessible.

## Tests

### Backend

- Migration applies and reverts cleanly.
- `TransactionEntity.fromDto()` initializes review fields to null.
- `TransactionEntity.toObject()` returns `categoryNeedsReview: true` when `categoryReviewedAt` is null.
- `TransactionEntity.toObject()` returns `categoryNeedsReview: false` when `categoryReviewedAt` is set.
- Single review endpoint marks a transaction reviewed.
- Single review endpoint clears review metadata for undo.
- Single review endpoint rejects transactions owned by another user.
- Category update endpoint marks the transaction reviewed when setting an override.
- Category update endpoint marks the transaction reviewed when selecting the provider category.
- Category update endpoint marks the transaction reviewed when sending `categoryId: null`.
- Transaction list `categoryReviewStatus=needs_review` returns only rows with null `categoryReviewedAt`.
- Transaction list `categoryReviewStatus=reviewed` returns only rows with non-null `categoryReviewedAt`.
- Bulk review applies account/date/category/amount-sign filters and only marks unreviewed rows.
- Bulk undo clears review metadata only for current-user transaction IDs in the payload.
- Modified Plaid sync preserves `categoryId` for reviewed transactions.
- Modified Plaid sync may update `categoryId` for unreviewed transactions.
- Modified Plaid sync still preserves `userCategoryId`.

### Frontend

- Transactions table renders a dot before unreviewed categories.
- Transactions table omits the dot for reviewed categories.
- Unreviewed rows reveal a check icon on hover/focus.
- Clicking the check icon calls the single review mutation.
- Single review success shows an undo notification.
- Undo calls the single review endpoint with `reviewed: false`.
- Editing a category still calls the category update mutation.
- Category edit success removes the review dot after query refresh.
- Transactions page sends `categoryReviewStatus` in query params.
- Needs-review filter causes the bulk action to use `totalRows` for its count.
- Bulk review calls the bulk endpoint with the current filters.
- Bulk review success shows an undo notification.
- Bulk undo calls the undo endpoint with returned transaction IDs.
- Generated API client is not hand-edited.

## Validation Commands

Backend:

```bash
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

Feature-targeted examples:

```bash
cd backend && yarn test test/transaction/transaction.service.spec.ts
cd backend && yarn test test/transaction/transaction.controller.spec.ts
cd frontend && yarn test src/components/TransactionsTable.test.tsx
```

## Overall Exit Criteria

- New and existing transactions appear as needing category review until manually reviewed.
- The category review dot appears before the category label.
- Users can mark a category reviewed with a compact inline check action.
- Users can change a category through the existing inline category editor, and that action marks the category reviewed.
- Resetting to the Plaid category marks the category reviewed.
- Uncategorized transactions can be reviewed.
- Users can filter the transaction table to needs-review or reviewed rows.
- Users can bulk mark all needs-review transactions matching current filters as reviewed.
- Single and bulk review actions show undo toasts.
- Undo reopens reviewed rows without changing category values.
- Plaid sync does not change `categoryId` after a transaction category is reviewed.
- Plaid sync continues to update non-category transaction fields.
- Backend tests pass.
- Frontend tests, lint, typecheck, and regenerated API client are up to date.
