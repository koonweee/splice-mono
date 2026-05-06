# Transaction Table Metadata Popover

## Status

Planned

## Goal

Improve the transaction category-review experience by surfacing the most useful provider metadata without turning the transactions table into a dense metadata spreadsheet.

The table should show a better deterministic merchant label, show only exceptional status states such as pending, and provide a compact info-icon popover for raw Plaid/provider details that help users verify or change a transaction category.

This plan intentionally does not include historical backfill. New metadata becomes available for newly synced transactions and for existing transactions that Plaid later sends as modified.

## Current Behavior

- The main transactions route lives in `frontend/src/routes/_authed/transactions.tsx`.
- The table UI lives in `frontend/src/components/TransactionsTable.tsx` with supporting styles in `frontend/src/components/TransactionsTable.module.css`.
- The table currently renders columns for date, merchant, amount, account, category, and status.
- The merchant column renders only `transaction.merchantName ?? '--'`.
- The category cell already contains:
  - a small review-needed dot when `transaction.categoryNeedsReview` is true,
  - a check action to mark reviewed,
  - a pencil action to edit category,
  - a reset action when a user override exists.
- The status column shows a badge for both `Posted` and `Pending`, which spends table width on the default state for most transactions.
- Backend work already added forward-looking Plaid metadata fields to transaction persistence and API schema:
  - `providerTransactionName`
  - `originalDescription`
  - `pendingTransactionId`
  - `accountOwner`
  - `website`
  - `merchantEntityId`
  - `paymentChannel`
  - `transactionCode`
  - `personalFinanceCategoryIconUrl`
  - `counterparties`
  - `location`
  - `paymentMeta`

Known constraint: frontend generated API types under `frontend/src/api/**` must not be hand-edited. Run `yarn orval` after the backend is running with the updated OpenAPI schema.

## Target Data Shape

The backend transaction contract should expose the new metadata fields already added in `backend/src/types/Transaction.ts`.

Frontend generated `Transaction` should include at least:

```ts
type Transaction = {
  merchantName: string | null
  providerTransactionName: string | null
  originalDescription: string | null
  paymentChannel: string | null
  website: string | null
  merchantEntityId: string | null
  personalFinanceCategoryIconUrl: string | null
  counterparties: Array<Record<string, unknown>> | null
  paymentMeta: Record<string, unknown> | null
  location: Record<string, unknown> | null
  authorizedDate: string | null
  authorizedDatetime: string | null
  pending: boolean
  pendingTransactionId: string | null
  categoryNeedsReview: boolean
  effectiveCategory?: Category | null
}
```

The UI should normalize raw JSON-ish provider fields into typed view models locally rather than spreading unknown records directly through JSX.

```ts
type TransactionCounterpartyView = {
  name: string
  type: string | null
  confidenceLevel: string | null
  website: string | null
  logoUrl: string | null
}

type MerchantDisplay = {
  primary: string
  secondary: string | null
  marketplaceName: string | null
  paymentTerminalName: string | null
  hasAdditionalInfo: boolean
}
```

## Milestones

### 1. Regenerate Frontend API Types

Implementation tasks:

- Start the backend locally from this branch so `http://localhost:3000/api-json` includes the updated transaction schema.
- Run `cd frontend && yarn orval`.
- Verify `frontend/src/api/models/transaction.ts` contains the new metadata fields.
- Do not hand-edit generated API files.

Exit criteria:

- Generated `Transaction` includes the new metadata fields.
- Existing frontend typecheck does not fail because of stale transaction types.
- No unrelated generated churn beyond Orval output.

### 2. Add Deterministic Merchant Metadata Helpers

Implementation tasks:

- Add pure helper functions near `TransactionsTable.tsx` or in a small local helper file such as `frontend/src/components/transactions/transactionMetadata.ts`.
- Implement counterparty parsing from `Record<string, unknown>` into `TransactionCounterpartyView`.
- Implement deterministic merchant display rules:
  - Find a marketplace counterparty where `type === 'marketplace'` and confidence is `VERY_HIGH`.
  - If that marketplace exists and differs from the visible merchant, primary label is `${marketplace.name} · ${baseMerchant}`.
  - Otherwise primary label is `merchantName`, then `providerTransactionName`, then `originalDescription`, then `--`.
  - Secondary label is `originalDescription` when it differs meaningfully from the primary label.
  - If no useful raw description is available, secondary label can be `via {paymentTerminal.name}` when a useful `payment_terminal` counterparty exists.
  - Suppress duplicate/empty secondary labels.
- Implement metadata presence checks for whether the info icon should render.
- Implement confidence helpers:
  - `LOW` category confidence should be available to tooltips/popover.
  - Marketplace-detected rows should be available to tooltip/popover.

Exit criteria:

- Helpers are deterministic and side-effect free.
- Given the same transaction payload, merchant labels and popover rows are stable.
- Helper tests cover DoorDash/Crackedan, DoorDash/Schloksba, Square payment terminal, null merchant fallback, duplicate raw description suppression, and no-metadata cases.

### 3. Update Table Layout

Implementation tasks:

- Replace the current merchant `Cell` in `TransactionsTable.tsx` with a richer merchant cell component.
- Increase merchant column width and max width using the space freed from status removal.
- Remove the dedicated `Status` column from `allColumns`.
- Show only a compact `Pending` badge in-row when `transaction.pending` is true.
- Do not render a `Posted` badge anywhere in the table.
- Keep the existing category cell actions and review dot behavior.
- Update `HideableColumn` only if needed; status is not currently hideable.
- Preserve manual sorting behavior for `merchantName`:
  - The column can keep `accessorKey: 'merchantName'` for sorting.
  - Rendered display can use enriched deterministic label.

