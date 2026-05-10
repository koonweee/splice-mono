# User-Specified Category Colors

## Status

Done

## Implementation Summary

Implemented in May 2026.

- Backend categories now persist normalized hex colors, generate defaults on create and duplicate, and include a migration that backfills existing rows.
- Category and transaction analysis API contracts expose colors, with analysis aggregate colors resolved per inflow/outflow aggregate from the largest contributing category row.
- Frontend generated models include color fields, category management supports color create/edit, and shared color helpers choose readable foreground/border styles for arbitrary valid hex colors.
- Category selectors, assigned transaction displays, mobile transaction rows, and analysis charts render persisted category colors with fallbacks for synthetic or legacy values.
- Focused backend/frontend tests, lint, typecheck, frontend build, API regeneration, migration status, browser validation, and independent review passed.

## Goal

Allow users to set a color for each category from the Categories manager, while the backend guarantees every category has a usable default color on existing rows and newly created rows.

Category colors should flow through the same backend API contracts and generated frontend models that already carry category labels. The frontend must render category chips, selector options, manager rows, and analysis chart colors with readable text even when the stored color is any valid user-selected hex color.

Boundaries:

- Store one color per `CategoryEntity` row, not per primary group.
- Accept user-specified colors as normalized hex colors only, such as `#228be6` or `#228be6ff` if alpha is explicitly supported.
- Do not hand-edit generated frontend API files under `frontend/src/api/**`; regenerate with `yarn orval`.
- Do not use Mantine named colors for persisted category colors. Persist and render CSS hex values.
- Do not reject valid colors only because they are low contrast with white or black text. Instead, compute an accessible foreground color and supporting border/ring styles at render time.
- Keep `UNCATEGORIZED` and synthetic analysis categories such as `BALANCE_ADJUSTMENT` frontend fallbacks unless or until they become real category rows.

## Current Behavior

- Category rows live in `backend/src/category/category.entity.ts` with `primary`, `detailed`, `description`, `userId`, normalized label fields, and `archivedAt`.
- `CategoryEntity.toObject()` returns the API shape defined in `backend/src/types/Category.ts`.
- Category creation and update are implemented in `backend/src/category/category.service.ts` through `createCustom()` and `updateCustom()`.
- Existing category management APIs are exposed from `backend/src/category/category.controller.ts`, including `GET /category`, `GET /category/manage`, `POST /category/custom`, `PATCH /category/custom/:id`, and `PATCH /category/custom/bulk`.
- The existing category seed migration is a historical no-op in `backend/src/migrations/1773607000000-SeedCategories.ts`; active categories are user-owned rows.
- Frontend category management lives in `frontend/src/components/settings/CustomCategoriesSection.tsx`.
- Transaction selectors use `frontend/src/components/categories/CategorySelect.tsx`, with options built in `frontend/src/components/TransactionsTable.tsx`, `frontend/src/components/transactions/TransactionsMobileList.tsx`, and `frontend/src/routes/_authed/transactions.tsx`.
- Analysis currently uses frontend-only color constants from `frontend/src/lib/constants.ts`, via `getCategoryColor(category, index)` in `frontend/src/routes/_authed/analysis.tsx`.
- There is no persisted category color in the backend schema or generated frontend models.

Known constraints:

- The backend is the right place to ensure every stored category has a color, because category API consumers should not need to invent missing colors.
- Existing category tests and frontend fixtures construct `Category` and `CategoryManagementItem` objects; adding a required field will require test fixture updates.
- Analysis aggregates by primary category string in `backend/src/transaction-analysis/transaction-analysis.service.ts`, while colors are per category row. The plan needs an explicit aggregate color rule.
- User-selected colors can be very light, very dark, or visually close to the page background, so readable UI cannot assume white text, black text, or a fixed badge variant.

## Target Data Shape

Add a required normalized color to category API responses:

```ts
type Category = {
  id: string
  primary: string
  detailed: string
  description: string
  color: string
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
```

Allow color during create and update:

