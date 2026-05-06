# Settings Categories Manager Plan

## Status

Planned

## Goal

Move category management out of the general Settings stack and into a dedicated `Categories` settings tab. The tab should manage both system/Plaid categories and user-created categories as one searchable inventory, while preserving the ownership and history rules already introduced by user-defined categories.

Users should be able to:

- Create, edit, archive, and restore custom categories.
- Hide or show any active category from future category dropdowns, including system defaults.
- Bulk hide/show selected system and custom categories.
- Bulk archive/restore selected custom categories.
- Bulk move selected active custom categories to a different primary category when the secondary labels should remain intact.
- Quickly filter by source, visibility, archived state, primary category, and search text.

Boundaries:

- System/Plaid categories cannot be renamed, archived, deleted, or reassigned by users.
- Hiding a category only affects future manual selector/dropdown results for that user.
- Rules, imports, and other deterministic automation paths may continue assigning hidden categories, but those automation UIs must disclose hidden category status.
- Archived custom categories cannot be hidden or shown while archived. Restore preserves the category's previous hidden/visible preference.
- Category visibility is row-level for v1. Hiding a primary group does not cascade; users can filter by primary and select multiple detailed rows instead.
- Usage counts in the manager reflect effective category usage only, not provider-original category assignments that have since been overridden.
- Hidden categories are removed from future manual override dropdowns, but transaction and analysis filters should still surface hidden categories when they exist in historical effective data.
- The Categories manager defaults to active rows only. Archived mode shows archived custom categories only.
- Hidden or archived categories must still render correctly on historical transactions that already reference them.
- The existing transaction override selector should continue to call a default category list endpoint that returns only currently selectable categories.

## Current Behavior

- Settings is a single vertical route in `frontend/src/routes/_authed/settings.tsx` with appearance, display, PAT, custom categories, and MCP sections stacked together.
- Custom category management lives in `frontend/src/components/settings/CustomCategoriesSection.tsx`.
- The current custom categories UI supports create, duplicate prevention, inline edit, archive, restore, and a `Show archived` checkbox.
- `backend/src/category/category.entity.ts` already models `source`, `userId`, `archivedAt`, and normalized labels.
- `backend/src/category/category.service.ts` exposes visible categories, custom categories, search, create, update, archive, restore, and assignable-category validation.
- There is no per-user visibility model for hiding system/Plaid categories from dropdowns.
- `GET /category` currently returns active Plaid categories plus active custom categories for the current user; consumers treat this as the selector-ready list.

Known constraints:

- Existing category selectors should not start showing hidden categories by accident.
- Bulk actions must be partial-success aware because a mixed selection can contain system rows, custom rows, hidden rows, active rows, and archived rows.
- Custom category archive state and dropdown visibility are related but not identical: archive is a custom-category lifecycle state; hidden is a user preference for selector visibility.

## UI/UX Notes From Skeleton

The generated UI skeleton establishes the target interaction model for the first implementation pass:

- Keep the existing app chrome and left navigation; the Settings page itself owns the `General`, `Access`, `Categories`, and `MCP` tabs.
- Use a full-width Categories manager surface rather than a narrow settings card.
- Put the toolbar above the table with this scan order:
  - Search categories.
  - Source segmented control: `All`, `System`, `Custom`.
  - Visibility dropdown.
  - `Archived` toggle.
  - Primary category dropdown.
  - Primary action button: `New category`.
- Show selection state as a bulk action bar immediately above the table. The bar should include selected count plus actions for hide, show, archive custom, restore custom, and set primary.
- Disable invalid bulk actions up front when the current selection contains incompatible rows, and explain the disabled state with a specific tooltip.
- Keep partial-success feedback directly below the bulk action bar for stale data or race cases, with a concise summary and a `View details` affordance for skipped rows.
- Use a dense selectable table for the inventory. Required columns are checkbox, category, source, status, used count, last used, and actions.
- Use source badges for `System` and `Custom`; use status badges for `Visible`, `Hidden`, and `Archived`.
- Use short status badge text in the table. The hidden badge should say `Hidden`; tooltips, row details, and helper text should clarify that it means hidden from manual dropdowns.
- Keep row actions icon-first with tooltips. The first pass should support edit, hide/show, archive, and restore where eligible.
- System rows should not show an edit icon. Use hide/show and details only.
- Use a right-side create/edit panel for custom categories instead of expanding rows. The create state should contain separate primary, secondary, and optional description fields, duplicate warning, and create/cancel actions. Visibility controls belong in edit, row actions, and bulk actions, not in initial creation.
- Use one right-side panel component with modes for `create`, `edit-custom`, `view-system`, and `view-archived`.
- Include simple client-side pagination for v1. Defer table virtualization unless real category volume or rendering cost requires it.
- Do not use marketing copy, onboarding cards, or explanatory empty-state art in this manager. Empty, loading, and error states should stay compact and operational.

