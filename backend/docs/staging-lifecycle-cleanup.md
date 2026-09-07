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

## Plaid disconnection after archiving

Archiving the last active account on a Plaid link now atomically archives the
link and records a durable disconnect request, including healthy links. Archiving
one account while others remain active preserves the connection. Account history
and archive snapshots are retained.

The `bankLinkDisconnect` worker runs every minute on each backend node. It claims
up to 25 due requests using the shared lifecycle advisory lock and a row lock,
checks all account owners and other links sharing the Plaid Item/token, and calls
`/item/remove` with a ten-second timeout. Failed attempts retain credentials and
retry with exponential backoff from one minute to one hour. It treats
`ITEM_NOT_FOUND` as success, so a crash after Plaid removal but before database
commit is recoverable. Completion clears authentication except `itemId`, sets
`disconnectedAt`, and disables further attempts. Logs omit provider error payloads
and credentials.

Link completion cannot reactivate an Item once disconnect has been requested;
users must establish a new connection. Sync application and link completion share
lifecycle locking with account archival and disconnection.

Deploy the `AddBankLinkDisconnect1788645000000` migration before the updated
backend. It queues existing archived Plaid links with retained tokens and no
active accounts. This includes Items removed manually: the worker confirms they
are absent and clears the obsolete tokens. Legacy empty links still use the
existing stale-link policy until archived; the migration does not archive healthy
unarchived links. No frontend changes are required.

After rollout, inspect only metadata (never `authentication`) to verify requests
finish or are retrying:

```sql
SELECT id, "institutionName", "archivedAt", "disconnectRequestedAt",
       "disconnectedAt", "disconnectAttempts", "disconnectNextAttemptAt"
FROM bank_link_entity
WHERE "disconnectRequestedAt" IS NOT NULL
ORDER BY "disconnectRequestedAt";
```

Rollback requires stopping the updated worker before reverting code/schema.
Reverting the migration does not restore Items already removed at Plaid; those
require a new link. The feature has not been deployed merely by changing this
repository.
