# Transaction Bulk Category Edit

## Status

Done

## Goal

Add a bulk edit mode to the transactions page so users can select loaded transactions, assign a category or reset selected rows to their provider category, save atomically, and undo the change from the success toast.

Bulk mode is intentionally selection-based, not filter-wide. It should only act on transaction IDs the user selected from the currently loaded result set. Selection persists while scrolling and while additional pages load, but clears when the active transaction query changes or bulk mode is turned off.

## Current Behavior

- [frontend/src/routes/_authed/transactions.tsx](/Users/jtkw/splice-mono/frontend/src/routes/_authed/transactions.tsx) owns transaction filters, sorting, infinite loading, desktop/mobile switching, summary data, and the existing bulk category review flow.
- The route fetches pages of 50 transactions and flattens all loaded pages into `flatData`; loaded rows remain in memory while scrolling.
- [frontend/src/components/TransactionsTable.tsx](/Users/jtkw/splice-mono/frontend/src/components/TransactionsTable.tsx) renders the desktop table with Mantine React Table. Desktop uses row virtualization, so DOM rows may unmount while the loaded `data` array remains stable.
- [frontend/src/components/transactions/TransactionsMobileList.tsx](/Users/jtkw/splice-mono/frontend/src/components/transactions/TransactionsMobileList.tsx) renders grouped mobile rows and currently opens a details drawer on row tap.
- Single-row category edits use `PATCH /transaction/:id/category` through `useTransactionControllerUpdateCategory`; changing, clearing, or resetting a category marks the transaction reviewed with `categoryReviewMethod: 'manual_change'`.
- Existing bulk review uses `POST /transaction/category-review/bulk` and `POST /transaction/category-review/bulk/undo`, but that flow only changes review metadata. It does not change category overrides.
- Category assignment options come from `useCategoryControllerFindAll()` in the row-level editors. Filter category options use primary-category values and are not precise enough for assignment.
- Existing tests cover row-level category edits in [frontend/src/components/TransactionsTable.test.tsx](/Users/jtkw/splice-mono/frontend/src/components/TransactionsTable.test.tsx), mobile category edits in [frontend/src/components/transactions/TransactionsMobileList.test.tsx](/Users/jtkw/splice-mono/frontend/src/components/transactions/TransactionsMobileList.test.tsx), and bulk review undo in [frontend/src/routes/_authed/transactions.test.tsx](/Users/jtkw/splice-mono/frontend/src/routes/_authed/transactions.test.tsx).

## Product Decisions

- Bulk mode is enabled from a toggle on the top right of the transactions table/page controls.
- Bulk mode adds per-row checkboxes on desktop and mobile. Desktop no longer needs a table-header select-all checkbox.
- In bulk mode, clicking or tapping a transaction row toggles selection. Normal row details/edit behavior is paused until bulk mode exits.
- The floating toolbar is the shared selection control hub on desktop and mobile. It includes selected count, a select-loaded control, a category dropdown, and a save button.
- The select-loaded control selects all loaded transaction IDs at the moment it is clicked. Newly loaded rows remain unselected, and the select-loaded control becomes indeterminate when loaded rows are mixed selected/unselected.
- Selection state is keyed by transaction ID and must not depend on row index or currently rendered DOM rows.
- Selection persists during scroll and when more pages load.
- Selection clears when filters, date range, amount sign, review status, sorting, or any transaction query identity changes. It also clears when bulk mode turns off or after a successful save.
- Bulk save assigns a specific category ID from assignable category options, not a primary category string.
- The toolbar also supports `Use provider category`, represented as `categoryId: null`, to clear selected rows' user category overrides.
- Saving bulk category changes marks all selected transactions reviewed, including selected rows that already had the target effective category.
- Bulk category changes record a new `categoryReviewMethod` value: `bulk_change`.
- Pending transactions are selectable and editable.
- Bulk save is all-or-nothing. If the target category or any selected transaction cannot be updated, no row changes.
- Undo is toast-only for v1. It restores each transaction's exact previous `userCategoryId`, `userCategoryUpdatedAt`, `categoryReviewedAt`, and `categoryReviewMethod`.
- Bulk mode and selected rows are local component state only. Do not persist them to the URL or local storage.

## Target Data Shape

Extend the existing review method enum in [backend/src/types/Transaction.ts](/Users/jtkw/splice-mono/backend/src/types/Transaction.ts) and the generated frontend models:

