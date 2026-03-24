# Transaction Analysis Cancellation Design

## Goal

Make `/transaction-analysis` reflect:
- `inflows` as external income entering the user's finances
- `outflows` as external expenditure leaving the user's finances

The endpoint should stop counting mirrored internal movements, card payment pairs, and in-range refunds as income/spend when they can be neutralized by an equal and opposite posted transaction in the same analysis window.

## Current Problems

### Provider Categories Leak Into Product Semantics

The current analysis service excludes:
- `TRANSFER_IN`
- `TRANSFER_OUT`
- `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT`

This works only when the provider categorizes transactions correctly. In production, the February 2026 Bilt rent flow was imported as a negative `LOAN_PAYMENTS_CREDIT_CARD_PAYMENT` on the credit card account plus a matching positive transaction on the same account categorized as income. The current exclusion removes the negative side from outflows but leaves the positive side in inflows, which makes analysis wrong in both directions.

### Pending Transactions Make Analysis Unstable

Pending transactions can change date, amount, merchant, or disappear when posted. Including them in analysis creates totals that can shift for reasons unrelated to real settled inflow or expenditure.

### Product Semantics Differ From Raw Feed Semantics

For analysis, the user wants financial meaning, not provider bookkeeping:
- internal movements should disappear
- refunds should cancel prior spend when both sides fall inside the requested window
- month boundaries should remain independent

## Non-Goals

- No Bilt-specific or institution-specific logic
- No database schema changes
- No transaction mutation or persisted reconciliation state
- No cross-window reconciliation across months
- No fuzzy amount matching or currency normalization for pairing

## Design

### 1. Exclude Pending Transactions Entirely

`/transaction-analysis` should operate only on posted transactions.

Rules:
- transactions with `pending = true` are excluded before any pairing or aggregation
- only posted transactions can participate in cancellation

This keeps analysis stable and avoids pairing a provisional pending record with a settled record.

### 2. Add an Analysis-Only Cancellation Pass

Before inflow/outflow aggregation, the service should neutralize posted in-range transaction pairs that represent either:
- internal movement
- mirrored settlement noise
- refunds/reversals

The cancellation pass is analysis-only:
- raw transactions remain unchanged in storage
- cancellation state exists only for the current request

### 3. Pairing Rules

Transactions are eligible to cancel only when all of the following are true:
- same currency
- same absolute amount in smallest currency unit
- opposite signs
- both fall inside the requested analysis date range
- both are posted

There is no amount tolerance in the first version. Matching is exact.

This keeps pairing deterministic and prevents cross-currency or near-match false positives.

### 4. One-to-One Matching With Date Priority

The cancellation pass should enforce one-to-one matching:
- each transaction can cancel at most one opposite-side transaction
- once matched, neither transaction can be reused

Matching order:
- bucket transactions by `currency + absoluteAmount`
- within each bucket, match positive and negative entries by nearest date first
- if multiple candidates have the same date distance, use a stable tie-breaker:
  - earlier date first
  - then transaction id

This satisfies the requirement that the same refund cannot cancel more than one expenditure.

### 5. Aggregate Only Unmatched Transactions

After the cancellation pass:
- matched transactions are removed from analysis entirely
- unmatched positive transactions contribute to `inflows`
- unmatched negative transactions contribute to `outflows`

Currency conversion happens only after cancellation, using the existing preferred-currency analysis behavior.

This ensures:
- mirrored equal-and-opposite noise does not inflate either side
- in-range refunds net out prior expenditure
- February and March remain independent, even if an economic reversal happens in the following month

### 6. Category Aggregation Boundary

Cancellation should happen before category aggregation.

Why:
- provider categories are unreliable for determining whether a transaction should count toward analysis
- matched pairs should disappear before they can affect category totals or uncategorized totals

The existing category exclusion list can then be simplified or removed, depending on implementation choice, because transfer-like noise is now handled structurally rather than by provider label alone.

## Data Flow

1. Receive `startDate`, `endDate`, and `userId`.
2. Load in-range posted transactions for the user, including category data needed for the remaining aggregation.
3. Partition transactions by `currency` and `absoluteAmount`.
4. Inside each partition, pair positive and negative transactions one-to-one by nearest date first.
5. Mark matched transactions as neutralized for the current request.
6. Aggregate only unmatched transactions into category inflow/outflow totals.
7. Convert unmatched aggregate totals into the user's preferred currency using existing conversion behavior.
8. Return the normal `TransactionAnalysisResponse`.

## Edge Cases

### Same-Amount Unrelated Activity

This design intentionally accepts some false cancellations when unrelated positive and negative transactions share the same amount and currency inside the same window. This tradeoff is explicitly acceptable for the requested product behavior.

### Cross-Month Refunds Or Reversals

If a spend occurs in February and an offsetting refund occurs in March:
- February still shows the expenditure
- March still shows the positive transaction

This is intentional. Cancellation is scoped strictly to the requested analysis range.

### Multiple Candidate Matches

If several positive and negative transactions share the same amount:
- nearest date wins
- each transaction can be used only once

This keeps the result deterministic and prevents over-cancellation.

## Testing

### Service Tests

Add analysis tests covering:
- pending transactions are excluded entirely
- equal and opposite posted same-currency transactions cancel within the same window
- one positive transaction cannot cancel multiple negatives
- date-nearest pairing wins when there are multiple candidates
- cross-currency equal amounts do not cancel
- cross-month equal and opposite transactions do not cancel
- unmatched transactions still aggregate into the correct categories and totals

### Regression Tests

Add a production-shaped test case similar to the February 2026 Bilt pattern:
- negative credit-card-payment-like entry
- matching positive mirrored entry
- confirm neither side appears in inflows or outflows after cancellation

The test should validate the behavior without encoding Bilt-specific logic.

## Risks

### Accepted False Positives

Because matching uses only amount, currency, sign, and date proximity, unrelated same-amount transactions can cancel. This is an explicit tradeoff requested for the product semantics.

### Performance

Pairing requires loading and processing in-range posted transactions before aggregation. For normal monthly windows this should be manageable, but the implementation should keep the matching pass bounded and deterministic.

### Category Exclusion Interaction

If the current category-based exclusions remain unchanged, they may hide issues during rollout or produce double-filtering behavior. The implementation should define clearly whether category exclusions remain, shrink, or are replaced by cancellation-first logic.

## Recommended Implementation Order

1. Update `TransactionAnalysisService` to exclude pending transactions from analysis.
2. Introduce an internal cancellation helper that neutralizes posted same-currency equal-and-opposite pairs by nearest date first.
3. Refactor aggregation to operate on unmatched transactions after cancellation.
4. Add focused service tests for pairing, one-to-one consumption, and pending exclusion.
5. Verify against the February 2026 production-shaped scenario.
