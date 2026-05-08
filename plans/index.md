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
| [Transaction Category Overrides](./transaction-category-overrides.md) | Planned | Add user category overrides while preserving Plaid categories and enforcing effective category across UI, analysis, and MCP/surface callers. |
| [User-Defined Categories](./user-defined-categories.md) | Planned | Let users create custom primary/secondary categories from Settings with autocomplete duplicate prevention and backend validation. |
| [Settings Categories Manager](./settings-categories-manager.md) | Planned | Move categories to a dedicated Settings tab with system/custom inventory, dropdown visibility controls, and bulk category management. |

## Templates

- [Plan Template](./template.md)
