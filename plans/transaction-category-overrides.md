# Transaction Category Overrides Plan

## Status

Planned

## Goal

Allow users to override a transaction category while preserving the original provider category from Plaid. User-facing transaction views, analysis, and MCP/surface callers should use the effective category by default:

```text
effectiveCategory = userCategory ?? providerCategory
```

Provider-sync and audit/reset flows should still preserve and expose the original Plaid category.

## Current Behavior

- Plaid sync stores the provider category by resolving `personal_finance_category.primary/detailed` into `transaction_entity.categoryId`.
- `TransactionEntity.toObject()` returns `categoryId` and joined `category`.
- The transactions table renders `transaction.category`.
- Analysis and category filters use the provider category.
- There is no place to store a user override.

## Target Data Shape

Keep the existing `categoryId` as the provider/Plaid category. Add a separate nullable override:

```text
transaction_entity.categoryId            -- provider/Plaid category
transaction_entity.userCategoryId        -- user override, nullable
transaction_entity.userCategoryUpdatedAt -- nullable audit timestamp
```

Expose this API shape for transactions:

```ts
{
  categoryId: string | null
  category: Category | null

  userCategoryId: string | null
  userCategory: Category | null
  userCategoryUpdatedAt: string | null

  effectiveCategoryId: string | null
  effectiveCategory: Category | null
}
```

## Milestones

### 1. Data Model and Transaction Domain Shape

Implementation tasks:

- Add a TypeORM migration:
  - Add nullable `userCategoryId uuid`.
  - Add nullable `userCategoryUpdatedAt timestamptz`.
  - Add FK from `transaction_entity.userCategoryId` to `category_entity.id`.
- Update `TransactionEntity`:
  - Add `userCategoryId`.
  - Add `userCategoryUpdatedAt`.
  - Add `ManyToOne` relation `userCategory`.
  - Include `userCategory` in transaction service relations.
  - Update `toObject()` to compute `effectiveCategoryId` and `effectiveCategory`.
- Update transaction schemas:
  - Add `userCategoryId`, `userCategory`, `userCategoryUpdatedAt`, `effectiveCategoryId`, and `effectiveCategory` to `TransactionSchema`.
- Preserve Plaid sync behavior:
  - Plaid sync writes only `categoryId`.
  - Plaid sync must not overwrite `userCategoryId`.
  - If Plaid later changes `categoryId`, existing user overrides continue to win until reset.

Exit criteria:

- Migration applies to a fresh local database.
- Migration reverts cleanly.
- Existing transactions without overrides serialize with `effectiveCategory === category`.
- Transactions with `userCategoryId` serialize with `effectiveCategory === userCategory`.
- Plaid sync tests or service tests confirm modified transactions do not clear or overwrite `userCategoryId`.

### 2. Backend Category Override API

Implementation tasks:

- Add a focused category update DTO:

  ```ts
  {
    categoryId: string | null
  }
  ```

- Add category update endpoint:

  ```http
  PATCH /transaction/:id/category
  {
    "categoryId": "category-uuid" | null
  }
  ```

- Implement endpoint rules:
  - `categoryId === null`: clear `userCategoryId` and `userCategoryUpdatedAt`.
  - `categoryId === transaction.categoryId`: clear `userCategoryId` and `userCategoryUpdatedAt`.
  - `categoryId !== transaction.categoryId`: validate the category exists, set `userCategoryId`, and set `userCategoryUpdatedAt = now`.
  - Reject nonexistent categories.
  - Reject transactions owned by another user.
  - Return the updated `Transaction`.

Exit criteria:

- Setting a category different from the provider category creates an override.
- Setting the provider category clears the override.
- Sending `categoryId: null` clears the override.
- Invalid category IDs are rejected.
- Cross-user transaction updates are rejected.
- The endpoint response includes provider, user, and effective category fields.

### 3. Effective Category for Backend Consumers

Implementation tasks:

- Enforce effective category in transaction list filters:
  - Category filters should match `coalesce(userCategoryId, categoryId)`.
  - `UNCATEGORIZED` should mean both provider and user category are null after applying the effective-category rule.
  - Use query builder where TypeORM's simple `where` object cannot represent the effective-category predicate.
- Enforce effective category in analysis:
  - Audit `transaction-analysis.service.ts` for category joins, grouping, filtering, and drilldowns.
  - Replace provider category usage with `coalesce(t."userCategoryId", t."categoryId")` for user-facing category logic.
  - Keep provider category available only for audit/reset context.
- Enforce effective category in MCP/surface callers:
  - Transaction search/filter results should use effective category by default.
  - Preserve provider category only when a caller explicitly needs original provider context.

Exit criteria:

