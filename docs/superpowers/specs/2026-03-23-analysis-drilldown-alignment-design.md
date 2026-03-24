# Analysis Drilldown Alignment Design

## Goal

Make the analysis category drilldown show only the unmatched transactions that contribute to the selected category total, using the same FX basis as the analysis summary.

For the analysis page, the category card total and the modal row set should describe the same data:
- same transaction inclusion rules
- same reconciliation behavior
- same conversion date basis

## Current Problems

### Drilldown Uses Raw Transactions Instead Of Analysis Transactions

The analysis summary is sourced from `/transaction-analysis`, which now neutralizes exact equal-and-opposite posted transactions inside the requested date range before aggregating category totals.

The category drilldown modal currently fetches `/transaction` filtered by:
- `startDate`
- `endDate`
- `categoryPrimary`
- `amountSign`

That raw transaction query does not know about analysis reconciliation. As a result, the modal shows rows that were intentionally removed from the summary totals.

In production for February 2026, the mirrored Bilt rows are excluded from the analysis totals but still appear in the drilldown because the modal is reading the raw feed.

### Drilldown Uses A Different FX Basis Than The Summary

`/transaction-analysis` converts category totals using rates anchored to the requested `endDate`.

`/transaction?convert=true` converts individual rows using rates anchored to the current day.

This makes the drilldown unstable for historical windows:
- the same February 2026 row can display a different preferred-currency value on different days
- summing the modal rows does not reliably match the category total even when the row set is otherwise correct

## Non-Goals

- No changes to transaction storage
- No mutation of raw transaction records
- No changes to the general-purpose `/transaction` endpoint semantics
- No new persisted reconciliation state
- No redesign of the modal UI

## Design

### 1. Add An Analysis-Specific Drilldown Endpoint

Add a dedicated read-only endpoint under the transaction-analysis surface for category drilldown.

Recommended route:
- `GET /transaction-analysis/transactions`

Required query params:
- `startDate`
- `endDate`
- `categoryPrimary`
- `flowDirection` with values `inflow` or `outflow`

Response shape:
- array of transactions that survived analysis reconciliation for that window, category, and direction
- each row should include the same transaction fields the modal already uses
- each row should include `convertedAmount` in the user's preferred currency

This keeps analysis-specific semantics inside the analysis API rather than overloading `/transaction`.

### 2. Reuse One Unmatched-Transaction Pipeline

The summary endpoint and the drilldown endpoint must both derive their data from the same internal unmatched transaction pipeline.

Refactor the current analysis service so the neutralization pass becomes reusable:
- load posted in-range transactions
- neutralize exact equal-and-opposite pairs
- return the unmatched transactions

Both analysis summary and analysis drilldown should consume that same unmatched set.

This guarantees:
- matched mirror rows disappear from both summary and drilldown
- unmatched rows remain visible in both places
- future reconciliation logic changes only need to be implemented once

### 3. Filter Drilldown After Neutralization

The drilldown endpoint should filter only after the unmatched set has been produced.

Filtering rules:
- `flowDirection=inflow` returns unmatched positive transactions
- `flowDirection=outflow` returns unmatched negative transactions
- `categoryPrimary` matches the transaction primary category after neutralization
- uncategorized support should continue to work via the same `UNCATEGORIZED` convention used by analysis aggregation

This preserves the current product meaning:
- the modal answers "which transactions make up this category total?"
- it does not answer "which raw feed rows happened to carry this provider category?"

### 4. Use `endDate` FX For Drilldown Conversion

The drilldown endpoint should convert row amounts using the same preferred-currency rate basis as the analysis summary:
- anchor conversion to the requested `endDate`

This makes the analysis page historically stable and internally consistent.

The analysis page is a period report, not a mark-to-market view. For that product surface, `endDate` valuation is the correct default.

### 5. Keep The Frontend Modal UX, Change Only Its Data Source

`CategoryTransactionsModal` should stop querying the raw transaction endpoint and should instead call the new analysis drilldown endpoint.

The modal should preserve the current UI behavior:
- same title
- same table
- same loading and empty states

Only the data source changes:
- row set now reflects unmatched analysis transactions
- displayed converted amounts now share the summary FX basis

## Data Flow

1. User loads `/analysis` with `startDate` and `endDate`.
2. Frontend requests `/transaction-analysis` and renders category totals.
3. User clicks a category card.
4. Frontend opens the modal and requests `/transaction-analysis/transactions` with the selected date range, category, and flow direction.
5. Backend loads posted in-range transactions for the user.
6. Backend runs the same neutralization logic used by the summary endpoint.
7. Backend filters the unmatched set to the requested category and direction.
8. Backend converts those row amounts using rates anchored to `endDate`.
9. Frontend renders the returned rows in the existing transaction table.

## API Notes

### Why Not Extend `/transaction`

Adding flags such as `analysisMode=true` or `analysisEndDate=...` to `/transaction` would mix two different product semantics into one endpoint:
- raw ledger browsing
- analysis-specific reconciled drilldown

Keeping the drilldown under `/transaction-analysis` is clearer and easier to maintain.

### Response Shape

The response should be optimized for the current modal consumer. A full paginated transaction shape is not required unless the UI actually needs pagination.

For the current modal:
- returning the full unmatched row set is acceptable
- the row count should align with the category's analysis transaction count

## Testing

### Backend

Add tests covering:
- analysis summary and drilldown both exclude matched Bilt mirror rows in the February 2026-shaped scenario
- unmatched rows in the same category still appear in drilldown
- drilldown `flowDirection` filtering works for positive vs negative unmatched rows
- `UNCATEGORIZED` drilldown works if present
- drilldown `convertedAmount` uses `endDate` FX, not the current date

### Frontend

Add tests covering:
- the modal calls the analysis drilldown endpoint, not the raw transaction endpoint
- modal query params include `startDate`, `endDate`, `categoryPrimary`, and `flowDirection`
- modal renders the returned rows without changing existing loading or empty states

## Risks

### Shared Logic Drift

If the summary and drilldown paths reimplement reconciliation separately, they will drift again. The implementation should enforce one shared unmatched-transaction helper to avoid this.

### Historical FX Expectations

Users might assume all converted transaction rows in the app use "today" valuation because the general transaction list currently behaves that way. This change intentionally keeps the analysis page internally consistent, even if other surfaces continue to use different semantics.

### Large Category Windows

Returning the full unmatched row set without pagination is acceptable for the current modal, but very large categories could eventually need pagination or virtualization. That should be handled later only if real usage shows it is necessary.

## Recommended Implementation Order

1. Extract a reusable helper that returns unmatched posted transactions for an analysis window.
2. Update `/transaction-analysis` summary generation to consume that helper with no behavior change.
3. Add `GET /transaction-analysis/transactions` for unmatched category drilldown.
4. Convert drilldown rows using the same `endDate` FX basis as the summary.
5. Update the analysis modal to use the new endpoint.
6. Add regression tests for the February 2026 Bilt scenario and for FX alignment.