```ts
type TransactionCategoryReviewMethod =
  | 'manual_accept'
  | 'manual_change'
  | 'bulk_accept'
  | 'bulk_change'
```

Add a request for selected-ID bulk category edits:

```ts
type BulkTransactionCategoryUpdateDto = {
  transactionIds: string[]
  categoryId: string | null
}
```

Add a response that supports toast-only undo without persisting an undo history:

```ts
type BulkTransactionCategoryUpdateResponse = {
  count: number
  transactionIds: string[]
  undo: BulkTransactionCategoryUpdateUndoToken
}
```

The undo token may be an opaque signed string or another server-verifiable snapshot format. It must be safe against client tampering, scoped to the current user and updated transaction IDs, and short-lived enough to match toast-only undo semantics. The undo operation restores previous user category and review metadata exactly, but only while the toast can still submit a valid token.

No database migration is required unless the implementation chooses to persist short-lived undo records. Prefer a signed, client-carried undo payload for v1 so undo remains toast-only and non-durable.

## Milestones

### 1. Backend Contract And Atomic Service

Implementation tasks:

- Update `TransactionCategoryReviewMethodSchema` in [backend/src/types/Transaction.ts](/Users/jtkw/splice-mono/backend/src/types/Transaction.ts) to include `bulk_change`.
- Add Zod schemas and exported types for:
  - `BulkTransactionCategoryUpdateDto`.
  - `BulkTransactionCategoryUpdateResponse`.
  - `BulkTransactionCategoryUpdateUndoDto`.
  - The internal undo snapshot/token shape.
- Add endpoints in [backend/src/transaction/transaction.controller.ts](/Users/jtkw/splice-mono/backend/src/transaction/transaction.controller.ts):
  - `POST /transaction/category/bulk`
  - `POST /transaction/category/bulk/undo`
- Implement service methods in [backend/src/transaction/transaction.service.ts](/Users/jtkw/splice-mono/backend/src/transaction/transaction.service.ts):
  - Validate `transactionIds` are non-empty after de-duping.
  - Load all selected transactions by ID and `userId` with `account`, `category`, and `userCategory` relations.
  - Fail the whole request if any requested transaction is missing or not owned by the current user.
  - Validate concrete `categoryId` with `CategoryService.findActiveAssignableCategory(categoryId, userId)`.
  - Treat `categoryId: null` as `Use provider category`, clearing `userCategoryId`, `userCategory`, and `userCategoryUpdatedAt` per row.
  - For a concrete category that matches a row's provider `categoryId`, clear the user override for that row.
  - For a concrete category that differs from a row's provider category, set `userCategoryId`, `userCategory`, and `userCategoryUpdatedAt`.
  - Set `categoryReviewedAt = now` and `categoryReviewMethod = 'bulk_change'` on every updated row.
  - Save all changed rows in one transaction.
  - Generate a short-lived server-verifiable undo payload containing each row's previous category override and review metadata.
  - Undo should verify user scope, verify the undo payload, restore previous metadata exactly, and save all rows in one transaction.
- Keep structured logging consistent with backend guidance: context object first, static message second.

Exit criteria:

- A bulk category update with selected IDs either updates every selected row or none.
- Selecting `Use provider category` clears overrides per row and still marks rows reviewed.
- Selecting a concrete category sets or clears overrides according to each row's provider category.
- Undo restores previous `userCategoryId`, `userCategoryUpdatedAt`, `categoryReviewedAt`, and `categoryReviewMethod`.
- Cross-user transaction IDs, missing transaction IDs, and unassignable category IDs fail without partial updates.

### 2. Generated Client And Route State

Implementation tasks:

- Regenerate the frontend API client with `cd frontend && yarn orval` after the backend OpenAPI contract changes.
- In [frontend/src/routes/_authed/transactions.tsx](/Users/jtkw/splice-mono/frontend/src/routes/_authed/transactions.tsx), add local state for:
  - `bulkModeEnabled`.
  - `selectedTransactionIds`, preferably as a `Set<string>` or record keyed by transaction ID.
  - `bulkCategoryId`, where a sentinel UI value maps to `categoryId: null`.