Settled product decision from the skeleton:

- `hidden` means "hide from manual dropdowns." Rules, imports, and other deterministic automation paths may continue assigning hidden categories, as long as automation editing surfaces disclose when the selected category is hidden.
- Archived custom categories disable visibility controls. If a hidden custom category is archived and later restored, it returns as hidden; if a visible custom category is archived and later restored, it returns as visible.
- Bulk `Set primary` applies only to active custom categories. Archived custom categories must be restored before primary reassignment.
- Visibility is managed per category row. Hierarchical primary-category cascade controls are out of scope for v1.
- The `Used` column counts transactions where the category is currently the effective category.
- Hidden category history remains filterable in Transactions and Analysis.
- Archived custom categories are hidden from the manager's default view and shown only in archived mode.
- Custom category create/edit keeps separate `Primary category` and `Secondary category` fields. Any single `Category name` field shown in the skeleton is non-binding mockup copy.
- New custom categories are created visible by default. The create form does not include a hide-from-dropdowns control.
- Single-category create/edit supports optional description. Bulk description editing is out of scope.
- Do not add a dedicated description column to the manager table. Show description in create/edit/details surfaces when present.
- System category descriptions are read-only. Only custom category descriptions are editable, and only in single create/edit.
- The edit panel should always show concise helper text that renaming a custom category updates existing transactions that use it. Do not gate this message or the save flow on usage-count lookup.
- Archive actions should not require a confirmation modal. Archive is reversible through restore; use a toast with undo when the app's toast pattern is available.
- Visibility and lifecycle mutations should invalidate category selector queries after success. Do not add imperative cross-component logic to close or force-refresh already-open dropdown popovers.
- Keep Categories manager UI state local for v1. Do not persist manager filters, search, selection, or panel state in the URL.
- Make the Categories settings tab URL-addressable when low-cost, using the repo's preferred route/search-param pattern. Keep manager filters, search, selection, and panel state local.
- Preserve row selection across pagination page changes within the same filter/search state. Clear selection when search or filters change.
- Unsaved create/edit panel state is disposable in v1. Mode, filter, search, or Settings tab changes may close the panel and discard local edits without a confirmation modal.
- Hidden system categories still count as duplicate conflicts for custom category create/rename.
- Archived custom categories still count as duplicate conflicts for custom category create/rename. The UI should offer restore instead of creating a duplicate active row.
- Bulk selected count, eligibility, and disabled tooltips must evaluate all selected rows across pages, not only currently visible rows.
- Do not add a `select all matching filter` workflow in v1. Bulk actions operate only on explicitly selected category IDs.
- Fetch the manageable category inventory and do search, filters, sorting, and pagination client-side for v1. Category count is expected to stay modest.
- Support basic client-side column sorting in v1. Default sort should show active visible categories first, then category label alphabetically.
- System and custom categories share one table in v1. Do not split them into separate manager sections.

## Target Data Shape

Add a per-user visibility row instead of mutating global system categories:

```ts
type CategoryVisibilityPreference = {
  id: string
  userId: string
  categoryId: string
  hiddenAt: string | null
  createdAt: string
  updatedAt: string
}
```

Extend management responses with user-specific metadata:

```ts
type CategoryManagementItem = Category & {
  isHidden: boolean
  isSelectable: boolean
  /** Count of transactions where this category is the effective category. */
  transactionCount?: number
  /** Most recent transaction date where this category is the effective category. */
  lastUsedAt?: string | null
}
```

Bulk visibility request:

```ts
type BulkCategoryVisibilityDto = {
  categoryIds: string[]
  hidden: boolean
}
```

Bulk custom-category action request:

```ts
type BulkCustomCategoryActionDto =
  | { categoryIds: string[]; action: 'archive' | 'restore' }
  | { categoryIds: string[]; action: 'setPrimary'; primary: string }
```

Bulk custom actions intentionally do not support description updates.

Bulk responses still need skipped rows for stale data, authorization, and race cases. The frontend should not depend on partial success for ordinary mixed-selection UX.

