# Mobile Table Variants

## Status

Done

## Goal

Apply the transactions page responsive pattern to every remaining table surface in the frontend: keep dense Mantine React Table views on desktop, and render purpose-built mobile lists on narrow screens. Preserve all row actions, selection, empty states, loading/error states, and existing data contracts.

## Current Behavior

- `frontend/src/routes/_authed/transactions.tsx` switches between `TransactionsTable` and `TransactionsMobileList` with `useIsMobile`.
- `frontend/src/components/CategoryTransactionsModal.tsx` already uses `TransactionsMobileList` for transaction drilldowns on mobile, but balance-adjustment drilldowns still use `BalanceAdjustmentsTable`.
- `frontend/src/components/settings/CustomCategoriesSection.tsx` renders a column-resized Mantine table for category management on all screen sizes.
- `frontend/src/components/settings/AnalysisRulesSection.tsx` renders a Mantine table for analysis rules on all screen sizes.
- Screenshots captured before implementation live in `artifacts/mobile-table-screenshots/`:
  - `transactions-desktop.png` and `transactions-mobile.png`
  - `settings-categories-desktop.png` and `settings-categories-mobile.png`
  - `settings-analysis-desktop.png` and `settings-analysis-mobile.png`
  - `balance-adjustments-desktop.png` and `balance-adjustments-mobile.png`
- Post-change mobile validation screenshots live in the same directory:
  - `transactions-mobile-after.png`
  - `settings-categories-mobile-after.png`
  - `settings-analysis-mobile-after.png`
  - `balance-adjustments-mobile-after.png`

## Target Data Shape

No backend API, generated client, route search schema, or database shape changes are required. The work is frontend-only and reuses existing API response models:

```ts
type MobileTableVariantData =
  | CategoryManagementItem
  | AnalysisRuleView
  | BalanceAdjustment
```

## Milestones

### 1. Shared Mobile List Shell

Implementation tasks:

- Add `frontend/src/components/MobileTableList.tsx` and companion CSS for the shared bordered/mobile edge-to-edge shell.
- Keep the abstraction limited to cross-table concerns: loading, error, empty, list chrome, row keys, and row rendering.
- Leave `TransactionsMobileList` specialized because it owns transaction grouping, infinite scroll, bulk-select behavior, and the bottom detail drawer.

Exit criteria:

- New shared component is generic over row data and has no domain-specific imports.
- Existing transactions behavior is unchanged.

### 2. Balance Adjustment Drilldown Mobile Variant

Implementation tasks:

- Update `frontend/src/components/BalanceAdjustmentsTable.tsx` to render a mobile list under `useIsMobile`.
- Show account name, adjustment amount, start balance, and end balance without horizontal clipping.
- Preserve the existing desktop `MantineReactTable` configuration for non-mobile viewports.

Exit criteria:

- `cd frontend && yarn test src/components/BalanceAdjustmentsTable.test.tsx` passes.
- `$agent-browser` mobile screenshot of the balance-adjustment drilldown no longer clips columns.

### 3. Settings Categories Mobile Variant

Implementation tasks:

- Update `frontend/src/components/settings/CustomCategoriesSection.tsx` to render `MobileTableList` on mobile.
- Preserve category selection, bulk archive/restore/duplicate, row details/edit actions, archived filter, primary filter, and search.
- Add a mobile-visible select-all-visible checkbox so the table select-all affordance is not lost.

Exit criteria:

- `cd frontend && yarn test src/components/settings/CustomCategoriesSection.test.tsx` passes.
- `$agent-browser` captures desktop and mobile Settings > Categories screenshots with no horizontal table clipping.

### 4. Settings Analysis Rules Mobile Variant

Implementation tasks:

- Update `frontend/src/components/settings/AnalysisRulesSection.tsx` to render `MobileTableList` on mobile.
- Preserve edit, archive, restore, status, type, scope summary, search, archived mode, and drawer behavior.
- Keep the desktop Mantine table unchanged.

Exit criteria:

- `cd frontend && yarn test src/components/settings/AnalysisRulesSection.test.tsx` passes.
- `$agent-browser` captures desktop and mobile Settings > Analysis screenshots with the mobile list replacing the table.

## Tests

### Backend

- None. No backend behavior changes are required.

### Frontend

- Add or update focused tests for:
  - `BalanceAdjustmentsTable` mobile list rendering.
  - `CustomCategoriesSection` mobile list rendering and selection/bulk action preservation.
  - `AnalysisRulesSection` mobile list rendering and archive action preservation.
- Run impacted route/component tests when modal wiring or settings tab behavior changes.

## Validation Commands

Frontend:

```bash
cd frontend && yarn test src/components/BalanceAdjustmentsTable.test.tsx
cd frontend && yarn test src/components/settings/CustomCategoriesSection.test.tsx
cd frontend && yarn test src/components/settings/AnalysisRulesSection.test.tsx
cd frontend && yarn typecheck
```

Browser validation:

```bash
agent-browser --session splice-mobile-tables open http://localhost:4000/transactions
agent-browser --session splice-mobile-tables set viewport 390 844 2
agent-browser --session splice-mobile-tables screenshot artifacts/mobile-table-screenshots/transactions-mobile-after.png
agent-browser --session splice-mobile-tables open 'http://localhost:4000/settings?tab=categories'
agent-browser --session splice-mobile-tables screenshot artifacts/mobile-table-screenshots/settings-categories-mobile-after.png
agent-browser --session splice-mobile-tables open 'http://localhost:4000/settings?tab=analysis'
agent-browser --session splice-mobile-tables screenshot artifacts/mobile-table-screenshots/settings-analysis-mobile-after.png
```

## Overall Exit Criteria

- Transactions keep their existing desktop table and mobile list behavior.
- Balance adjustments, settings categories, and settings analysis rules render mobile lists instead of horizontally clipped tables on narrow screens.
- Desktop table behavior, row actions, filters, selection, and drawers remain unchanged.
- Focused frontend tests and `yarn typecheck` pass.
- Before/after screenshots are available in `artifacts/mobile-table-screenshots/`.
