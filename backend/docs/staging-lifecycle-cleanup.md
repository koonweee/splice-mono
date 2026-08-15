# Staging lifecycle cleanup

Run this one-shot only after the cleanup migrations and backend image have been
verified on every staging node. Run stale pending transaction reconciliation
first so its provider evidence and restoration archive are handled separately.

The command refuses to start unless schedules are disabled and the exact
confirmation value is present:

```sh
DISABLE_SCHEDULES=true \
CONFIRM_LIFECYCLE_CLEANUP=cleanup-stale-lifecycle-data \
node dist/scripts/cleanup-stale-lifecycle-data.js
```

It invokes the existing bounded cleanup services for stale non-healthy empty
bank links, expired pending webhook contexts, old pending categorization
suggestions, inactive refresh tokens, and notification retention. Each cleanup
is capped at ten batches. A `batchLimitReached` value of `true` requires a
read-only recount before deciding whether to run the command again.

## Exact empty bank-link guards

Recently updated or healthy empty links are intentionally outside the automatic
30-day policy. To archive already inspected links, pass a JSON array containing
the exact `bankLinkId`, `userId`, `expectedStatus`, and millisecond ISO
`expectedUpdatedAt` values from a fresh read-only query:

```sh
DISABLE_SCHEDULES=true \
CONFIRM_LIFECYCLE_CLEANUP=cleanup-stale-lifecycle-data \
LIFECYCLE_CLEANUP_BANK_LINK_GUARDS_JSON='[{"bankLinkId":"...","userId":"...","expectedStatus":"ERROR","expectedUpdatedAt":"2026-08-15T12:34:56.789Z"}]' \
node dist/scripts/cleanup-stale-lifecycle-data.js
```

Every exact guard is rechecked under the shared lifecycle advisory lock and a
row lock. The operation stops if status, timestamp, ownership, or the zero-active
account invariant changed. Duplicate IDs, extra fields, ambiguous timestamps,
invalid statuses, and more than 100 guards are rejected before the application
connects to the database.

Successful output contains aggregate counts only; it never prints guard values,
database payloads, or credentials. Any error produces a count-only failure event
and a nonzero exit code. After success, independently recount every target class
and confirm active accounts, usable refresh tokens, non-expired webhook flows,
active suggestions, pending push deliveries, and recent notifications were not
changed.