Exit criteria:

- Table columns are `Date`, `Merchant`, `Amount`, `Account`, and `Category`.
- Pending transactions remain visually discoverable.
- Posted rows no longer spend right-column space on a default badge.
- Category edit/review actions still work.
- Virtualized/infinite scrolling behavior remains unchanged.

### 4. Add Info Icon Popover

Implementation tasks:

- Use `Info` from `lucide-react` in the merchant cell.
- Render the icon button only when useful metadata exists:
  - raw description,
  - provider transaction name,
  - counterparties,
  - payment channel,
  - website,
  - category confidence,
  - authorized datetime/date,
  - payment processor,
  - account owner.
- Use Mantine `Popover` so touch devices can tap the icon.
- Popover content should be compact and scannable:
  - Display merchant
  - Raw description
  - Provider name/description fallback
  - Counterparties with type and confidence
  - Payment channel
  - Plaid category and confidence
  - Authorized date/time
  - Website as text or link if present
- Avoid nested cards; use simple rows/groups inside one elevated popover panel.
- Keep popover width stable, roughly 320-380px.
- Ensure the popover works inside table virtualization and does not require row height changes.

Exit criteria:

- The Crackedan row can show:
  - `DoorDash · Crackedan`
  - secondary `DD *DOORDASH CRACKEDAN`
  - popover counterparties `DoorDash · marketplace · very high` and `Crackedan · merchant · low`.
- The Shake Shack row can show `via Square` as a secondary clue or in the popover.
- Rows without extra metadata do not show a noisy info icon.
- Keyboard users can focus and activate the info icon.

### 5. Improve Review Hint Copy

Implementation tasks:

- Keep the current review dot next to the category label.
- Update its tooltip label based on metadata:
  - default: `Category needs review`
  - low category confidence: `Category needs review · Plaid confidence low`
  - marketplace detected: `Category needs review · Marketplace detected`
- Do not add another persistent icon to the category cell.
- Keep check/edit/reset icons in the existing category action cluster and preserve hover/focus reveal behavior.

Exit criteria:

- Review dot remains lightweight.
- The reason for review is discoverable without opening the full popover when metadata makes it obvious.
- No regression to review/undo/edit category mutations.

### 6. Visual QA Against Mockup

Implementation tasks:

- Use the generated UI mockup as direction, not an exact image spec.
- Validate desktop table density and readability with local data.
- Check rows that cover:
  - marketplace plus merchant (`DoorDash · Crackedan`),
  - null merchant fallback (`APPLE.COM/US`),
  - payment terminal (`Shake Shack`, `via Square`),
  - no metadata,
  - pending transaction.
- Inspect narrow desktop widths where table columns compress.

Exit criteria:

- Text truncates cleanly without overlapping icons or category actions.
- Popover is readable and does not obscure the active row in a confusing way.
- Table remains usable with virtualization.

## Tests

### Backend

- Existing backend metadata tests should remain passing:
  - `test/bank-link/plaid.provider.spec.ts`
  - `test/transaction/transaction.service.spec.ts`
- No additional backend behavior is required for the UI-only phase unless frontend type generation reveals contract issues.

### Frontend

- Add or update component tests for `TransactionsTable`.
- Cover deterministic helper behavior:
  - `Crackedan` with DoorDash marketplace very-high confidence produces `DoorDash · Crackedan`.
  - `Schloksba` with DoorDash marketplace very-high confidence produces `DoorDash · Schloksba`.
  - `Shake Shack` with Square payment terminal can produce `via Square`.
  - `merchantName: null`, `providerTransactionName: 'APPLE.COM/US'` uses `APPLE.COM/US`.
  - duplicate `originalDescription` is suppressed as a secondary line.
- Cover UI behavior:
  - Status column is absent.
  - Pending badge appears for pending row.
  - Posted badge does not appear.
  - Info icon appears for rows with extra metadata.
  - Info popover shows raw description, counterparties, payment channel, category confidence, and authorized date/time.
  - Category review dot tooltip includes low-confidence or marketplace hint when applicable.
  - Existing mark-reviewed/edit-category actions remain accessible.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/bank-link/plaid.provider.spec.ts test/transaction/transaction.service.spec.ts
cd backend && yarn lint
cd backend && yarn typecheck
cd backend && yarn build
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/components/TransactionsTable.test.tsx
cd frontend && yarn lint
cd frontend && yarn typecheck
cd frontend && yarn build
```

Manual local validation:

```bash
cd backend && yarn start:dev
cd frontend && yarn dev
```

Then visit `http://localhost:4000/transactions` with local auth enabled and inspect the transaction table.

## Overall Exit Criteria

- Users can review transaction categories with more context directly in the transactions table.
- Marketplace/processor cases like `Crackedan` make the DoorDash relationship visible without manual investigation.
- The table is cleaner:
  - no dedicated status column,
  - no posted badges,
  - better merchant labels,
  - compact pending badge only when needed.
- The info popover exposes raw and structured provider metadata without overwhelming the table.
- Category review actions still work exactly as before.
- No historical backfill is required or performed.
- Backend metadata persistence remains forward-looking and compatible with Plaid sync.
- Frontend generated API client is regenerated from the backend schema.
- All listed backend/frontend validation commands pass.
