# Transactions UI Polish From Imagegen

## Status

In progress

## Goal

Refine the implemented transactions UI so it more closely matches the generated modern finance-app reference while preserving the current transaction data model and interactions.

Reference assets:

- Current desktop: `output/visual-qa/pass4-desktop-viewport.png`
- Current mobile: `output/visual-qa/pass4-mobile-viewport.png`
- Generated target: `output/visual-qa/polish-imagegen-reference.png`

These visual artifacts are generated locally and intentionally ignored by git
because they can contain transaction data. They should be regenerated for visual
QA rather than committed.

## Current Behavior

- `frontend/src/components/transactions/TransactionSummaryStrip.tsx` renders six equal metrics. Mobile uses two columns, but Net does not have stronger hierarchy.
- `frontend/src/components/TransactionsTable.tsx` renders category text with a small review dot and separate action buttons on hover/focus.
- `frontend/src/components/TransactionsTable.module.css` uses full-row table separators and compact status chips. The table is readable but still visually heavier than the generated target.
- `frontend/src/components/transactions/TransactionsMobileList.tsx` keeps amounts in a fixed right column and status chips below merchant text, but rows still have strong block separators.
- `frontend/src/components/transactions/TransactionsMobileList.module.css` uses visible row backgrounds and dividers that feel heavier than the generated flat ledger reference.

## Target Data Shape

No backend, generated client, database, or shared API shape changes. This is a frontend presentation-only polish pass.

## Milestones

### 1. Summary Hierarchy

Implementation tasks:

- Match the generated reference by rendering Net first and giving it a primary metric treatment.
- Keep Inflow and Outflow strong, but make count metrics slightly quieter.
- Preserve the existing loading and error states.

Exit criteria:

- Desktop and mobile summary metrics fit without truncation.
- Net is visually distinguishable without changing the API response.

### 2. Category And Status Treatment

Implementation tasks:

- Replace the small desktop category review dot with flat category chips similar to the generated reference.
- Preserve category editing and review actions on hover/focus.
- Keep pending and needs-review status distinct, but reduce unnecessary dominance.

Exit criteria:

- Category labels are easier to scan in the desktop table.
- Needs-review state remains visible and actionable.
- Existing category edit/review tests still pass.

### 3. Row Density And Separators

Implementation tasks:

- Lighten desktop table row dividers and outer table borders.
- Flatten mobile grouped rows by reducing heavy separators and boxed backgrounds.
- Keep the mobile amount column fixed and readable.

Exit criteria:

- Desktop table reads as a dense ledger, closer to the generated reference.
- Mobile rows feel flatter while retaining date grouping and amount scanability.

## Tests

### Backend

- No backend tests are required for this polish pass because behavior and contracts are unchanged.

### Frontend

- Re-run the existing targeted transaction tests:
  - `src/routes/_authed/transactions.test.tsx`
  - `src/components/TransactionsTable.test.tsx`
  - `src/components/transactions/TransactionsMobileList.test.tsx`
- Run `yarn typecheck` and `yarn lint`.

## Validation Commands

Frontend:

```bash
cd frontend && yarn test src/routes/_authed/transactions.test.tsx src/components/TransactionsTable.test.tsx src/components/transactions/TransactionsMobileList.test.tsx
cd frontend && yarn typecheck
cd frontend && yarn lint
```

Visual QA:

```bash
agent-browser --session splice-polish set viewport 1440 1000
agent-browser --session splice-polish screenshot output/visual-qa/polish-pass-desktop-viewport.png
agent-browser --session splice-polish set viewport 390 844
agent-browser --session splice-polish screenshot output/visual-qa/polish-pass-mobile-viewport.png
```

## Overall Exit Criteria

- The UI implements the actionable polish from `output/visual-qa/polish-imagegen-reference.png`.
- Existing transaction summary, table, mobile list, category edit, and review flows remain functional.
- Frontend targeted tests, typecheck, and lint pass.
- An independent review pass reports no major issues remain.