- Transaction list category filters match an override category.
- Transaction list category filters do not match the provider category once an override points elsewhere.
- Analysis summary groups overridden transactions under the override category.
- Analysis drilldown returns overridden transactions under the effective category.
- MCP/surface transaction results return and filter by effective category.

### 4. Category Selector Data and API Client Regeneration

Implementation tasks:

- Prefer a backend category list endpoint returning `id`, `primary`, `detailed`, and `description` if one is not already sufficient.
- Regenerate the frontend API client after backend OpenAPI changes:

  ```bash
  cd frontend && yarn orval
  ```

- Ensure generated transaction models expose provider, user, and effective category fields.
- Ensure generated category update mutation is available to the frontend.

Exit criteria:

- Frontend can fetch the list of category options by ID.
- Generated API models include `userCategoryId`, `userCategory`, `effectiveCategoryId`, and `effectiveCategory`.
- Generated API client includes the category update endpoint.
- No generated files under `frontend/src/api/**` are hand-edited.

### 5. Transactions Table Display

Implementation tasks:

- Update transactions table rendering:
  - Render `effectiveCategory`.
  - Use `effectiveCategoryId` as the edit control initial value.
  - Continue falling back to `--` when no effective category exists.
- Add override indicator:
  - Rows with `userCategoryId !== null` should show a subtle edited marker or icon.
  - Keep this visually quiet so the table stays scannable.

Exit criteria:

- Rows without overrides display their provider category.
- Rows with overrides display their user category.
- Rows with no effective category display the empty fallback.
- Override rows have a subtle visible or tooltip-backed indication that the category was edited.

### 6. Transactions Table Edit and Reset UX

Implementation tasks:

- Add category edit affordance:
  - On category cell hover, show an edit icon.
  - Edit mode replaces the read-only label with a searchable autocomplete selector.
  - Selecting a category calls `PATCH /transaction/:id/category`.
  - The backend decides whether the selection is an override or a revert.
  - Escape/cancel exits edit mode without mutation.
- Add reset affordance:
  - Rows with `userCategoryId !== null` show a reset icon on hover.
  - Reset calls `PATCH /transaction/:id/category` with `{ "categoryId": null }`.
  - Tooltip should clarify the reset target, for example `Reset to Plaid category: Restaurant`.
- Autocomplete labels should use the same category formatter as the table.
- Grouping by primary category is optional but useful.

Exit criteria:

- Hovering a category cell reveals an edit action.
- Activating edit shows a searchable selector initialized to `effectiveCategoryId`.
- Selecting a different category updates the row to display the selected category.
- Selecting the provider category clears the override after the backend response.
- Hovering an overridden category reveals a reset action.
- Reset clears the override and returns the displayed value to the provider category or empty fallback.
- Escape/cancel exits edit mode without sending a mutation.

## Tests

### Backend

- Migration applies and reverts cleanly.
- `TransactionEntity.toObject()` returns provider category as effective when no override exists.
- `TransactionEntity.toObject()` returns user category as effective when override exists.
- `TransactionEntity.toObject()` returns null effective category when both categories are null.
- Category update endpoint sets override when selected category differs from provider category.
- Category update endpoint clears override when selected category equals provider category.
- Category update endpoint clears override when `categoryId` is null.
- Category update endpoint rejects nonexistent category IDs.
- Category update endpoint rejects transactions owned by another user.
- Transaction list category filter matches user override category.
- Transaction list category filter no longer matches provider category when override points elsewhere.
- Analysis summary groups overridden transactions under user category.
- Analysis drilldown returns overridden transactions under effective category.
- MCP/surface transaction results return and filter by effective category.
- Plaid sync updates provider category without overwriting user override.

### Frontend

- Transactions table renders `effectiveCategory`.
- Hover reveals edit action.
- Rows with overrides reveal reset action.
- Edit selector initializes to `effectiveCategoryId`.
- Selecting a different category calls the category patch endpoint with the selected category ID.
- Selecting the provider category results in cleared override after the backend response.
- Reset calls the category patch endpoint with `categoryId: null`.
- Mutation invalidates or updates the transaction query so the row reflects the new effective category.

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

## Overall Exit Criteria

- A transaction with provider category `Restaurant` can be changed to `Groceries`.
- The transaction row displays `Groceries`.
- The API still preserves provider category `Restaurant`.
- Reset returns the displayed category to `Restaurant` without a Plaid resync.
- Selecting `Restaurant` in the editor also clears the override.
- Transaction table filters use `Groceries` while the override exists.
- Analysis and MCP/surface results use `Groceries` while the override exists.
- Plaid sync does not overwrite `userCategoryId`.
- Backend tests pass.
- Frontend tests, lint, typecheck, and regenerated API client are up to date.
