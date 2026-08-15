# Stale pending transaction reconciliation

The daily job and one-shot runner use the same global and per-link PostgreSQL
advisory locks. A pending row is removed only for an explicit Plaid replacement
or after a complete, stable, fresh `/transactions/get` snapshot proves that an
eligible transaction is absent for more than 14 days. The final row predicates
are rechecked under row locks.

## One-shot staging run

Build the deployed revision, then run exactly one backend process with schedules
disabled:

```sh
DISABLE_SCHEDULES=true node dist/scripts/reconcile-stale-pending-transactions.js
```

The process refuses to start without `DISABLE_SCHEDULES=true`. Review structured
counts and verify both pending rows and archive rows read-only afterward.

## Restore

Each authoritative-absence deletion snapshots the complete activity and banking
rows with `schemaVersion: 1` in the same database transaction. Archives expire
after 90 days; the daily job purges at most 500 expired rows using `SKIP LOCKED`.

To restore one unexpired, unrestored archive, build the deployed revision and run:

```sh
CONFIRM_TRANSACTION_RECONCILIATION_RESTORE=restore \
TRANSACTION_RECONCILIATION_ARCHIVE_ID=<archive-uuid> \
TRANSACTION_RECONCILIATION_USER_ID=<owner-uuid> \
node dist/scripts/restore-transaction-reconciliation-archive.js
```

The command takes the reconciliation lock, verifies the user/account still
exist, refuses identity conflicts, restores both exact source rows atomically,
and retains the archive with `restoredAt` set. Never revert migration
`1777503000000` while rollback evidence is still required: its down migration
drops the archive table.
