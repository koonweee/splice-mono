# Plans

This directory tracks product and implementation plans for Splice.

## Status Key

- Planned: not started.
- In Progress: actively being implemented.
- Blocked: waiting on a decision or dependency.
- Done: implemented and validated.
- Reference: background notes or testing guides rather than an implementation plan.

## Directory

| Plan | Status | Notes |
|---|---|---|
| [Transaction Reporting Date Override](./transaction-reporting-date-override.md) | Planned | Add optional user-controlled reporting dates while keeping `activityDate` as the effective date for UI, analysis, and MCP. |
| [Transaction Category Review](./transaction-category-review.md) | Done | Add category review status, inline accept, review filters, bulk review, undo toasts, and sync lifecycle rules. |
| [Transactions Toolbar Variant A](./transactions-toolbar-variant-a.md) | Planned | Simplify the transactions toolbar with date controls plus an icon-only filters trigger, moving account/category/flow/review filters into responsive panels. |
| [Transaction Bulk Category Edit](./transaction-bulk-category-edit.md) | Done | Add selected-row bulk category editing with shared desktop/mobile toolbar, atomic save, and toast-only undo. |
| [Manual Transaction Creation](./manual-transaction-creation.md) | Planned | Add dedicated manual transaction create/edit/delete endpoints and Transactions-page UI without balance or snapshot effects. |
| [Transaction Category Overrides](./transaction-category-overrides.md) | Planned | Add user category overrides while preserving Plaid categories and enforcing effective category across UI, analysis, and MCP/surface callers. |
| [User-Defined Categories](./user-defined-categories.md) | Planned | Let users create custom primary/secondary categories from Settings with autocomplete duplicate prevention and backend validation. |
| [Settings Categories Manager](./settings-categories-manager.md) | Planned | Move categories to a dedicated Settings tab with system/custom inventory, dropdown visibility controls, and bulk category management. |
| [User-Specified Category Colors](./user-specified-category-colors.md) | Done | Persist category colors, generate defaults for existing and new rows, and render arbitrary user colors with readable contrast. |
| [User-Configurable Analysis Rules](./user-configurable-analysis-rules.md) | Planned | Add user-owned analysis exclusion and neutralization rules with Settings management and backend-applied analysis behavior. |
| [Analysis Audit And Lookaround Neutralization](./analysis-audit-and-lookaround.md) | Done | Add a drawer-based audit of rule effects and a user-level neutralization lookaround setting for date-boundary refunds. |
| [Mantine Theme Cleanup](./mantine-theme-cleanup.md) | Planned | Centralize reusable Mantine component chrome while preserving feature-specific layout, behavior, and accessibility. |
| [Mobile Table Variants](./mobile-table-variants.md) | Done | Replace remaining mobile table surfaces with purpose-built lists and add a shared mobile table-list shell. |

## Templates

- [Plan Template](./template.md)
