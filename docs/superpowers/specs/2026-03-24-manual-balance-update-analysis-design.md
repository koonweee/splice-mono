# Manual Balance Update Analysis Design

## Goal

Make inflows and outflows on the analysis page reflect manual-account balance changes, even for accounts that do not support imported transactions.

When a user updates the balance of a manual account, the system should:
- record the new balance as a dated balance snapshot
- create or replace a visible synthetic transaction for the balance delta on that date
- let analysis treat that delta as inflow or outflow

## Current Problems

### Manual Accounts Affect Balances But Not Cash Flow Analysis

Manual accounts already support balance edits and snapshot history, but those edits do not create transactions.

The analysis page aggregates posted transactions only, so manual-account balance changes are invisible in:
- inflow totals
- outflow totals
- category drilldowns

This makes the analysis page incomplete for users who track assets or liabilities with unlinked manual accounts.

### Backdated Balance Fixes Cannot Reconcile History

The current manual balance update flow only updates the account's current balance and emits a same-day `USER_UPDATE` balance snapshot.

If a user realizes that a prior balance was wrong and wants to enter the correct value for an earlier date, there is no coherent way to:
- anchor the account to the corrected historical balance
- remove stale later snapshots
- reflect the correction in analysis

## Non-Goals

- No changes to linked-account transaction sync behavior
- No synthetic transactions for linked accounts
- No opening-balance synthetic transaction when a manual account is first created
- No attempt to preserve or recompute later manual balance history after a backdated correction
- No redesign of the transactions or analysis pages beyond the required date input and warning state

## Design

### 1. Extend Manual Balance Updates With An Effective Date

Extend the manual balance update endpoint and modal to accept:
- `balance`
- `effectiveDate`

Default `effectiveDate` to the user's current date in their timezone.

This keeps the feature attached to the existing manual balance update workflow instead of introducing a separate "create synthetic transaction" UI.

### 2. Use The Prior Snapshot As The Delta Baseline

When a manual balance update is submitted for `effectiveDate`, determine the baseline by loading the most recent balance snapshot for that account with:

- `snapshotDate < effectiveDate`

Delta calculation:
- `delta = newBalance - priorBalance`

Interpretation:
- positive delta => inflow
- negative delta => outflow

Important rules:
- if a synthetic balance-update transaction already exists for that account and date, replacement must still be recomputed from the latest prior snapshot, not from the existing synthetic transaction amount
- the account's current balance is not the baseline unless it is also the latest snapshot before the selected date

### 3. Opening State Does Not Create A Synthetic Transaction

If no prior snapshot exists before `effectiveDate`, treat the submitted balance as a new opening state for that manual account:

- upsert the balance snapshot for `effectiveDate`
- delete any later snapshots for that account if the edit is backdated
- do not create a synthetic transaction

This avoids turning an opening balance into a fake inflow or outflow.

### 4. Replace One Synthetic Transaction Per Account And Date

There should be at most one synthetic balance-update transaction per:
- `accountId`
- `effectiveDate`

Saving another manual balance update for the same account and date should replace that synthetic transaction, not append a second one.

The visible transaction should use:
- `pending = false`
- `merchantName = "Balance update"`
- `externalTransactionId = null`
- `date = effectiveDate`

Its amount should be the computed signed delta in the account currency.

Because the transaction is a normal posted row, it will naturally appear in:
- the transactions page
- analysis summary totals
- analysis drilldowns

### 5. Backdated Edits Reset Later Manual Balance History

For manual accounts, a backdated balance update becomes the new source of truth from that date forward.

After upserting the snapshot for `effectiveDate`, delete all later balance snapshots for that account where:
- `snapshotDate > effectiveDate`

This deletion applies to all later snapshot types, including:
- `USER_UPDATE`
- `CSV_IMPORT`
- any other snapshot type stored for that manual account

This is intentionally destructive. The product behavior is:
- the earlier balance correction invalidates all later recorded balance history for that account
- users can rebuild that later history with new imports or manual edits if needed

### 6. Warn Before Destructive Backdated Saves

If the selected `effectiveDate` is earlier than the latest known snapshot date for the account, the frontend should show a warning and require confirmation before saving.

The warning should make clear that continuing will remove all later balance history for that account.

Normal same-day or forward-only edits should not show the destructive-history confirmation.

### 7. Keep Snapshot And Transaction Changes Atomic