Bulk response:

```ts
type BulkCategoryActionResponse = {
  requested: number
  updated: number
  skipped: Array<{
    categoryId: string
    reason: 'not_found' | 'not_owned' | 'system_category' | 'archived' | 'duplicate_conflict'
  }>
}
```

Duplicate conflict metadata should be rich enough for inline UI decisions:

```ts
type CategoryConflict = {
  categoryId: string
  label: string
  primary: string
  detailed: string
  source: 'plaid' | 'user'
  archivedAt: string | null
  isHidden?: boolean
}
```

Endpoint behavior:

- `GET /category`: active, unhidden, assignable categories for dropdowns.
- `GET /category/manage`: full management inventory for the current user, including active system rows, active current user custom rows, hidden state, and archived current user custom rows only when archived mode requests them. V1 returns the inventory as one result set rather than backend-paginated pages.
- Transaction and analysis category filters should use effective-history-derived options or a dedicated filter endpoint, not the selector-ready dropdown endpoint.
- `PATCH /category/visibility/bulk`: hide/show active categories for the current user.
- `PATCH /category/custom/bulk`: custom-only bulk archive, restore, and primary reassignment.
- Existing `POST /category/custom` and `PATCH /category/custom/:id` remain for single-row create/edit flows.
- Duplicate `409 Conflict` responses include source, archive status, hidden status when available, and display label so the frontend can show restore or conflict messaging without a second lookup.

## Milestones

### 1. Settings Route Tabs

Implementation tasks:

- Replace the single Settings stack with settings tabs or route-level subnavigation.
- Add tabs for `General`, `Access`, `Categories`, and `MCP` while preserving the existing `/settings` entry point.
- Make the selected Settings tab linkable, such as `/settings?tab=categories`, if it fits the existing TanStack Router conventions.
- Move the existing `CustomCategoriesSection` out of the general flow and replace it with a new `CategoriesManager` tab component.
- Keep existing settings save behavior scoped to the `General` tab.
- Keep Categories manager filters/search/selection/panel state local to the component.
- Preserve test IDs or add new stable ones for route tests.

Exit criteria:

- `/settings` opens a settings page with clear tab navigation.
- The Categories tab can be opened directly by URL when tab-level routing/search params are implemented.
- Existing appearance, currency, timezone, dashboard, PAT, and MCP controls still render in their expected tab.
- The Categories tab can be opened directly by user interaction without remount bugs or lost unsaved general settings.

### 2. Visibility Model and Dropdown Contract

Implementation tasks:

- Add a `CategoryVisibilityPreferenceEntity` with a unique `(userId, categoryId)` constraint.
- Add a migration for the visibility preference table.
- Update category queries so `GET /category` excludes rows hidden by the current user and excludes archived custom categories.
- Add `GET /category/manage` for the manager inventory. Include active system categories, active current user custom categories, hidden state, selectable state, and archived custom rows only when archived mode requests them.
- Populate management usage metadata from effective category references, not provider-original categories that have been overridden.
- Add `PATCH /category/visibility/bulk` to hide/show selected categories for the current user.
- Keep visibility updates row-scoped; do not add primary-level cascade semantics in v1.
- Reject visibility updates for archived custom categories.
- Ensure manual assignability checks reject hidden categories for future dropdown-driven category changes while continuing to serialize historical transaction categories.
- Keep non-dropdown automation paths, such as rules and imports, able to assign hidden categories.
- Add hidden-status disclosure wherever an automation configuration references a hidden category.

Exit criteria:

- A user can hide a system category without changing the global Plaid category row.
- Hiding a category affects only the selected detailed category row, not every category with the same primary.
- Hidden categories disappear from transaction override dropdowns for that user only.
- Archived custom categories cannot be hidden or shown until restored.
- Restored custom categories keep their pre-archive hidden/visible preference.
- Hidden categories still display on transactions that already reference them.
- Another user still sees the same system category unless they hide it themselves.
- Management usage counts match effective category usage.
- The default management inventory excludes archived custom categories unless requested.

### 3. Full Categories Manager UI

Implementation tasks:

