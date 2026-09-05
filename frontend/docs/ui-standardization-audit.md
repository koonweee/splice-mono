# UI standardization audit

September 5, 2026. All nine opportunities are implemented and verified.
Baseline: `7065086`. Usage contracts are in
[Shared UI conventions](ui-conventions.md).

| #   | Standard                   | Implementation and adoption                                                                                                                                                                                                                                                               |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Save/error feedback        | [Mutation feedback](../src/lib/mutation-feedback.ts), retained account-name drafts, pending guards, and inline form errors. Recurring pause/resume failures support retry. Shared field error colors work across all four themes.                                                         |
| 2   | Destructive confirmation   | [ConfirmActionDialog](../src/components/ConfirmActionDialog.tsx) names the item and consequences, focuses Cancel, blocks pending dismissal, and shows failures. Adopted for account archive, transaction deletion, and recurring deletion.                                                |
| 3   | Editor layout              | Holdings and CSV backfill now use [EditorModal and FormActions](../src/components/forms/EditorModal.tsx), semantic forms, validation, and guarded submissions. Phone editors fill the screen; tablet/desktop editors stay bounded.                                                        |
| 4   | Loading/error/empty states | [DataState](../src/components/DataState.tsx) supplies Retry and preserves cached rows. Adopted by Accounts, Transactions, category drilldowns, all four Settings lists, and MobileTableList. Headers and filters remain available.                                                        |
| 5   | Responsive rules           | [Named queries](../src/lib/media-queries.ts) feed [React hooks](../src/lib/responsive.ts) and Vite CSS expansion. Phone 36em, compact 48em, and dense-data 50em roles remain distinct; transaction drilldowns now match the 48em list cutoff. Hover and touch capability are independent. |
| 6   | Investment formatting      | [Quote/value/quantity formatters](../src/lib/investment-format.ts) serve holdings and activity. Quotes retain up to four decimals; values use currency precision; fractional fees opt in. Cash minor units, share quantities, currency labels, and masking remain distinct.               |
| 7   | Date policy                | [Calendar and timestamp formatters](../src/lib/format.ts) share en-US display: calendar days never shift; timestamps use device-local time. Recommendations and recurring dates reuse them; provider date adapters and API serialization are preserved.                                   |
| 8   | Lifecycle badges           | [LifecycleBadge](../src/components/LifecycleBadge.tsx) supplies success/warning/neutral styles and size variants to Settings and category pickers. Archived is neutral everywhere these callers display it.                                                                               |
| 9   | Interactive rows           | [InteractiveRow](../src/components/InteractiveRow.tsx) centralizes account/transaction primary actions, keyboard focus, and press feedback. Checkboxes and secondary actions remain independent sibling controls.                                                                         |

## Verification

- Behavior tests cover draft retention, pending guards, cancellation, deletion
  retry, cached-data recovery, independent row controls, price units/precision,
  and calendar/timestamp semantics.
- Full gate passed from `frontend/`: `yarn test --maxWorkers=2` (361 tests in
  58 files), `yarn lint`, `yarn typecheck`, and `yarn build`.
- Browser checks passed at iPhone 17 (402×874), iPad mini portrait/landscape
  (744×1133 / 1133×744), and MacBook Air (1470×956), with original-resolution
  before/after PNGs. Failure checks intercept requests without changing records.
- Archived/paused states absent from local data are covered by component tests;
  screenshots do not fabricate those states. Chromium emulation does not cover
  native Safari or software keyboards.

Keep domain-specific status meanings, financial calculations, and chart layouts
outside generic UI primitives. Add future shared behavior to these building
blocks and keep the usage guide current.