- Derive `loadedTransactionIds` from `flatData`.
- Clear selection when:
  - `bulkModeEnabled` changes to false.
  - The transaction query identity changes, including filters, date range, amount sign, review status, and sorting.
  - A bulk save succeeds.
- Preserve selection when:
  - The user scrolls.
  - Additional pages load.
- Add generated bulk category update and undo mutations.
- Invalidate transaction and category-related queries after save and undo, matching the existing invalidation approach used by table and mobile row edits.

Exit criteria:

- Bulk mode and selected rows are local-only and do not alter route search params.
- Selection persists across virtualization and infinite scroll because it is keyed by transaction ID.
- Selection clears on query changes before a user can save hidden stale selections.
- Generated client files under `frontend/src/api/**` are regenerated, not hand-edited.

### 3. Desktop Bulk Selection UI

Implementation tasks:

- Add a top-right bulk edit toggle to the transactions page controls in [frontend/src/routes/_authed/transactions.tsx](/Users/jtkw/splice-mono/frontend/src/routes/_authed/transactions.tsx).
- Pass bulk mode props into [frontend/src/components/TransactionsTable.tsx](/Users/jtkw/splice-mono/frontend/src/components/TransactionsTable.tsx):
  - `bulkModeEnabled`.
  - `selectedTransactionIds`.
  - `onToggleTransactionSelection`.
- In `TransactionsTable`, configure stable row identity with `getRowId: (row) => row.id` if Mantine React Table row selection features are used.
- Add a leftmost checkbox column only in bulk mode, or use Mantine React Table row selection configured so selection is controlled by transaction ID.
- Do not use a table header select-all checkbox for this feature. Select-loaded belongs in the floating toolbar.
- In bulk mode, row click toggles selection and inline category/date/details affordances do not open.
- Ensure selected rows have a visible selected state that works in light and dark themes.
- Keep column sizing stable so enabling bulk mode does not make merchant, amount, or category text overlap.

Exit criteria:

- Desktop bulk mode shows per-row checkboxes as the leftmost column.
- Row selection survives scrolling through virtualized rows.
- Clicking a row in bulk mode toggles selection instead of opening row details or inline editors.
- Desktop select-all behavior is only available from the floating toolbar.

### 4. Mobile Bulk Selection UI

Implementation tasks:

- Pass bulk mode props into [frontend/src/components/transactions/TransactionsMobileList.tsx](/Users/jtkw/splice-mono/frontend/src/components/transactions/TransactionsMobileList.tsx).
- Render a checkbox before the merchant logo when bulk mode is enabled.
- In bulk mode, tapping a row toggles selection instead of opening the details drawer.
- Keep normal drawer behavior unchanged when bulk mode is disabled.
- Add selected-row visual treatment in [frontend/src/components/transactions/TransactionsMobileList.module.css](/Users/jtkw/splice-mono/frontend/src/components/transactions/TransactionsMobileList.module.css).
- Ensure mobile row layout still fits around 390px wide without amount overlap.

Exit criteria:

- Mobile bulk mode shows a checkbox before each transaction logo.
- Mobile row taps toggle selection while bulk mode is enabled.
- The details drawer, category editor, reporting date editor, and reset actions continue to work when bulk mode is disabled.
- Long merchant names, badges, and amount text do not overlap with the checkbox at common mobile widths.

### 5. Floating Toolbar, Save, And Toast Undo

Implementation tasks:

- Add a floating bottom toolbar component, preferably in `frontend/src/components/transactions/TransactionBulkEditToolbar.tsx` if route-local JSX becomes too large.
- Show the toolbar only when bulk mode is enabled and at least one transaction is selected.
- Include:
  - Selected count.
  - A select-loaded checkbox/control with checked and indeterminate states derived from `loadedTransactionIds` and `selectedTransactionIds`.
  - A searchable category `Select` or Combobox populated from assignable categories by ID.
  - A `Use provider category` option that maps to `categoryId: null`.
  - A save button with pending state and disabled state when no category action is selected.
- Select-loaded behavior:
  - If all loaded rows are selected, clicking clears loaded-row selection.
  - If none or some loaded rows are selected, clicking selects all currently loaded rows.
  - Newly loaded rows are not auto-selected, causing the control to become indeterminate when appropriate.
- On save success:
  - Invalidate transaction/category queries.
  - Clear selection.
  - Show a success toast with the updated count and an Undo button.
  - Undo calls the generated bulk undo endpoint with the returned undo payload.