```ts
type CreateCustomCategoryDto = {
  primary: string
  detailed: string
  description?: string | null
  color?: string
}

type UpdateCustomCategoryDto = {
  primary?: string
  detailed?: string
  description?: string | null
  color?: string
  archived?: boolean
}
```

Extend analysis aggregates with a display color:

```ts
type CategoryAggregate = {
  primaryCategory: string
  totalAmount: number
  currency: string
  transactionCount: number
  color: string
}
```

Backend storage:

```ts
type CategoryEntity = {
  color: string
}
```

Color normalization and validation rules:

- Normalize accepted 3-digit hex to 6-digit lowercase hex, for example `#abc` to `#aabbcc`.
- Normalize 6-digit hex to lowercase, for example `#AABBCC` to `#aabbcc`.
- Prefer not to support alpha for v1. If alpha is supported, document it and ensure contrast helpers blend against the current theme background before choosing text color.
- Reject non-hex CSS color strings in Zod schemas and service-level helpers.
- Generate random defaults as 6-digit opaque hex colors.

## Milestones

### 1. Backend Color Model, Validation, And Backfill

Implementation tasks:

- Add `color` to `CategoryEntity` in `backend/src/category/category.entity.ts` as a non-null varchar.
- Create a backend helper such as `backend/src/category/category-color.ts` with:
  - `normalizeCategoryColor(input: string): string`
  - `isCategoryColor(value: string): boolean`
  - `generateCategoryColor(): string`
- Use the helper in `CreateCustomCategoryDtoSchema` and `UpdateCustomCategoryDtoSchema` in `backend/src/types/Category.ts`.
- Add `color` to `CategorySchema`, `CategoryManagementItemSchema`, and `CategoryConflictSchema` when conflict messaging can benefit from showing the existing category color.
- Update `CategoryEntity.toObject()` to return `color`.
- Update `CategoryService.createCustom()` to set `category.color` from `dto.color` when provided, otherwise call `generateCategoryColor()`.
- Update `CategoryService.updateCustom()` to mutate `category.color` when `dto.color` is provided; reject `null` rather than treating it as a reset action for v1.
- Update duplicate and bulk duplicate flows in `CategoryService.bulkUpdateCustom()` so duplicated categories get a fresh generated color instead of copying the original color by default.
- Add a TypeORM migration under `backend/src/migrations/` that:
  - Adds nullable `color` to `category_entity`.
  - Backfills every existing row with a random generated hex color.
  - Marks `color` non-null after backfill.
  - Provides a rollback that drops the column.
- Keep migration random generation inside the database or a deterministic SQL expression. The generated value must be valid 6-digit hex for every existing row.

Exit criteria:

- Existing category rows are backfilled with valid colors.
- All new categories created through `POST /category/custom` persist a valid color, whether the request includes one or not.
- Category update accepts valid hex colors and rejects invalid strings before persistence.
- Category API responses include `color` everywhere a `Category` or `CategoryManagementItem` is returned.
- Bulk duplicate creates a category with a valid color and does not create a duplicate color dependency on the source row.

### 2. Analysis Aggregate Color Contract

Implementation tasks:

- Extend `CategoryAggregateSchema` in `backend/src/types/TransactionAnalysis.ts` with `color`.
- In `TransactionAnalysisService.getAnalysis()`, carry an aggregate color for each primary category.
- Use assigned transaction categories already loaded with transactions in `getPostedTransactionsInRange()` as the source of truth for real category colors.
- Pick the aggregate color deterministically for a primary category. Recommended rule:
  - Use the color from the category row with the largest absolute total contribution in that primary category.
  - Fall back to stable special colors for `UNCATEGORIZED` and `BALANCE_ADJUSTMENT`.
- Keep `getTransactionsByCategory()` and `getBalanceAdjustmentsByCategory()` filtering behavior unchanged because those APIs still filter by `categoryPrimary`.
- Update backend tests that assert `CategoryAggregate` values.

Exit criteria:

