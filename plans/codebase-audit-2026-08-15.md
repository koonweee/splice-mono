# Codebase and Staging Audit — 2026-08-15

## Executive summary

The audit found no confirmed P0 incident, but identified several P1 data-correctness, synchronization, authorization, and deployment risks. Staging contains four concrete classes of stale or inconsistent state.

This is a point-in-time audit. Subsequent remediation is tracked separately from the original evidence: PR #224 reconciled the linked-account uniqueness migration with `main`, and the BankLink synchronization fix developed from this audit replaces `BankLink.accountIds` as a transaction-sync input, makes transaction application and cursor advancement atomic, and adds replay/concurrency regression coverage. Other findings remain open unless explicitly noted.

No source code or staging data was modified during the audit. Every staging session enforced `default_transaction_read_only=on` and `transaction_read_only=on`, used `BEGIN READ ONLY`, and had statement and lock timeouts. No DML, DDL, migrations, dumps, or seeds were run.

Priority definitions:

- **P0:** active outage, confirmed security incident, or ongoing material data loss.
- **P1:** address before the next normal deployment.
- **P2:** address in the next sprint.
- **P3:** maintenance backlog.

## Prioritized findings

| Priority | Finding | Verification | Why / impact |
|---|---|---|---|
| P1 | Active account omitted from its bank-link account map | Staging has one active investment account missing from `BankLink.accountIds`; it has 116 activities and current balances/holdings. At audit time, transaction sync built its account map from that list and then advanced the cursor. | The cache drift is confirmed. It could skip banking transactions if it affected an account returned by `/transactions/sync`; because the observed account is an investment account, provider-side transaction loss is not established without a Plaid comparison. One archived account is also still listed on an ERROR link. |
| P1 | Provider data and cursor commits are not atomic | Transaction processing commits separately from cursor persistence at [`bank-link.service.ts:1008`](../backend/src/bank-link/bank-link.service.ts#L1008). Additions are non-idempotent and modified-item failures are swallowed at [`transaction.service.ts:1257`](../backend/src/transaction/transaction.service.ts#L1257). | A cursor-save failure can replay already-inserted transactions and wedge on unique IDs. Individual failures can be lost while the cursor advances. |
| P1 | Webhooks are marked complete before work succeeds | `tryAcquireWebhook` writes `COMPLETED` at [`webhook-event.service.ts:141`](../backend/src/webhook-event/webhook-event.service.ts#L141), before downstream synchronization. Some sync errors are then caught at [`bank-link.service.ts:468`](../backend/src/bank-link/bank-link.service.ts#L468). | Provider retries can be suppressed even though the underlying update failed. The claim is also a non-atomic read-then-insert. |
| P1 | Staging schema was ahead of deployed source history | At audit time, staging had 30 applied migrations and the `UQ_account_user_bank_link_external` index while the checked-out mainline lacked `AddLinkedAccountIdentityConstraint1777400000000`. | Resolved after the audit by PR #224, which added the migration and matching entity constraint to `main`. |
| P1 | Manual balances can reverse sign or become 100× too large | [`AddAccountModal.tsx:213`](../frontend/src/components/accounts/AddAccountModal.tsx#L213) and [`UpdateBalanceModal.tsx:27`](../frontend/src/components/accounts/UpdateBalanceModal.tsx#L27) hardcode two decimals and send both a negative magnitude and `negative` sign. Reproduced with real helpers: `-100 USD` becomes positive; `100 JPY` becomes `¥10,000`. | Directly corrupts user-entered financial balances. Staging currently has zero negative stored magnitudes, so existing data has not exercised it. |
| P1 | Mixed currencies are silently added without conversion | Missing FX rates fall back to raw values at [`balance-query.service.ts:428`](../backend/src/balance-query/balance-query.service.ts#L428), then currencies are summed at [`balance-history-surface.service.ts:86`](../backend/src/balance-query/balance-history-surface.service.ts#L86). Separately, the daily backfill dedupes on only target/date at [`currency-backfill.service.ts:74`](../backend/src/currency-exchange/currency-backfill.service.ts#L74); a two-base deterministic reproduction skipped a required rate. | Financial totals can be materially wrong while appearing valid. Current staging FX coverage is clean, but the failure path is deterministic. |
| P1 | Public DTOs expose provider-managed fields without referenced-owner validation | Account DTOs expose balances, external IDs and `bankLinkId` at [`Account.ts:50`](../backend/src/types/Account.ts#L50). Raw transaction creation/account reassignment similarly lacks referenced-account ownership checks at [`transaction.service.ts:103`](../backend/src/transaction/transaction.service.ts#L103). | A leaked foreign UUID can create cross-tenant relationships; users can also overwrite provider-linked balances through generic PATCH. Staging currently has zero ownership mismatches. |
| P1 | Six transactions remain pending 20–24 days after a healthy sync | Staging has 14 pending transactions; six are older than seven days, all on one active account whose link is `OK`, has a cursor, and synchronized on August 15. | Users see obsolete pending status and potentially misleading available/spending totals. Database evidence cannot determine whether Plaid stopped returning replacements or local reconciliation failed. |
| P1 | Push endpoint reassignment can cross user boundaries | Registration changes an existing subscription row's user at [`notification.service.ts:94`](../backend/src/notification/notification.service.ts#L94), while queued deliveries retain its ID. Claims do not require notification and subscription users to match at [`notification.service.ts:254`](../backend/src/notification/notification.service.ts#L254). | Under endpoint reuse/session-switch conditions, an old user's queued notification can be sent to the new user. Staging has zero current mismatches. |
| P2 | Archived accounts/categories can continue receiving recurring transactions | Archive paths do not pause schedules, and generation does not revalidate dependencies at [`recurring-manual-transaction.service.ts:203`](../backend/src/recurring-manual-transaction/recurring-manual-transaction.service.ts#L203). The UI then filters archived dependencies from editing. | Hidden accounts can keep accumulating transactions that users cannot repair cleanly. Staging currently has zero affected schedules. |
| P2 | Long-range charts omit the latest balance | Year-plus transforms retain only month-first observations at [`balance-utils.ts:214`](../frontend/src/lib/balance-utils.ts#L214). A `$400` current value reproduced as a `$300` graph endpoint. | Headline and graph disagree, making current net worth appear stale. Existing tests currently codify the defect. |
| P2 | Analysis picker can show a different period from the results | Picker state initializes once at [`analysis.tsx:304`](../frontend/src/routes/_authed/analysis.tsx#L304). Live Back/Forward reproduction left May displayed while URL and data were June. | Users can interpret financial analysis under the wrong visible date range. The reproduction was recorded during the audit. |
| P2 | Settings refetches overwrite unsaved edits | [`settings.tsx:285`](../frontend/src/routes/_authed/settings.tsx#L285) resets local form state whenever user settings refetch. Unrelated immediate-save toggles trigger that refetch. | Unsaved currency, timezone, and theme edits disappear without warning. |
| P2 | Valid data failures are presented as empty or truncated data | Category drill-down maps API errors to “No transactions” at [`CategoryTransactionsModal.tsx:30`](../frontend/src/components/CategoryTransactionsModal.tsx#L30). Account history failures produce a blank modal at [`AccountModal.tsx:166`](../frontend/src/components/AccountModal.tsx#L166). Investment activity silently stops at ten rows via [`useInvestmentActivity.ts:3`](../frontend/src/hooks/useInvestmentActivity.ts#L3). | Users can conclude there is no activity when the request failed or additional records exist. |
| P2 | Archived categories remain targets of active rules | Rule evaluation does not filter archived targets at [`categorization-rule.service.ts:125`](../backend/src/transaction-categorization/categorization-rule.service.ts#L125). | New transactions can be assigned hidden categories. Staging currently has zero affected active rules. |
| P2 | CSV balance import is permissive, partial, and unbounded | `parseFloat("123abc")` becomes `123`; `Infinity` passes the current check at [`balance-snapshot.controller.ts:192`](../backend/src/balance-snapshot/balance-snapshot.controller.ts#L192). Row failures are caught and skipped at [`balance-snapshot.service.ts:171`](../backend/src/balance-snapshot/balance-snapshot.service.ts#L171). | Malformed files can silently import incorrect subsets. In-memory upload has no explicit size/row limit. |
| P2 | Core clickable UI is not keyboard/screen-reader operable | Live accessibility inspection found clickable generic rows/headers and unnamed icon buttons, including [`CompactAccountRow.tsx:40`](../frontend/src/components/CompactAccountRow.tsx#L40) and [`_authed.tsx:113`](../frontend/src/routes/_authed.tsx#L113). | Blocks important navigation and account operations for keyboard and assistive-technology users. |

### Additional verified lower-priority defects

- Invalid dates such as `2026-02-31` pass validation and normalize to March 3.
- Balance-history queries accept unbounded date spans and materialize every day/account in memory.
- Transaction amount sorting compares magnitude without applying `amountSign`.
- Account archival saves the account, prunes the link, and creates the zero snapshot in separate operations; retrying an already archived account cannot repair a missing snapshot.
- Recurring schedules persist before their immediately due first occurrence is generated, leaving a saved schedule after generation failure.
- Mixed-currency dashboard ordering uses native rather than converted balances.

## Staging state audit

| Priority | State | Count / assessment | Recommended action |
|---|---|---:|---|
| P1 | Active account absent from link membership | 1 missing; 1 archived account still listed | Deploy the relational source-of-truth fix, reconcile the cache, then compare provider data before deciding whether any historical replay is warranted. |
| P1 | Stale pending transactions | 6 older than 7 days; oldest July 22 | Compare against provider state and explicitly resolve/remove only after determining the authoritative replacement state. |
| Resolved | Schema/source migration drift | 30 staging migrations vs 29 in main at audit time | PR #224 landed the missing migration and entity constraint after the audit. |
| P2 | Expired pending webhook/link-flow records | 9 pending; all 9 expired | Enforce `expiresAt` on reads and add expiry/retention cleanup. |
| P2 | Refresh-token retention bloat | 878 total, 3 usable, 68 expired but unrevoked, 801 old revoked/expired | Add bounded retention and a reviewed cleanup job. Rotation-chain integrity itself is clean. |
| P2 | Links without active accounts | 4: one `OK`, three `ERROR` | Review the `OK` link first; add an archive/delete lifecycle so dead links stop receiving work. |
| P3 | Old pending category suggestions | 10 older than 30 days | Expire or surface them explicitly. |
| Review | Likely staging test residue | 2 password-only user shells with no data or usable auth | Confirm ownership before removing; these were not treated as definitively bad. |

### Clean staging controls

- Zero cross-owner or orphaned relationships across accounts, activities, balances, holdings, securities, categories, rules, recurring schedules, and notification deliveries.
- All 636 required historical FX pair/date combinations exist; zero duplicate, invalid, or non-positive rates.
- Zero corrupted `MoneyWithSign` magnitudes or signs.
- Zero active recurring schedules referencing archived dependencies.
- Zero notification/subscription ownership mismatches.
- Zero active rules or pending suggestions targeting archived categories.

## Cleanup and simplification priorities

| Priority | Cleanup | Why / measurable impact |
|---|---|---|
| P1 | Introduce one transactional provider-sync unit of work | Consolidate link locking, idempotent transaction upserts, cursor advancement, and webhook state transitions. This removes several independent P1 failure modes. |
| P1 | Replace or transactionally maintain `BankLink.accountIds` | The denormalized list is already inconsistent in staging. Prefer account relations as the source of truth. |
| P1 | Split public/manual DTOs from internal provider DTOs | Reduces authorization surface and prevents generic endpoints from mutating provider-owned state. |
| P1 | Centralize money and strict date/number parsing | A correct money helper already exists. Reusing it would remove duplicated sign/decimal behavior and close CSV/manual-balance defects. |
| P2 | Split oversized frontend/backend modules | Eight frontend files total 7,818 lines; six transaction helpers are duplicated across desktop/mobile implementations. Backend bank-link and transaction services are also approximately 1,800/1,400-line orchestration units. |
| P2 | Lazy-load Settings and large route panels | Main production chunk is 1.54 MB minified; PWA precache is 3.71 MiB. |
| P2 | Centralize typed query keys and error policy | There are 31 query invalidations across 15 handwritten frontend files, including duplicated string-predicate invalidators. |
| P2 | Add lifecycle/retention services | Webhook contexts, refresh tokens, notifications, suggestions, and empty bank links currently accumulate with inconsistent semantics. |
| P3 | Remove dead code and noisy build warnings | Legacy `AccountCard` is 118 unreferenced lines; six route test files generate router warnings on every build. |

## Recommended execution order

1. Reconcile the staging-only migration and repair `BankLink.accountIds` maintenance before the next deployment.
2. Make webhook acquisition, transaction processing, and cursor advancement atomic and idempotent; add fault-injection tests for cursor-save and per-item failures.
3. Fix manual money encoding and mixed-currency failure behavior, with regression tests for negative USD, JPY, missing FX, and multiple base currencies.
4. Split public/internal DTOs and validate ownership for every referenced account, bank link, category, and subscription.
5. Reconcile stale staging transactions and expired records only after the responsible code paths are fixed and the authoritative provider state is known.
6. Address the reproduced frontend correctness and accessibility defects, then complete the larger component/query-key cleanup.

## Validation performed

- Frontend lint, strict typecheck, and production build passed.
- Frontend tests: 41 files and 220 tests passed.
- Backend lint and typecheck passed.
- Backend tests: all meaningful suites passed except [`transaction.module.spec.ts`](../backend/test/transaction/transaction.module.spec.ts), which cannot load ESM `p-map` through `@mastra/core`. Two initial socket-binding failures passed outside the sandbox.
- Local API `/health` and the OpenAPI document were healthy.
- Local PostgreSQL had all 29 checked-in migrations applied with no local TypeORM schema diff.
- An authenticated local browser walkthrough and recorded Analysis reproduction were completed.
- Checked-out `main` was two commits behind `origin/main`; the upstream delta did not contain the staging-only migration.
- Git status remained unchanged apart from the pre-existing untracked `logs/` directory.
- Temporary browser, frontend, backend, and local PostgreSQL services started for the audit were stopped; the database volume was preserved.

## Audit scope notes

- Repository reviewed: backend NestJS API, frontend TanStack React application, migrations, tests, provider synchronization, notification flows, recurring transactions, balance/analysis paths, and build/runtime configuration.
- Staging sample at audit time: 3 users, 17 links, 34 accounts, 1,604 account activities, 2,036 balance snapshots, and 1,456 webhook-event records.
- Provider logs and external Plaid state were not mutated or replayed. Some staging anomalies, particularly old pending transactions, require provider correlation before correction.