- On save or undo failure:
  - Show an error notification.
  - Do not clear selection on save failure.

Exit criteria:

- The toolbar works the same way on desktop and mobile.
- Select-loaded checked/indeterminate state is accurate as more pages load.
- Save sends selected transaction IDs and either a concrete category ID or `null`.
- The success toast Undo restores the exact previous state for all affected rows.
- Closing, ignoring, refreshing after, or navigating away from the toast means undo is no longer available in v1.

## Tests

### Backend

- Update [backend/test/transaction/transaction.service.spec.ts](/Users/jtkw/splice-mono/backend/test/transaction/transaction.service.spec.ts):
  - Bulk category update sets overrides and `bulk_change` review metadata.
  - Bulk category update clears overrides for `categoryId: null`.
  - Bulk category update clears overrides when the selected category equals a row's provider category.
  - Rows already matching the target category are still marked reviewed.
  - Missing, unowned, or unassignable inputs fail without saving partial rows.
  - Undo restores previous override and review metadata exactly.
- Update [backend/test/transaction/transaction.controller.spec.ts](/Users/jtkw/splice-mono/backend/test/transaction/transaction.controller.spec.ts):
  - Controller delegates bulk category update and undo to `TransactionService` with `user.userId`.
  - Invalid request bodies are rejected by Zod validation where existing controller test style covers that.
- Add or update OpenAPI/schema expectations if the generated contract tests cover transaction schemas.

### Frontend

- Update [frontend/src/routes/_authed/transactions.test.tsx](/Users/jtkw/splice-mono/frontend/src/routes/_authed/transactions.test.tsx):
  - Bulk mode toggle appears and clears selected IDs when disabled.
  - Selection clears when filters or sorting change.
  - Floating toolbar sends selected transaction IDs and selected category on save.
  - Success notification exposes Undo and calls the generated undo mutation.
  - Select-loaded selects currently loaded IDs and does not auto-select newly loaded rows.
- Update [frontend/src/components/TransactionsTable.test.tsx](/Users/jtkw/splice-mono/frontend/src/components/TransactionsTable.test.tsx):
  - Desktop bulk mode renders a leftmost checkbox column.
  - Row click toggles selection in bulk mode.
  - Existing category/date actions still work when bulk mode is disabled.
- Update [frontend/src/components/transactions/TransactionsMobileList.test.tsx](/Users/jtkw/splice-mono/frontend/src/components/transactions/TransactionsMobileList.test.tsx):
  - Mobile bulk mode renders checkbox before logo.
  - Row tap toggles selection and does not open the drawer in bulk mode.
  - Normal drawer/category behavior still works when bulk mode is disabled.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/transaction/transaction.service.spec.ts
cd backend && yarn test test/transaction/transaction.controller.spec.ts
cd backend && yarn lint
cd backend && yarn typecheck
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/routes/_authed/transactions.test.tsx
cd frontend && yarn test src/components/TransactionsTable.test.tsx
cd frontend && yarn test src/components/transactions/TransactionsMobileList.test.tsx
cd frontend && yarn lint
cd frontend && yarn typecheck
```

Manual and browser validation:

```bash
cd backend && yarn start:dev
cd frontend && yarn dev
```

- Use `$agent-browser` to validate `/transactions` at desktop width and around 390px mobile width.
- Confirm selected rows remain selected while scrolling and loading additional pages.
- Confirm select-loaded becomes indeterminate after selecting loaded rows and then loading more rows.
- Confirm selection clears after changing filters or sorting.
- Confirm save, toast undo, and post-undo table refresh work without console errors.
- Confirm mobile text and controls do not overlap in bulk mode.

## Overall Exit Criteria

- Users can enable bulk edit mode, select loaded transactions, choose a concrete category or `Use provider category`, save atomically, and undo from the toast.
- Selection is keyed by transaction ID, survives scroll/virtualization, and clears on query changes or mode exit.
- Desktop and mobile share the same floating toolbar behavior, including select-loaded checked and indeterminate states.
- Bulk category changes mark transactions reviewed with `categoryReviewMethod: 'bulk_change'`.
- Undo restores exact previous category override and review metadata for every affected transaction.
- Pending transactions are supported.
- Generated API clients are in sync with backend OpenAPI.
- Targeted backend and frontend tests, lint, and typecheck pass.