- `GET /transaction-analysis` returns `color` for every inflow and outflow aggregate.
- User-selected category colors appear in analysis for categories with matching transactions.
- `UNCATEGORIZED` and `BALANCE_ADJUSTMENT` still render with stable fallback colors.
- Existing analysis filtering by primary category continues to work.

### 3. Generated Client And Shared Frontend Color Utilities

Implementation tasks:

- Regenerate the frontend API client with `cd frontend && yarn orval` after the backend OpenAPI contract includes `color`.
- Replace `frontend/src/lib/constants.ts` category map usage with a more explicit module such as `frontend/src/lib/category-colors.ts`.
- Add helpers for persisted colors:
  - `normalizeHexColor(value: string): string | null`
  - `getReadableTextColor(background: string): '#000000' | '#ffffff'`
  - `getCategoryColorStyles(color: string, options?: { selected?: boolean })`
  - `getFallbackCategoryColor(category: string, index: number): string`
- Implement contrast using WCAG relative luminance and contrast ratio, choosing whichever of black or white gives better contrast for arbitrary user colors.
- Include a subtle border/ring in `getCategoryColorStyles()` so very light colors remain visible against light theme surfaces and very dark colors remain visible in dark theme surfaces.
- Keep fallback colors for synthetic and legacy values that do not arrive as category rows.

Exit criteria:

- Generated models include `color` on `Category`, `CategoryManagementItem`, and `CategoryAggregate`.
- Frontend code no longer depends on `CATEGORY_COLORS` for real category rows.
- Unit tests cover contrast helper decisions for light, dark, mid-tone, and invalid color inputs.
- The same helper is usable in category manager rows, selector options, transaction category chips, and analysis legends.

### 4. Categories Manager Color Editing

Implementation tasks:

- Add a color control to the create/edit panel in `frontend/src/components/settings/CustomCategoriesSection.tsx`.
- Prefer Mantine `ColorInput` or `ColorPicker` if available in the installed Mantine version; otherwise use a `TextInput` with `type="color"` support plus a hex text field.
- Seed the create form with a generated preview color on the frontend for immediate feedback, while still letting the backend generate the authoritative default if the field is omitted.
- Include `color` in `createCategory.mutate({ data })` and `updateCategory.mutate({ data })`.
- Reset the color field when opening and closing create/edit panels.
- Show a color swatch in the categories table, sized with stable dimensions so it does not shift row height.
- In archived/details mode, show the stored color swatch read-only.
- Use the shared contrast helper for any text rendered inside a colored swatch or badge.
- Update `frontend/src/components/settings/CustomCategoriesSection.test.tsx` fixtures and tests for create, edit, duplicate conflict display, and archived details.

Exit criteria:

- A user can choose a category color while creating a category.
- A user can edit an existing category color without changing its labels.
- Category manager rows show the saved color.
- The manager remains usable on desktop and mobile widths without text overlap or row-height shifts.
- Invalid color input is blocked client-side and still rejected server-side.

### 5. Category Color Rendering Across App Surfaces

Implementation tasks:

- Extend `CategorySelectOption` in `frontend/src/components/categories/CategorySelect.tsx` with `color`.
- Update category option builders in:
  - `frontend/src/components/TransactionsTable.tsx`
  - `frontend/src/components/transactions/TransactionsMobileList.tsx`
  - `frontend/src/routes/_authed/transactions.tsx`
- Render selector options with a color swatch and keep primary/secondary text readable and truncation-safe.
- Update transaction category display cells to show a compact colored chip or swatch for assigned categories.
- Update `frontend/src/routes/_authed/analysis.tsx` to use `cat.color` from `CategoryAggregate` for donut segments, legend dots, and progress bars, falling back only for synthetic or missing values.
- Verify provider category hint popovers remain visually distinct from user-assigned category colors.
- Update affected frontend tests:
  - `frontend/src/components/TransactionsTable.test.tsx`
  - `frontend/src/components/transactions/TransactionsMobileList.test.tsx`
  - `frontend/src/routes/_authed/transactions.test.tsx`
  - Analysis tests if present or add a focused test for aggregate color usage.

