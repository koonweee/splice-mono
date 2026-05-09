# User Category Authority

## Status

Planned

## Goal

Make user-owned categories the only actual transaction categories.

Provider categories from Plaid should no longer be stored as category rows or used as fallback categories. They should be stored directly on transactions as provider guidance only. A transaction without a user category is `UNCATEGORIZED` for filtering, analysis, MCP/export, and UI display.

This is a coordinated breaking backend/frontend/API migration. Do not preserve compatibility aliases for the old `category` / `userCategory` / `effectiveCategory` split.

Decisions:

- `category_entity` remains the table/entity name, but rows are user-owned categories only.
- `Category.source` is removed.
- `Category.userId` remains internal and is hidden from API responses.
- Plaid/system category rows are deleted after provider hints are backfilled.
- The old Plaid CSV seed migration becomes a no-op, and docs/scripts should stop instructing category seeding from Plaid CSV.
- `transaction.categoryId` and `transaction.category` mean the user-assigned category only.
- `transaction.userCategoryId`, `transaction.userCategory`, `effectiveCategoryId`, and `effectiveCategory` are removed from the public contract.
- `transaction.userCategoryUpdatedAt` is preserved and renamed to `categoryUpdatedAt`.
- Provider category data is stored as `providerCategoryHint` guidance with raw provider codes plus `displayLabel`.
- Category review workflow is removed. `categoryNeedsReview` and review metadata/endpoints go away.
- `TransactionSummary.needsReviewCount` is replaced with `uncategorizedCount`.
- Filtering and analysis use user category only; `categoryPrimary=UNCATEGORIZED` means `transaction.categoryId IS NULL`.
- The transaction category dropdown contains current user's active categories only.
- Clearing a transaction category makes it uncategorized. UI copy should say `Clear category` / `Uncategorized`, not `Use provider category`.
- Provider hint UI is informational only and appears inline only for uncategorized rows.
- Duplicate category validation is per user and includes archived categories.
- Category visibility preferences are removed. Archive/restore is the only category availability control.

## Current Behavior

- `backend/src/category/category.entity.ts` stores both Plaid taxonomy rows and user rows via `source: 'plaid' | 'user'`.
- `backend/src/migrations/1773607000000-SeedCategories.ts` fetches Plaid's personal finance category CSV and inserts Plaid categories into `category_entity`.
- `backend/src/migrations/1775400000000-AddUserDefinedCategories.ts` adds `source`, `userId`, `archivedAt`, and partial unique indexes for active Plaid/user category pairs.
- `backend/src/category/category-visibility-preference.entity.ts` and `backend/src/category/category.service.ts` support hiding system categories per user.
- `backend/src/transaction/transaction.entity.ts` stores provider category in `categoryId` and user override in `userCategoryId`, then serializes `effectiveCategory = userCategory ?? category`.
- `backend/src/types/Transaction.ts` exposes `category`, `userCategory`, `effectiveCategory`, category review fields, and category review DTOs.
- `backend/src/transaction/transaction.service.ts` resolves Plaid `personalFinanceCategory` strings into seeded category IDs during sync, filters with `COALESCE(transaction.userCategoryId, transaction.categoryId)`, and protects provider category changes after review.
- `backend/src/transaction-analysis/transaction-analysis.service.ts` groups transactions by `userCategory?.primary ?? category?.primary ?? 'UNCATEGORIZED'`.
- `backend/src/mcp/mcp-read.service.ts` lists all category rows and serializes effective category values for MCP clients.
- `frontend/src/routes/_authed/transactions.tsx`, `frontend/src/components/TransactionsTable.tsx`, and `frontend/src/components/transactions/TransactionsMobileList.tsx` use generated category hooks, effective category fields, review controls, and provider reset language.
- `frontend/src/components/settings/CustomCategoriesSection.tsx` manages system and custom categories, hidden/visible state, system duplicate conflicts, and custom archive/restore.
- Generated frontend API files under `frontend/src/api/**` must be regenerated with `yarn orval` after backend OpenAPI changes.

## Target Data Shape

Categories become user-owned app categories only:

```ts
type Category = {
  id: string
  primary: string
  detailed: string
  description: string
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
```

Provider hints are transaction metadata, not categories:

```ts
type ProviderCategoryHint = {
  /** Banking provider that supplied this category hint. */
  provider: 'plaid'

  /** Raw provider primary category code, not an app category. */
  primary: string | null

  /** Raw provider detailed category code, not an app category. */
  detailed: string | null

  /** Human-readable display label derived from provider category fields. */
  displayLabel: string | null

  /** Provider confidence level for this category hint. */
  confidenceLevel: string | null

  /** Provider icon URL for this category hint. */
  iconUrl: string | null
}
```

Transactions expose user category as the actual category:

```ts
type Transaction = {
  categoryId: string | null
  category?: Category | null
  categoryUpdatedAt: string | null
  providerCategoryHint: ProviderCategoryHint | null
}
```

Remove from the public transaction contract:

```ts
userCategoryId
userCategory
userCategoryUpdatedAt
effectiveCategoryId
effectiveCategory
categoryReviewedAt
categoryReviewMethod
categoryNeedsReview
```

Replace summary review count:

```ts
type TransactionSummary = {
  uncategorizedCount: number
}
```

## Milestones

### 1. Database Migration And Legacy Seed Cleanup

Implementation tasks:

- Add a new migration after `1776000000000-AddTransactionReportingDateOverride.ts`.
- Add provider hint columns to `transaction_entity`:
  - `providerCategoryProvider varchar nullable`
  - `providerCategoryPrimary varchar nullable`
  - `providerCategoryDetailed varchar nullable`
- Backfill provider hint columns from the old `transaction_entity.categoryId -> category_entity` join where `category_entity.source = 'plaid'`.
- Preserve existing user category assignments by converting old `transaction_entity.userCategoryId` into the new actual `transaction_entity.categoryId`.
- Preserve old `transaction_entity.userCategoryUpdatedAt` by renaming or copying it to `categoryUpdatedAt`.
- Drop `transaction_entity.userCategoryId`, old `userCategoryUpdatedAt`, category review columns, and any old category FK that represented provider category if the migration must recreate the FK.
- Ensure the final `transaction_entity.categoryId` FK points to user category rows in `category_entity`.
- Delete Plaid rows from `category_entity` after provider hints are backfilled and transaction category IDs have been repointed.
- Delete visibility rows from `category_visibility_preference_entity`, then drop the visibility table.
- Remove category uniqueness indexes that depend on `source`.
- Add a per-user unique index on `category_entity ("userId", "normalizedPrimary", "normalizedDetailed")` without excluding archived rows.
- Drop `source` from `category_entity`.
- Keep `userId`, `archivedAt`, normalized columns, and description.
- Edit `backend/src/migrations/1773607000000-SeedCategories.ts` so `up()` and `down()` are no-ops with a comment explaining provider categories are now transaction hints.
- Remove Plaid taxonomy CSV dependency and related guidance from docs/plans/scripts where it is still actionable.

Exit criteria:

- Existing transactions with old `userCategoryId` retain that category through new `categoryId`.
- Existing transactions without old `userCategoryId` have `categoryId = null`.
- Existing old Plaid provider category rows backfill provider hint primary/detailed before deletion.
- Existing category review metadata is removed and no longer affects sync or serialization.
- Fresh databases do not fetch Plaid category CSV.
- Existing databases do not retain Plaid rows or category visibility rows.
- Migration down path is explicit about what can and cannot be restored, especially deleted Plaid rows and removed review metadata.

### 2. Backend Category API Simplification

Implementation tasks:

- Update `backend/src/category/category.entity.ts`:
  - Remove `source`.
  - Keep `userId` internal.
  - Ensure `setLabels()` uses normal user-category normalization for all rows.
- Update `backend/src/types/Category.ts`:
  - Remove `source`, `userId`, `isHidden`, and `isSelectable` from response schemas.
  - Remove `BulkCategoryVisibilityDtoSchema`.
  - Remove `system_category` and hidden-system conflict semantics.