- Build a dense manager surface with toolbar filters, selectable table rows, a bulk action bar, and a right-side create/edit panel.
- Add a `New category` primary action that opens the right-side panel without navigating away from the tab.
- In the toolbar, use search, source segmented control, visibility dropdown, archived toggle, and primary category dropdown in that order.
- In the inventory table, include checkbox, category, source, status, used count, last used, and actions columns.
- Keep description out of the main table columns to preserve density.
- Label usage columns plainly as `Used` and `Last used`; no separate provider-original count in v1.
- Show source badges for `System` and `Custom`, status badges for `Visible`, `Hidden`, and `Archived`.
- Keep badge labels short; use tooltip/detail copy for exact semantics such as `Hidden from manual dropdowns`.
- Support client-side search across primary, secondary, display pair, and source.
- Support client-side filters for source, visibility, archived state, and primary category.
- Support client-side sorting for `Category`, `Source`, `Status`, `Used`, and `Last used`.
- Default sorting should prioritize active visible rows, then sort by category label alphabetically.
- Keep system and custom rows mixed in one table, with source badges and filters handling distinction.
- Default archived mode off. When archived mode is on, show archived custom categories only rather than mixing them with active rows.
- In archived mode, disable source and visibility filters because archived rows are custom-only and cannot be hidden/shown. Keep search and primary category filtering enabled.
- Toggling archived mode clears selection and closes the right-side create/edit panel.
- Use primary filtering plus multi-select for group-like workflows instead of primary-level cascade controls.
- Do not sync manager filters, search, selection, or right-side panel state to URL query params in v1.
- Preserve selection across page changes, but clear selection when source, visibility, archived, primary, or search filters change.
- Close the right-side create/edit panel when archived mode changes.
- Close the right-side create/edit panel and discard unsaved local edits when filters/search/settings tab changes make the current panel context stale.
- Evaluate bulk action eligibility against the full selected-row set across pages.
- Support explicit row/page selection only. Do not implement select-all-matching-filter semantics in v1.
- Support simple client-side pagination for the category inventory.
- Add row actions:
  - System: hide/show and details only; no edit action.
  - Custom active: edit, hide/show, archive.
  - Custom archived: restore, view details, no dropdown visibility toggle until restored.
- Add bulk actions:
  - Hide from dropdowns.
  - Show in dropdowns.
  - Archive selected custom categories.
  - Restore selected archived custom categories.
  - Set primary for selected custom categories.
- Do not add a bulk description action.
- In archived mode, narrow row and bulk actions to restore/details. Hide/show, archive, and set primary should be disabled or absent.
- Disable invalid bulk actions with clear disabled states and tooltips when the current selection contains incompatible rows.
- Use these eligibility rules:
  - `Hide from dropdowns`: enabled only when all selected rows are active and at least one selected row is visible.
  - `Show in dropdowns`: enabled only when all selected rows are active and at least one selected row is hidden.
  - `Archive custom`: enabled only when all selected rows are active custom categories.
  - `Restore custom`: enabled only when all selected rows are archived custom categories.
  - `Set primary`: enabled only when all selected rows are active custom categories.
- Show bulk partial-success feedback below the action bar only when the API reports skipped rows despite frontend eligibility checks.
- Keep the right-side panel in sync with row edit state, create state, duplicate warnings, and pending mutation states.
- Reuse the right-side panel for create, custom edit, system details, and archived details modes.
- In edit state, expose visibility controls only for active custom categories; in create state, omit visibility controls.
- In create/edit state, support an optional description field for the selected custom category.
- System row details may show description as read-only when available.
- In edit state, show helper text: `Renaming a custom category updates existing transactions that use it.`
- Do not require a usage-count-gated confirmation before saving label edits.
- Keep create/edit duplicate prevention based on the primary/secondary pair.
- Keep duplicate detection during create and edit, including conflicts against system categories even when hidden, active custom categories, and archived custom categories.
- When a duplicate conflict points to an archived custom category, surface a restore path.
- The archived-duplicate restore affordance should immediately restore the conflicted custom category after explicit click. After restore, clear the create/edit form and show the restored category in the active table.
- When a duplicate conflict points to a hidden system category, surface a `Show existing system category` path instead of allowing a duplicate custom category.
- `Show existing system category` should immediately unhide the conflicted system category after the explicit click, with undo toast support when available.
- Archive actions should execute inline without modal confirmation and offer undo when supported.
- On successful create, rename, archive, restore, hide, show, or bulk update, invalidate category selector queries and transaction queries through React Query.

Exit criteria:

- A user can manage system and custom categories from one Categories tab.
- The Categories tab uses the skeleton layout: toolbar, bulk action bar, table, and right-side create/edit panel.
- System and custom categories appear in one shared table.
- Bulk hide/show works for mixed system and custom active selections.
- Bulk hide/show remains row-scoped, even when rows share the same primary category.
- Bulk archive/restore only affects eligible custom categories and reports skipped rows.
- Archive is reversible without a modal confirmation; users can restore archived categories from the archived filter/toggle.
- Visibility actions are disabled for archived custom categories.
- Invalid bulk actions are disabled with a tooltip that tells the user which incompatible rows to deselect.
- Bulk primary reassignment is disabled for archived custom categories.
- Bulk primary reassignment rejects duplicate conflicts and surfaces skipped rows.
- The manager remains usable with hundreds of categories.
- Archived mode shows archived custom rows only.
- Archived mode disables source and visibility filters while keeping search and primary filtering available.
- Archived mode changes clear selection and close the right-side create/edit panel.
- Client-side search/filter/sort/pagination remains responsive with the seeded system taxonomy plus expected custom category volume.
- Users can sort by category, source, status, used count, and last used without a refetch.
- Reloading or leaving the page resets manager-local filters, search, selection, and panel state.
- Unsaved create/edit panel changes do not block archived mode, filter/search, pagination, or Settings tab changes.
- Pagination can span selected rows across pages until filters/search change.
- Bulk action disabled states and selected count reflect the full cross-page selection.
- Bulk actions operate only on explicitly selected category IDs, not every row matching the current filters.

### 4. Selector, Cache, and Historical Display Integration

Implementation tasks:

- Invalidate category selector queries and transaction queries after visibility, archive, restore, rename, create, or bulk update actions.
- Let currently mounted or open category dropdowns update through query-cache changes only; do not build explicit cross-component dropdown synchronization.
- Ensure transaction category dropdowns use the selector-ready `GET /category` response, not the management inventory.
- Keep effective category serialization unchanged for historical transactions.
- Keep transaction and analysis category filters able to show hidden categories that exist in historical effective data.
- Avoid using selector-ready category options for historical category filters when that would hide filterable history.
- Add an empty/dropdown-safe fallback when every category in a primary group is hidden.

Exit criteria:

- Hidden categories are unavailable for new manual dropdown overrides.
- Hidden categories remain available in transaction and analysis filters when historical effective data uses them.
- Rules and imports can continue assigning hidden categories, and automation editing surfaces disclose hidden status.
- Existing transactions with hidden or archived categories still show readable labels.
- Bulk changes are reflected immediately in dropdowns after cache invalidation.
- Open dropdown popovers are not forcibly closed or imperatively refreshed.
- Analysis and transaction filters do not break when a hidden category appears in historical data.

## Tests

### Backend

- Visibility preference creation is per user and does not mutate system category rows.
- Visibility preference updates affect only specified category IDs, not sibling rows in the same primary category.
- Management `transactionCount` and `lastUsedAt` are based on effective category usage.
- `GET /category` excludes hidden system categories, hidden custom categories, and archived custom categories.
- `GET /category/manage` returns hidden system rows and current user custom rows with management metadata.
- Default `GET /category/manage` excludes archived custom rows; archived mode returns archived custom rows only.
- Transaction and analysis filter option queries include hidden categories when they appear in historical effective data.
- Bulk hide/show updates eligible categories and reports skipped category IDs.
- Bulk custom archive/restore rejects system categories and another user's custom categories.
- Visibility updates reject archived custom categories.
- Restore preserves the hidden/visible preference that existed before archive.
- Bulk set-primary rejects archived custom categories, duplicate normalized category pairs, and reports conflicts.
- Duplicate validation treats hidden system categories as conflicts.
- Duplicate validation treats archived custom categories as conflicts and supports restore-oriented conflict handling.
- Duplicate conflict responses include enough metadata for archived restore messaging without an extra lookup.
- Restoring an archived duplicate from conflict handling immediately restores it, clears the create/edit form, invalidates category consumers, and returns the user to the active table state.
- Hidden system duplicate conflicts expose a show-existing-category resolution path.
- Showing an existing hidden system duplicate immediately unhides that category and invalidates selector queries.
- Manual assignability rejects hidden categories for new dropdown-driven transaction overrides.
- Rule/import assignment can still use hidden categories.
- Automation configuration responses expose enough hidden-category metadata for UI disclosure.
- Historical transaction serialization still includes hidden and archived category labels.
- Migration test or schema assertion covers the visibility preference unique constraint.

### Frontend