Exit criteria:

- Transaction category selectors show each saved category color.
- Assigned transaction categories render with their saved category color.
- Analysis charts use backend-provided aggregate colors.
- Fallback colors are used only for uncategorized, balance adjustment, or missing legacy values.
- Text remains readable on arbitrary valid user-selected category colors in light and dark themes.

## Tests

### Backend

- `backend/test/category/category.service.spec.ts` covers default color generation on create.
- Category service tests cover provided color normalization, invalid color rejection through DTO validation or helper tests, update color mutation, and duplicate category creation generating a fresh color.
- Migration validation covers adding `color`, backfilling existing rows, enforcing non-null, and rollback dropping the column.
- `backend/test/transaction-analysis/transaction-analysis.service.spec.ts` covers aggregate color selection from category rows, largest-contribution tie behavior, and fallbacks for `UNCATEGORIZED` and `BALANCE_ADJUSTMENT`.
- Controller or schema tests verify `CategorySchema`, `CategoryManagementItemSchema`, and `CategoryAggregateSchema` expose `color`.

### Frontend

- Add focused tests for `frontend/src/lib/category-colors.ts` covering normalization, invalid colors, luminance, black/white foreground choice, and border style output.
- `CustomCategoriesSection` tests cover color input on create/edit, swatch rendering, invalid color prevention, and archived read-only display.
- `CategorySelect` tests cover swatch rendering, clear behavior remaining intact, and long labels not losing accessible names.
- Transactions table and mobile list tests cover category colors in option data and assigned category rendering.
- Analysis tests cover use of `CategoryAggregate.color` for chart data and legend/progress colors.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/category/category.service.spec.ts
cd backend && yarn test test/transaction-analysis/transaction-analysis.service.spec.ts
cd backend && yarn lint
cd backend && yarn migration:show
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/components/settings/CustomCategoriesSection.test.tsx
cd frontend && yarn test src/components/TransactionsTable.test.tsx src/components/transactions/TransactionsMobileList.test.tsx
cd frontend && yarn test src/routes/_authed/transactions.test.tsx
cd frontend && yarn lint
cd frontend && yarn typecheck
```

Browser validation with `$agent-browser`:

```text
Start backend and frontend local dev.
Open http://localhost:4000/settings?tab=categories.
Create a category with a very light color, a very dark color, and a saturated mid-tone color.
Verify the manager table, create/edit panel, transaction category dropdowns, assigned transaction category display, and analysis chart legend remain readable in light and dark themes.
Capture desktop and mobile screenshots for the Categories manager and transaction category selector.
Check the browser console for runtime errors.
```

## Overall Exit Criteria

- Every persisted category has a valid backend-owned color after migration.
- New categories receive a random valid color when the user does not choose one.
- Users can choose and later edit a category color from the Categories manager.
- Category color is part of the backend API contract and generated frontend models.
- Transaction selectors, assigned category display, manager rows, and analysis charts use persisted category colors.
- Arbitrary valid user-selected colors do not make category text unreadable because foreground and border styles are computed from contrast.
- Backend tests, frontend tests, lint, typecheck, API generation, and browser validation pass.

## Risks And Open Questions

- The current backend migration `1775400000000-AddUserDefinedCategories.ts` still references a `source` column while the active `CategoryEntity` no longer exposes `source`. Before implementing color migrations, confirm the expected production schema with `cd backend && yarn migration:show`.
- Analysis aggregates by primary category, but colors are stored per detailed category row. The largest-contribution rule is deterministic, but product may prefer a primary-level color setting later.
- The exact random color palette matters for visual quality. Pure random RGB can produce muddy or near-background colors; consider generating from a curated HSL range while still storing hex.
- If alpha colors are allowed, contrast must blend with the actual theme surface before selecting text color. V1 should avoid alpha unless there is a strong product reason.
- Existing local data may contain categories created before the user-owned category migrations stabilized; migration validation should be run against a local copy before deploy.
