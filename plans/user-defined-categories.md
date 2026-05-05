# User-Defined Categories Plan

## Status

Planned

## Goal

Allow users to create their own transaction categories from Settings, using a primary category and secondary category input flow that searches existing categories as they type. The system should prevent duplicate category pairs in the UI and enforce the same rule in the backend.

Custom categories should behave like existing Plaid categories everywhere users choose or view effective transaction categories. Provider/Plaid categories remain global reference data; custom categories are user-owned and cannot be selected by other users.

Decisions:

- Custom categories are private per user.
- Exact normalized duplicates are blocked, not merely warned, against both Plaid categories and the user's active custom categories.
- Normalization trims leading/trailing whitespace, collapses repeated internal whitespace, and compares case-insensitively.
- Custom labels are stored and displayed as entered after basic whitespace cleanup; normalized values are used only for comparison and indexes.
- Renaming a custom category updates the category row, so all transactions referencing that category ID show the new label.
- Custom categories can be archived but not hard-deleted in the UI.
- Plaid/global categories cannot be archived by users.
- Category creation is Settings-only for the first version.
- Custom categories show a `User` badge in management lists and selector metadata. Plaid categories have no badge.
- Archived user categories can be shown in Settings behind a `Show archived` toggle with restore support.
- Duplicate backend responses use `409 Conflict` and include the matching category ID and display label.
- `description` remains optional in the API but hidden from the first Settings UI.

## Current Behavior

- Categories are stored in `backend/src/category/category.entity.ts` as global reference rows with `primary`, `detailed`, and `description`.
- `category_entity` currently has `UNIQUE(primary, detailed)`, which fits global Plaid taxonomy rows but does not model per-user categories.
- `GET /category` in `backend/src/category/category.controller.ts` returns all categories ordered by `primary` and `detailed`.
- The transactions table fetches `useCategoryControllerFindAll()` and uses the returned categories for the category override selector.
- Transaction category overrides are now represented with `transaction_entity.userCategoryId`, `userCategory`, and effective category fields.
- Settings currently lives in `frontend/src/routes/_authed/settings.tsx` and already uses Mantine cards, inputs, and save/error states.

Known constraints:

- Existing category consumers assume category IDs can be used directly for transaction overrides.
- Category names are currently raw Plaid enum-like strings, but custom categories should accept user-friendly labels.
- Duplicate detection must be case-insensitive and whitespace-normalized so `Food`, ` food `, and `FOOD` do not create confusing near-duplicates.
- Renaming a custom category intentionally affects historical transaction display because transactions point at the category ID.
- Archiving a custom category removes it from future selection without breaking historical transaction display.

## Target Data Shape

Extend categories so a row can be either a global provider category or a user-owned custom category:

```ts
type Category = {
  id: string
  primary: string
  detailed: string
  description: string
  source: 'plaid' | 'user'
  userId: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}
```

Add normalized fields or equivalent unique indexes for backend duplicate checks:

```ts
type CategoryUniquenessKey = {
  userId: string | null
  normalizedPrimary: string
  normalizedDetailed: string
}
```

API contracts:

```ts
type CreateCustomCategoryDto = {
  primary: string
  detailed: string
  description?: string | null
}

type UpdateCustomCategoryDto = {
  primary?: string
  detailed?: string
  description?: string | null
  archived?: boolean
}

type CategoryConflict = {
  categoryId: string
  label: string
  primary: string
  detailed: string
  source: 'plaid' | 'user'
}
```

Proposed endpoints:

- `GET /category`: return active global Plaid categories plus active custom categories for the current user.
- `GET /category/search?q=...`: return visible categories matching primary, detailed, or formatted label for autocomplete and duplicate prevention.
- `POST /category/custom`: create a user-owned category after duplicate validation.
- `PATCH /category/custom/:id`: rename, describe, archive, or restore a user-owned category.
- `GET /category/custom?includeArchived=true`: return the current user's custom categories for the Settings management list, optionally including archived rows.

## Milestones

### 1. Backend Category Ownership and Validation

Implementation tasks:

- Add nullable `userId`, `source`, `archivedAt`, and normalized key support to `CategoryEntity`.
- Add a migration that preserves existing rows as `source = 'plaid'`, `userId = null`, and `archivedAt = null`.
- Replace or supplement `UNIQUE(primary, detailed)` with constraints that support:
  - One active global Plaid category per normalized primary/secondary pair.
  - One active custom category per user per normalized primary/secondary pair.
- Implement a shared category normalization helper that trims, collapses internal whitespace, and compares case-insensitively.
- Add service methods for visible category lookup, search, duplicate detection, creation, update, archive, and restore.
- Validate custom category names with length limits and non-empty primary and secondary labels.
- Reject custom category creation when the normalized pair already exists in either global Plaid categories or the requesting user's active custom categories.
- Reject custom category renames that would create the same duplicate conflict.
- Return `409 Conflict` with `CategoryConflict` details when creation or rename hits an existing normalized pair.
- Ensure transaction category update validation only accepts global categories or categories owned by the requesting user.
- Ensure archive and restore operations only apply to categories with `source = 'user'` and the requesting user's `userId`.

Exit criteria:

- Existing Plaid categories continue to seed and resolve during Plaid sync.
- `GET /category` returns global categories plus only the current user's active custom categories.
- `POST /category/custom` creates a user-owned category and rejects duplicates with a clear 409 response.
- Users cannot create, update, archive, restore, or assign another user's custom categories.
- Users cannot archive Plaid/global categories.

