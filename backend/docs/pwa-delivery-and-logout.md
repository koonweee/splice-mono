# PWA delivery and logout operations

Push enrollments belong to a browser session. Refresh rotation preserves that
session; device logout atomically revokes the family and its enrollments, while
logout-all revokes every session for the user. Old unbound enrollments stay paused
until the upgraded frontend verifies its worker protocol and explicitly rebinds
an eligible device. Previously disabled devices do not automatically rebind.

Registration requires `protocolVersion: 2`. Old frontends receive a validation
error instead of reenabling delivery to a privacy-unaware worker. V2 pushes carry
an opaque enrollment ID. The upgraded worker additionally checks current server
eligibility through the frontend's private, uncached `/_pwa/enrollment` endpoint
before displaying private text. If authentication, storage, or the network cannot
establish eligibility, the notification is generic. No financial notification
contents or badge counts are persisted in browser storage.

## Deployment order

1. Verify a recent restorable database backup using the stack repository's backup
   procedure. A failed scheduled backup is not evidence of a usable backup.
   Wait for both image builds to match the approved deploy commit. Pull the new
   app images in all three regions and the migration image before stopping APIs;
   verify the pulled migration image's registry digest and commit tag.
2. Stop **all old backend instances that run `NotificationPushProcessor`** before
   applying the migrations. An old send has no total deadline and holds database
   locks, so merely waiting for graceful application drain can wait indefinitely.
   Confirm the old containers/processes have exited. This cutover can briefly
   interrupt the API; do not leave an old replica serving auth or push alongside
   the upgraded deployment.
3. Apply `1788804300000-AddBrowserSessions` and
   `1788804301000-PushClaimsAndInboxIndexes` through the repository's migration
   service. The first migration pauses active legacy subscriptions, invalidates
   their queued deliveries, and backfills live refresh-token chains. Its trigger
   also pauses unbound records written by an old binary. This trigger is a
   compatibility safeguard, not a substitute for stopping old processors.
4. While all old auth instances remain stopped, run
   `node dist/auth/browser-session-backfill.js` with the migration service's
   database environment to reconcile any token families created during the
   transition. For a one-shot container, explicitly override the entrypoint to
   `node` and the command to `dist/auth/browser-session-backfill.js`. The image's
   default `docker-entrypoint.sh` ignores command arguments and starts the API;
   overriding only the command does not run the backfill. For Komodo
   `RunStackService`, use `entrypoint: "node"` and
   `command: ["dist/auth/browser-session-backfill.js"]`. Require a successful exit
   and the count-only result `remaining: 0`; require both migration-history entries,
   zero unbound active refresh tokens, and zero eligible unbound subscriptions
   before continuing. Printed counts must be checked, not treated as assertions.
5. Deploy the compatible upgraded API, frontend, and worker in all three regions.
   The current stack uses the backend's default enabled processor, which selects
   only session-bound eligible enrollments after the migration. Do not restart
   an old binary against the new schema.
6. Verify session continuity,
   private inbox/summary responses, logout, and reenrollment using synthetic
   accounts or an explicitly authorized test device. Existing clients must open
   the upgraded app to rebind; do not bulk-reactivate paused records or replay the
   migration backlog.
7. Verify matching per-service registry digests and frontend build IDs across all
   regions, then monitor delivery outcomes,
   attempt counts, backlog age, lock contention, and current session eligibility.

Keep lasting environment changes in the stack repository. Operational stop,
restart, migration, and deployment commands use its documented Komodo workflow;
do not put database or VAPID credentials into this document, command output, or
application logs.

## Failure and rollback behavior

- The current Splice Compose service does not forward `PUSH_PROCESSING_ENABLED`.
  Setting that variable only in Komodo's stack environment does not pause push.
  For an immediate reliable pause, use `StopStack` for `splice-backend` in
  `splice-app-vps`, `splice-app-sg`, and `splice-app-sf`, with `stop_time: 10`, and
  verify all containers have exited. This also interrupts the API. Keep them
  stopped until a compatible corrected release is ready.
- The application supports `PUSH_PROCESSING_ENABLED=false` for an API-online
  pause, but using it in this stack first requires a reviewed, declarative Compose
  environment mapping and deployment. Existing in-flight work must finish or be
  stopped separately; the flag cannot recall provider-accepted messages. Pending
  jobs retain their normal age limits and must not be replayed after expiry.