The manual balance update operation should run atomically for manual accounts:

1. load the latest prior snapshot before `effectiveDate`
2. upsert the snapshot for `effectiveDate`
3. delete all later snapshots for that account
4. create, replace, or remove the synthetic `Balance update` transaction for that date
5. update the account entity so its current balance remains aligned with the newest surviving snapshot state

All of those writes should succeed or fail together.

### 8. Current Balance Semantics After Backdated Saves

Backdated saves should not leave the account entity pointing at stale future history that has just been deleted.

After the destructive reset:
- if the edited date is now the latest surviving snapshot date, the account's current balance should match the edited balance
- if the account somehow has a later surviving canonical balance source in the future, current balance should match that latest surviving source

For the current manual-account model, deleting all later snapshots means the edited balance will normally become the latest surviving balance and should therefore become the account's current balance.

## Data Flow

1. User opens the manual balance update modal.
2. Modal pre-fills the balance and defaults the date to today.
3. User changes the balance and optionally changes the effective date.
4. If the date is backdated before the latest snapshot date, the UI shows a destructive-history warning and asks for confirmation.
5. Frontend submits `balance` and `effectiveDate` to the manual balance update endpoint.
6. Backend verifies the account is manual.
7. Backend loads the latest snapshot before `effectiveDate`.
8. Backend upserts the snapshot for `effectiveDate`.
9. Backend deletes all later snapshots for that account.
10. Backend computes the delta from the prior snapshot.
11. Backend creates, replaces, or removes the synthetic `Balance update` transaction for that account and date.
12. Backend saves the account's current balance to the newest surviving balance state.
13. Frontend invalidates account, balance, transaction, and analysis queries.

## API Notes

### Manual Balance Update Request

Extend `POST /account/:id/balance` to accept:
- `balance`
- `effectiveDate`

`effectiveDate` should be a required validated `YYYY-MM-DD` string at the API layer, with the frontend defaulting it for the user.

### Synthetic Transaction Identification

The system needs a reliable way to distinguish synthetic balance-update transactions from imported or user-created transactions.

Recommended approach:
- add a dedicated persisted transaction source/type field, or another explicit marker, for synthetic balance-update rows

Using only `merchantName = "Balance update"` as the identifier is not sufficient for backend replacement logic because it is a presentation label, not durable state.

## Testing

### Backend

Add tests covering:
- manual balance update with a prior snapshot creates a positive synthetic transaction when the new balance is higher
- manual balance update with a prior snapshot creates a negative synthetic transaction when the new balance is lower
- no prior snapshot means no synthetic transaction is created
- saving the same account and date twice replaces the synthetic transaction and recomputes from the same prior snapshot baseline
- backdated save deletes all later snapshots for that manual account, regardless of snapshot type
- linked accounts still reject manual balance updates
- the whole operation is atomic when transaction or snapshot writes fail

### Frontend

Add tests covering:
- the modal includes a date input defaulted to today
- same-day edits save without the destructive-history warning
- backdated edits show the warning and require confirmation
- successful save invalidates transactions and analysis queries in addition to account and balance queries
- synthetic rows render on the transactions page with merchant text `Balance update`

## Risks

### Destructive Backdated Edits

Deleting all later snapshots is the right model for consistency, but it is irreversible from the UI. The warning copy needs to be explicit so users understand the consequence before saving.

### Baseline Ambiguity

If the implementation accidentally uses current account balance or an existing synthetic transaction amount as the replacement baseline, same-day edits will drift. The baseline must always come from the latest snapshot strictly before the selected date.

### Incomplete Query Invalidation

If the frontend only invalidates account and balance queries, users will save successfully but still see stale transactions or stale analysis totals. The mutation follow-up must invalidate all affected views.

## Recommended Implementation Order

1. Extend the manual balance update request contract to include `effectiveDate`.
2. Add a durable way to identify synthetic balance-update transactions.
3. Implement a backend manual-account balance-update workflow that loads the prior snapshot, upserts the selected-date snapshot, deletes later snapshots, and creates or replaces the synthetic transaction atomically.
4. Update current-balance persistence so the account entity matches the newest surviving snapshot state.
5. Update the manual balance modal with a date picker and destructive-history confirmation.
6. Invalidate account, balance, transaction, and analysis queries after save.
7. Add backend and frontend regression tests for same-day replacement, backdated destructive reset, and visible `Balance update` rows.