### 2. API Client and Category Selector Integration

Implementation tasks:

- Add Zod schemas for `CreateCustomCategoryDto`, `UpdateCustomCategoryDto`, duplicate error responses where useful, and expanded `Category`.
- Regenerate the frontend API client with `cd frontend && yarn orval`.
- Update the transaction category selector so custom categories appear alongside Plaid categories.
- Label custom categories with a subtle `User` badge in selector metadata, without making the table category cell noisy.
- Keep Plaid/global categories unlabeled.
- Invalidate category and transaction queries after category creation, archive, restore, or rename.

Exit criteria:

- The transaction override editor can assign a custom category.
- A custom category assignment persists as `userCategoryId` and displays through `effectiveCategory`.
- Custom categories show a `User` badge in selectors.
- Archived custom categories no longer appear in selectors, while transactions that already use them still render their historical category label.

### 3. Settings Category Management UI

Implementation tasks:

- Add a `CustomCategoriesSection` under Settings, separate from display preferences, PAT, and MCP sections.
- Use two searchable inputs:
  - Primary category.
  - Secondary category.
- Autocomplete primary suggestions from visible category primary values.
- Autocomplete secondary suggestions from existing categories, scoped by the selected or typed primary when possible.
- Show matching existing category pairs while the user types so duplicates are obvious before submit.
- Disable submit when the normalized primary/secondary pair matches an existing visible category.
- Submit `POST /category/custom` and handle backend duplicate responses even if the UI missed a race.
- List the user's custom categories with edit and archive actions.
- Show a `User` badge beside custom category rows.
- Add a `Show archived` toggle that reveals archived custom categories with restore actions.
- Keep `description` out of the initial UI even though the API accepts it.
- Keep the first version in Settings only; do not add category creation inside the transaction table editor yet.

Exit criteria:

- A user can create a custom category from Settings using primary and secondary category inputs.
- Typing an existing category pair shows an autocomplete match and prevents duplicate submission.
- Backend duplicate errors surface inline near the form.
- Created categories appear immediately in Settings and in the transaction category selector.
- Archived custom categories can be revealed and restored in Settings.

### 4. Rename, Archive, and Historical Display

Implementation tasks:

- Support renaming user-owned custom categories by updating the category row; transactions keep referencing the same category ID and display the new label.
- Keep archived category rows available for joined transaction display but hide them from `GET /category` selector responses by default.
- Add `includeArchived=true` only to the Settings custom category management endpoint.
- Prevent archive, restore, and rename operations on Plaid/global categories.
- Ensure analysis, MCP/surface transaction reads, and category filters continue to use effective category joins for assigned custom categories.

Exit criteria:

- Removing a custom category from active use does not break transactions that already reference it.
- Renaming a custom category updates labels for existing transactions that reference it.
- Category filters and analysis work with active custom categories.
- Historical transactions with archived custom categories still display a readable label.

## Tests

### Backend

- Category service creation succeeds for a unique user-owned primary/secondary pair.
- Creation rejects duplicates against global Plaid categories.
- Creation rejects duplicates against the same user's custom categories with case and whitespace normalization.
- Creation allows two different users to create the same custom pair if it does not duplicate a global Plaid category.
- Rename rejects duplicates against global Plaid categories and the same user's custom categories.
- Search returns visible global categories and the current user's custom categories, but not another user's custom categories.
- Transaction category update accepts a current user's custom category.
- Transaction category update rejects another user's custom category.
- Archive hides categories from default category list/search but preserves transaction serialization for existing references.
- Archive rejects Plaid/global categories.
- Settings management endpoint returns archived rows only when requested.
- Migration test or schema assertion covers new constraints and existing Plaid rows.

### Frontend

- Settings renders the custom category section after existing settings controls.
- Primary input autocompletes existing primary values.
- Secondary input autocompletes existing detailed values and matching category pairs.
- Duplicate primary/secondary pairs disable submit and show a clear inline message.
- Successful create invalidates category queries and clears the form.
- Backend duplicate response displays inline.
- Custom categories list shows `User` badges and supports edit/archive/restore states.
- Archived custom categories are hidden until `Show archived` is enabled.
- Transactions table selector includes custom categories after the category query refreshes.
- Transactions table selector shows `User` badges for custom categories and no badge for Plaid categories.

## Validation Commands

Backend:

```bash
cd backend && yarn test
cd backend && yarn lint
cd backend && yarn migration:show
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test
cd frontend && yarn lint
cd frontend && yarn typecheck
```

Targeted checks:

```bash
cd backend && yarn test test/category test/transaction/transaction.service.spec.ts
cd frontend && yarn test src/routes/_authed/settings.test.tsx src/components/TransactionsTable.test.tsx
```

## Overall Exit Criteria

- Users can create active custom categories in Settings with primary and secondary labels.
- Autocomplete helps users discover existing categories before creating a duplicate.
- Backend validation prevents duplicate visible category pairs and rejects unauthorized custom category usage.
- Backend validation blocks user archiving or renaming Plaid/global categories.
- Custom categories are available in transaction category override flows and flow through effective category display, filters, analysis, and MCP/surface results.
- Renaming custom categories updates labels for transactions referencing the same category ID.
- Archiving custom categories hides them from future selection but preserves historical transaction labels.
- API clients are regenerated and backend/frontend validation commands pass.