- Update `backend/src/category/category.service.ts`:
  - `findAll(userId)` returns active current-user categories only.
  - `search(userId, query)` searches active current-user categories only.
  - `findManagement(userId, { archivedMode })` returns current-user categories only, active by default or archived when requested.
  - `findCustom()` can be deleted if it becomes redundant with `findManagement()` / `findAll()`, or retained only if still used.
  - Duplicate detection checks current user's categories including archived rows.
  - Remove visibility preference repository usage and hidden-category logic.
  - Remove Plaid/system duplicate checks and “show existing system category” conflict handling.
  - `findActiveAssignableCategory(id, userId)` only accepts active categories owned by `userId`.
- Update `backend/src/category/category.controller.ts`:
  - Remove `PATCH /category/visibility/bulk`.
  - Keep endpoint names for `GET /category`, `GET /category/search`, `GET /category/manage`, `POST /category/custom`, `PATCH /category/custom/:id`, and `PATCH /category/custom/bulk`, but narrow contracts to current-user categories only.
- Update `backend/src/category/category.module.ts` to remove `CategoryVisibilityPreferenceEntity`.

Exit criteria:

- Users cannot read, assign, update, archive, restore, or duplicate-check another user's category.
- Plaid/system rows are impossible to return from category APIs because they no longer exist.
- Archived categories are excluded from assignment/search, included only in management archived mode, and still block duplicate creation/rename.
- Backend category service tests cover current-user-only results, archived duplicate conflicts, archive/restore, and rejected cross-user assignment.

### 3. Backend Transaction Contract And Sync

Implementation tasks:

- Add `ProviderCategoryHintSchema` in `backend/src/types/Transaction.ts` with API comments/JSDoc for raw provider codes and `displayLabel`.
- Add transaction provider hint columns and fields in `backend/src/transaction/transaction.entity.ts`.
- Update `TransactionEntity.fromDto()` and `toObject()`:
  - `categoryId` and `category` serialize actual user category only.
  - `categoryUpdatedAt` serializes the preserved user category timestamp.
  - `providerCategoryHint` is built from provider hint columns plus existing `personalFinanceCategoryIconUrl` and `personalFinanceCategoryConfidenceLevel`.
  - `providerCategoryHint.displayLabel` is derived server-side from raw provider primary/detailed values.
- Update `backend/src/types/Transaction.ts`:
  - Remove `userCategory*`, `effectiveCategory*`, and category review fields.
  - Remove `UpdateTransactionCategoryReviewDtoSchema`, bulk review schemas, and review status schemas.
  - Replace `needsReviewCount` in `TransactionSummarySchema` with `uncategorizedCount`.
- Update `backend/src/transaction/transaction.service.ts`:
  - Remove `buildCategoryLookup()` and `resolveCategoryId()`.
  - During Plaid sync, persist `personalFinanceCategory.primary/detailed` directly into provider hint columns.
  - Always refresh provider hint fields on modified transactions.
  - Never update actual `categoryId` during provider sync.
  - `updateCategory()` and `bulkUpdateCategories()` only set/clear user category IDs.
  - `categoryId: null` clears the user category and `categoryUpdatedAt`.
  - Assigning a category validates active ownership through `CategoryService.findActiveAssignableCategory()`.
  - Remove category review methods, endpoints, undo paths, and summary logic based on review columns.
  - Update `applyQueryFilters()` so `UNCATEGORIZED` means `transaction.categoryId IS NULL`, and non-null `categoryPrimary` joins against `category.primary`.
  - Update bulk undo token payloads to preserve `categoryId` and `categoryUpdatedAt`.
- Update `backend/src/transaction/transaction.controller.ts`:
  - Remove `PATCH /transaction/:id/category-review`.
  - Remove `POST /transaction/category-review/bulk` and undo endpoint.
  - Remove `categoryReviewStatus` query params.
- Update `backend/src/bank-link/providers/plaid/plaid.provider.ts` only as needed to keep passing raw `personalFinanceCategory` strings through the DTO.

Exit criteria:

- Provider sync stores provider hints without requiring category rows.
- Transaction API responses expose actual user category only plus `providerCategoryHint`.
- `categoryId: null` means uncategorized everywhere.
- Summary `uncategorizedCount` is computed from missing actual category.
- Existing transaction service/controller tests are updated for the new contract and no category review endpoints remain.

### 4. Analysis, MCP, And Surface APIs

Implementation tasks:

- Update `backend/src/transaction-analysis/transaction-analysis.service.ts`:
  - Remove provider category fallback in `getEffectiveCategoryPrimary()`.
  - Group by `transaction.category?.primary ?? 'UNCATEGORIZED'`.
  - Keep `BALANCE_ADJUSTMENT` behavior unchanged.
- Update `backend/src/mcp/mcp-read.service.ts`:
  - `listCategories()` lists current user's categories plus synthetic `UNCATEGORIZED`.
  - Transaction category fields represent actual user category only.
  - Add provider hint fields to MCP transaction output as guidance metadata, not category fields.
  - Update category filters so `UNCATEGORIZED` means `transaction.categoryId IS NULL`.
- Update `backend/src/transaction/transaction-surface.types.ts` and `backend/src/transaction/transactions-surface.service.ts`:
  - Treat `categoryPrimary` as actual user category only.
  - Add provider hint fields as guidance metadata where surface clients expose transaction details.
- Update any MCP tool descriptions in `backend/src/mcp/mcp.service.ts` so clients understand provider info is guidance and category filters are user-category filters.

Exit criteria:

- Analysis totals place transactions with no user category under `UNCATEGORIZED`, even when provider hints exist.
- MCP/export/read clients do not treat provider hints as actual categories.
- Category-filtered MCP/surface reads match backend transaction list semantics.

### 5. Frontend API Regeneration And Transaction UI

Implementation tasks:

- Regenerate frontend API client with `cd frontend && yarn orval` after backend OpenAPI changes.
- Update `frontend/src/lib/format.ts`:
  - Keep user category label formatting simple and preserve entered labels.
  - Move Plaid hint formatting responsibility to backend `providerCategoryHint.displayLabel`; frontend should not need raw Plaid formatting for normal display.
- Update `frontend/src/routes/_authed/transactions.tsx`:
  - Remove category review filter and bulk review controls.
  - Replace `needsReviewCount` references with `uncategorizedCount`.
  - Build assignment options from `GET /category` user categories only.
  - Rename bulk null option from `Use provider category` to `Clear category` or `Make uncategorized`.
  - Keep `categoryPrimary` filter, with `UNCATEGORIZED` as the null-category sentinel.
- Update `frontend/src/components/TransactionsTable.tsx`:
  - Use `transaction.category` as the actual category.
  - Show `Uncategorized` when `category` is null.
  - For uncategorized rows with `providerCategoryHint`, show a small info icon/popover with `displayLabel`, confidence, and icon when available.
  - Remove checkmark “Mark category as reviewed” action and related loading states.
  - Rename reset/clear copy to `Clear category`.
  - Remove override badge semantics if they only distinguished provider vs user category.
- Update `frontend/src/components/transactions/TransactionsMobileList.tsx` with the same category display, clear action, and provider-hint behavior.
- Update `frontend/src/components/transactions/transactionMetadata.ts`:
  - Treat category fields as actual user category.
  - Use `providerCategoryHint` only as guidance metadata.
- Update `frontend/src/components/CategoryTransactionsModal.tsx` as needed for user-category-only filtering.

Exit criteria:

- Transaction rows with no user category display `Uncategorized`.
- Uncategorized rows with Plaid hints show the informational hint affordance.
- Categorized rows do not show inline provider hint.
- Category dropdowns contain user categories only.
- Clearing a category makes the row uncategorized and reveals the provider hint if present.
- No review-status UI, review filter, bulk review, or mark-reviewed action remains.

### 6. Frontend Category Management Simplification

Implementation tasks:

- Update `frontend/src/components/settings/CustomCategoriesSection.tsx`:
  - Remove source filters, system/custom badges, hidden/visible filters, and hide/show bulk actions.
  - Remove `view-system` panel mode and system category details.
  - Remove hidden-system conflict action.
  - Keep create, edit, archive, restore, bulk archive, bulk restore, and bulk set-primary.
  - Treat all returned categories as current-user categories.
  - Update empty states and error copy to avoid system/category visibility language.
- Update `frontend/src/routes/_authed/settings.tsx` only if section naming/copy needs adjustment.

Exit criteria:

- Settings category manager has one concept: user categories.
- Archived categories are still available through archived mode and restore.
- Duplicate conflicts against archived categories offer restore.
- No source, system, hidden, visible, or Plaid category copy remains in category management UI.

## Tests

### Backend