- Settings renders tab navigation and moves category management to the Categories tab.
- Categories tab renders the toolbar, bulk action bar, table columns, and right-side create/edit panel from the skeleton.
- Categories manager loads system and custom categories with source/status badges.
- Categories manager renders system and custom categories in one shared table rather than separate sections.
- System rows expose hide/show and details actions, but no edit action.
- Hidden status uses a compact `Hidden` badge with tooltip/detail copy explaining manual-dropdown scope.
- Categories manager hides archived custom rows by default and shows only archived custom rows in archived mode.
- Archived mode disables source and visibility filters.
- Toggling archived mode clears selection and closes create/edit state.
- Closing create/edit state from navigation or filter changes discards unsaved local edits without confirmation.
- Client-side search and filters narrow the visible category rows.
- Column sorting works client-side for category, source, status, used count, and last used.
- Manager search/filter state stays local and is not encoded in route search params.
- Categories tab navigation is URL-addressable separately from manager-local search/filter state.
- Primary filtering plus multi-select supports group workflows without cascade semantics.
- New category opens the create panel and cancel closes it without changing table selection.
- Create/edit uses separate primary and secondary category fields.
- Create/edit supports optional description.
- Description is available from create/edit/details surfaces, not as a dedicated table column.
- System descriptions are read-only; custom descriptions are editable only in single create/edit.
- New category creation does not expose hide/show controls and creates a visible category by default.
- Row edit opens the edit panel with current category values.
- Row details open the same right-side panel in read-only details mode.
- Edit panel explains historical transaction label impact without requiring usage lookup.
- Row hide/show actions call the visibility endpoint and invalidate category consumers.
- Category consumers update through query invalidation, without imperative dropdown synchronization.
- Bulk hide/show enables for active rows and sends selected IDs.
- Bulk archive/restore only enables for eligible custom selections.
- Archive actions do not open confirmation modals and expose restore/undo recovery.
- Visibility controls are disabled for archived custom rows.
- Restoring an archived custom row displays the preserved hidden/visible status.
- Disabled bulk actions explain the incompatible selection in a tooltip.
- Bulk set-primary is disabled for archived custom rows.
- Bulk set-primary validates input and handles skipped/conflict responses.
- Bulk actions do not support description edits.
- Partial-success responses from stale/race cases show the summary and expose skipped-row details.
- Create/edit duplicate warnings still block invalid submissions.
- Hidden system category duplicates are shown as duplicate conflicts.
- Archived custom duplicates are shown as duplicate conflicts with a restore affordance.
- Clicking the archived-duplicate restore affordance immediately restores the category, clears the form, and shows the restored category in the active table.
- Hidden system category duplicates offer a show-existing-category affordance.
- Clicking the show-existing-category affordance immediately unhides the category and supports undo when available.
- Hidden categories disappear from transaction category selector after invalidation.
- Hidden categories remain findable in transaction and analysis filter UIs when historical effective data uses them.
- Hidden-category rule/import behavior is represented in the manager helper text.
- Automation editing surfaces show hidden status when a rule/import references a hidden category.
- Pagination controls preserve selection and filters.
- Selection persists across page changes and clears on filter/search changes.
- Bulk action eligibility and tooltips account for selected rows on other pages.
- No select-all-matching workflow exists in v1; tests should cover explicit selected IDs only.
- Loading, empty, error, partial-success, and mobile layouts render cleanly.

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
cd frontend && yarn test src/routes/_authed/settings.test.tsx src/components/settings/CustomCategoriesSection.test.tsx src/components/TransactionsTable.test.tsx
```

## Overall Exit Criteria

- Category management is a dedicated Settings tab, not a section buried in the general settings stack.
- Users can create, edit, hide, show, archive, restore, and bulk-manage eligible categories from a single manager.
- The manager matches the generated skeleton's operational layout: tabbed settings, top filters, selected-row bulk action bar, dense table, and right-side create/edit panel.
- System categories can be hidden from dropdowns per user but cannot be renamed, archived, or deleted.
- Custom categories retain existing ownership, duplicate-prevention, archive, restore, and historical-display behavior.
- Hidden and archived categories are unavailable for new dropdown selections but remain readable wherever historical transactions reference them.
- Hidden category history remains filterable in Transactions and Analysis.
- Archived categories cannot be hidden or shown, and restore preserves the previous hidden/visible preference.
- Hidden-category behavior outside manual dropdowns, especially rules and imports, remains allowed and is deliberately disclosed in automation UI.
- API clients are regenerated and backend/frontend validation commands pass.