- A pre-upgrade binary does not recognize this switch. Keep old processors
  stopped. Use a rollback build that preserves the session/enrollment protocol
  and processing gate; rolling back only the frontend must preserve its privacy
  worker, the live `/_pwa/enrollment` eligibility route, and the authenticated
  `/_pwa/recovery` response including its verified `controlScope`. The worker
  requires that scope to establish a ready account boundary.
- Preserve revoked sessions, migration flags, enrollment IDs, and claim records.
  Never undo privacy revocations to restore notification volume. Migration `down`
  deliberately does not reactivate old subscriptions and is not the ordinary
  operational rollback procedure.
- The HTTPS transport destroys stalled or continuously dripping requests at five
  seconds, with a three-second socket inactivity limit and bounded response size.
  The processor uses four concurrent jobs per batch of 25. A UUID fences each
  claim; retries and stale-lease recovery cannot finalize a newer claim.
- Sends retain session/subscription/delivery locks while the bounded request is
  active, so a confirmed logout waits for a started send to finish. A provider may
  already have accepted a message; the server cannot recall it. Worker enrollment
  validation and local cleanup protect the display boundary. Provider acceptance
  followed by a process crash can still result in another attempt; stable
  notification tags limit duplicate visible notifications, not at-least-once
  delivery itself.
- Transaction pushes expire after 24 hours, connection alerts after one hour,
  and tests after five minutes. Resolved connection alerts and dismissed or
  expired records are suppressed at send time. Inbox history remains retained
  for 90 days; terminal delivery records are cleaned after 30 days.

## Validation

`yarn typecheck` and `yarn lint` cover backend code. Run the notification tests
and `test/transaction/transaction-query.postgres.spec.ts` with the repository's
dedicated loopback `splice_backend_benchmark` database configured. Each PostgreSQL
suite creates and drops an isolated schema; a skipped suite is not acceptance.
The TLS test uses an ephemeral certificate and synthetic local endpoint only.

The tests cover legacy-protocol rejection, owner/session/enrollment eligibility,
foreign inbox mutations, idempotent read/dismiss, microsecond keyset pagination,
transaction-count parity, two-new/twelve-outstanding badge semantics, concurrent
claiming, stale claims, revocation locking, retry bounds, real socket abortion,
and suppression of expired/resolved notifications.

Fresh acceptance after workspace recovery on September 7, 2026 passed 26 suites / 208 tests with no
skipped suites. The command selected `test/auth`, `test/notification`, `test/user`,
`test/migrations`, and `test/transaction/transaction-query.postgres.spec.ts`
together using `--runInBand` against the isolated benchmark database. Backend
lint, typecheck, and production build also passed after the final source edits.
The passing sequential test run took 14.577 seconds; an earlier overlapping
frontend/backend build run exceeded one fixture's five-second test timeout.
The isolated rerun retained the original timeout and all assertions.

Additional failure-path coverage verifies actual TLS socket closure when the
provider sends no headers, continuously drips, or exceeds the response-size
limit; the same adapter subsequently completes a healthy request. A PostgreSQL
concurrent-commit test proves summary counts stay in one snapshot. Actual HTTP
routes verify inbox/summary/mutations remain uncached and PATs cannot authorize
device enrollment. Structured delivery logs cover reclaimed/ignored stale
claims, skipped or ineligible work, and interrupted/contended attempts as well
as successful/provider-failed sends, using record IDs and numeric metrics only.

The implementation was reconstructed from saved edit history after local temporary
files were lost. The recovered worktree passed all four backend gates again: lint,
typecheck, production build, and the complete selected acceptance suite.

## September 7 production cutover

Deploy commit `55ca895ee0cff8352de8cdfbedee54e0cb5ef193` is running in all three
regions (backend `0.0.122`, frontend `0.0.119`). The approved images were pulled
and their digests checked before all three old backends were stopped and
confirmed exited. Migration operation `6a9f34d9d28c58b2ef419eb5` and backfill
operation `6a9f34f7d28c58b2ef419ebc` succeeded. Backfill returned
`{reconciled: 0, remaining: 0}`. The explicit pre-start gate found both migration
history entries, zero unbound active tokens, zero eligible unbound push records,
and three paused legacy subscriptions.

The new APIs started only after those gates passed. All six app containers are
healthy with matching approved registry digests. Initial count-only monitoring
found no ready backlog, stale processing claims, excessive active attempts,
recent non-migration failures, or database lock waiters. No legacy device had
rebound at observation; provider delivery is not certified by these checks.
See the [release record](../../frontend/docs/pwa-evidence/production-release.json)
for operation IDs, images, public checks, and limitations. The default enabled
processor is in use; no unwired environment switch was relied on during cutover.