- Update `backend/test/category/category.service.spec.ts`:
  - Current-user-only category lists.
  - Active-only assignment/search.
  - Archived categories excluded from dropdown/search but included in archived management mode.
  - Archived duplicate conflicts block create/rename.
  - Cross-user category assignment rejected.
  - Visibility/system category tests removed.
- Update `backend/test/transaction/transaction.service.spec.ts`:
  - `processSyncResults()` stores provider hint fields and never changes user `categoryId`.
  - `updateCategory()` assigns/clears actual user category and updates/clears `categoryUpdatedAt`.
  - Bulk category update and undo preserve category state.
  - Filtering uses user category only and `UNCATEGORIZED` means null `categoryId`.
  - Summary returns `uncategorizedCount`.
  - Review endpoint/service tests removed.
- Update `backend/test/transaction/transaction.controller.spec.ts` for removed review endpoints and query params.
- Update `backend/test/transaction-analysis/transaction-analysis.service.spec.ts` so provider-only transactions aggregate as `UNCATEGORIZED`.
- Update `backend/test/mcp/mcp-read.service.spec.ts` for user-category-only category lists and provider hint guidance.
- Add migration tests or focused migration verification if the project has an existing harness; otherwise include manual migration validation commands in PR notes.

### Frontend

- Regenerate and update API model usage in tests.
- Update `frontend/src/routes/_authed/transactions.test.tsx`:
  - No review filter or bulk review UI.
  - `uncategorizedCount` rendering.
  - Category filter uses user-category primaries.
  - Bulk clear category sends `categoryId: null`.
- Update `frontend/src/components/TransactionsTable.test.tsx`:
  - Unassigned transaction displays `Uncategorized`.
  - Provider hint icon/popover appears only for uncategorized rows with hints.
  - Categorized rows use `category` and do not show inline provider hint.
  - Clear action uses new copy and sends `categoryId: null`.
  - Mark-reviewed action is absent.
- Update `frontend/src/components/transactions/TransactionsMobileList.test.tsx` with the same behaviors.
- Update `frontend/src/components/settings/CustomCategoriesSection.test.tsx`:
  - No system/visibility filters or hide/show controls.
  - Archive/restore/bulk set-primary still work.
  - Archived duplicate restore path remains.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/category test/transaction/transaction.service.spec.ts test/transaction-analysis test/mcp
cd backend && yarn test
cd backend && yarn lint
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/components/TransactionsTable.test.tsx src/components/transactions/TransactionsMobileList.test.tsx src/routes/_authed/transactions.test.tsx src/components/settings/CustomCategoriesSection.test.tsx
cd frontend && yarn test
cd frontend && yarn lint
cd frontend && yarn typecheck
```

Manual/UI validation:

- Start local dev with backend and frontend.
- Use the local auth bypass from `AGENTS.md`.
- In Transactions desktop and mobile layouts:
  - Confirm uncategorized transactions show `Uncategorized`.
  - Confirm provider hint icon/popover appears only on uncategorized rows with provider hints.
  - Confirm assigning a user category updates the row and hides the inline provider hint.
  - Confirm clearing a category returns the row to `Uncategorized`.
  - Confirm category filters and summary counts use user categories only.
- In Settings:
  - Confirm category management has no system/source/visibility controls.
  - Confirm archive/restore and duplicate restore flows work.
- Use browser validation screenshots/accessibility checks for the transaction table, mobile list, and settings category manager after frontend changes.

## Overall Exit Criteria

- The database no longer stores Plaid category rows.
- Fresh database setup does not fetch Plaid taxonomy CSV.
- Existing user category assignments are preserved as actual transaction categories.
- Existing provider categories are preserved as transaction-level provider hints where the old Plaid category row was available.
- `transaction.categoryId` means user category only.
- Transactions without user category are treated as `UNCATEGORIZED` in list filters, summaries, analysis, MCP/export, and surface reads.
- Provider hints never affect filtering, analysis, MCP category fields, or assignment dropdowns.
- Category review workflow is fully removed from backend, frontend, API schemas, and tests.
- Category visibility preferences are fully removed from backend, frontend, API schemas, and tests.
- Generated frontend API client matches the backend OpenAPI contract.
- Backend and frontend validation commands pass.
