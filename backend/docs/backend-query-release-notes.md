# Backend query and exact-money coordinated release

Release the backend, generated frontend client and MCP Apps together. HTTP amounts now use integer minor-unit strings; MCP amounts use decimal major-unit strings. Rates are strings. Numeric-money clients must update their parsers, formatters, forms and comparisons. There is no compatibility endpoint or staged numeric/string mode.

Transaction conversion now uses the effective reporting date. A reporting-date override changes both inclusion and FX date. Cash-flow totals sum the same rounded rows shown in drilldowns; two EUR 0.01 expenses at 1.5 now produce USD 0.04 in both places. These are intentional correctness changes, not timing comparisons.

Other observable changes:

- Transaction cursors bind filters and must restart after filters change. HTTP continuation totals are nullable; keep the first page's exact count. MCP filtered scans may return an empty page with `continuationReason: "scan_budget"`.
- History, transaction and portfolio responses read their financial inputs and FX from one database snapshot, avoiding mixed versions during concurrent syncs.
- Empty completed holdings snapshots remain empty in web and MCP. MCP holdings expose snapshot metadata even when no positions remain.
- History remains daily by default. Explicit compact resolution returns bounded chart points plus sampling metadata. Invalid calendar dates and excessive ranges receive actionable errors.
- Invalid or out-of-range money fails instead of being coerced. Canonical minor amounts support up to 78 digits. Position quantity, price, valuation and FX columns retain their separate 18-integer/12-fraction precision limits. Manual valuation uses the exact FX ratio; only its informational stored rate is rounded to 12 decimal places.
- CSV balance imports cannot replace holdings-valued accounts; update their positions instead.

## Migrations and locking

Run the existing migration runner in its default all-migrations transaction. New migrations widen money columns and migrate normalized money JSON, create authoritative holdings headers/generation state, and backfill/enforce canonical transaction reporting dates.

Three local runs on the seeded million-transaction fixture took 7.35, 8.44 and 8.86 seconds in total. An activity-table read started after its exclusive lock was observed waited 7.22, 8.31 and 8.73 seconds. These are local PostgreSQL measurements with 50 ms lock sampling, not production downtime estimates. The widening migration rewrites tables and holds locks until the whole migration transaction commits. Full observations are in [the migration measurement](performance/migrations/backend-query-2026-09-05.json).

Widening does not recover digits already rounded in historical provider data. A fresh provider response can recover current values only when the source still supplies the exact value. Preserve existing history rather than inventing missing precision.

## Rollback and recovery

Retain a verified pre-release database backup and matching application artifacts. A normal migration revert checks old bigint limits and safe JSON/threshold representation and refuses unsafe narrowing atomically. Values too large or precise for the old contracts must not be truncated or rounded to force a rollback.

A [local synthetic backup/restore rehearsal](performance/migrations/exact-money-recovery.json) passed: `pg_dump` captured the old schema, unsafe narrowing was refused without changing new exact data, `pg_restore` restored the old values, and reapplying the migration preserved exact JSON. Reproduce with `BACKEND_BENCHMARK_DATABASE_URL` set securely in the process and `node test/migrations/verify-exact-money-recovery.cjs` from `backend/`.

If new data cannot fit the old schema, use a forward fix or restore the pre-release database backup together with the matching backend/frontend/MCP artifacts. Restoring the backup loses post-backup writes unless separately reconciled; do not present it as a lossless application-only rollback. Validate backups and restore procedures through the existing infrastructure workflow before a live release.

These changes have not been deployed by this implementation task. A subsequently requested deployment uses the repository's protected main-to-deploy workflow; the earlier SSR deployment task is independent.
