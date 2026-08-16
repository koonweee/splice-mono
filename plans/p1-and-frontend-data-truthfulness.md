# P1 and Frontend Data Truthfulness Remediation

## Status

Complete

## Goal

Remove every remaining P1 defect from the 2026-08-15 audit and fix the
frontend P2 behaviors that can present stale, incomplete, or failed data as if
it were authoritative. The result must preserve tenant boundaries, never
silently mix currencies, make provider webhook retries reliable, prevent push
delivery across users, encode manual money canonically, and keep visible UI
state synchronized with the data actually queried.

Accessibility-only work, broad component splitting, query-key refactors, and
the P2 recurring/archive and CSV-import findings are outside this plan.

## Current Behavior

- `CreateAccountDtoSchema` and `CreateTransactionDtoSchema` are shared between
  provider ingestion and authenticated public routes. The public account and
  transaction controllers consequently accept provider-managed identifiers,
  balances, payloads, and foreign resource IDs.
- `AddAccountModal` and `UpdateBalanceModal` hardcode two decimal places and
  send a signed numeric magnitude together with a separate sign. Negative USD
  can be double-negated and zero-decimal currencies such as JPY are scaled by
  100.
- `registerPushSubscription` reassigns an endpoint's existing subscription row
  to the current user while queued deliveries retain that row ID. Delivery
  claims do not require notification and subscription ownership to match.
- update/status webhook acquisition is a read-then-insert operation that saves
  the event as completed before account, investment, or transaction sync work
  finishes. Several downstream failures are logged and swallowed.
- balance history falls back to native money when an exchange rate is missing,
  and summary code adds those native values while labeling the total with one
  currency. Daily FIAT deduplication keys omit the base currency.
- category drilldown and account history omit query-error states, investment
  activity is capped at ten rows, long-range charts discard the latest
  non-month-first observation, Settings refetches replace dirty drafts, and the
  Analysis date picker does not follow URL/back-forward changes.
- Staging was clean at the audit boundary for ownership mismatches, malformed
  money magnitudes, missing required FX rows, push owner mismatches, and
  archived recurring dependencies. This tranche therefore requires invariant
  verification but no expected staging data cleanup.

## Target Data Shape

- Provider ingestion DTOs remain internal service/provider types. Public HTTP
  schemas expose only manual-account creation and explicitly user-editable
  account/transaction fields.
- Every public foreign resource reference is resolved with the authenticated
  `userId`; provider-owned source fields cannot be supplied through public
  routes.
- `MoneyWithSign.money.amount` is always a non-negative integer magnitude;
  `sign` is the only sign carrier. Currency precision comes from the shared
  currency-decimal map.
- Update/status webhook acquisition returns a concrete claim ID. Claims begin
  pending, transition to completed only after all required downstream work,
  and transition to failed on any required-work failure so a provider retry can
  reacquire them.
- A balance summary either uses the requested target currency for every
  included non-zero balance or returns an explicit API failure. It never emits
  a mixed-unit total.
- Existing response shapes stay backward compatible unless a new explicit
  error/status field is necessary. Any OpenAPI change must be regenerated with
  Orval rather than editing `frontend/src/api/**` manually.

## Task Ledger

- [x] P1-A: split public/manual account and transaction write schemas from
  provider ingestion; enforce ownership for every referenced resource.
- [x] P1-B: canonicalize manual balance encoding for negative and
  currency-specific precision on both client and server.
- [x] P1-C: make push endpoint reassignment and delivery claims owner-safe.
- [x] P1-D: make update/status webhook acquisition atomic and completion
  dependent on successful downstream processing.
- [x] P1-E: make FX backfill identity base-aware and make aggregate conversion
  fail closed, including converted-value ordering.
- [x] P2-A: render category drilldown and account-history request failures as
  errors with retry behavior rather than empty data.
- [x] P2-B: expose all investment activity through paging or load-more and show
  total/completeness accurately.
- [x] P2-C: preserve the latest observation in all long-range chart
  downsampling paths.
- [x] P2-D: preserve dirty Settings drafts across background refetches and reset
  the baseline only after a successful explicit save.
- [x] P2-E: synchronize Analysis picker state with URL search changes and
  browser back/forward navigation.
- [x] CONTRACT: regenerate and verify the frontend API client for all public
  schema changes.
- [x] RELEASE: pass focused and full verification, independent read-only review,
  and browser validation before any merge or deployment.

## Milestones

### 1. Public Write Boundary and Canonical Money

Implementation tasks:

- Add public manual-account create and account-metadata update schemas in
  `backend/src/types/Account.ts`; keep provider account data internal to
  `BankLinkService` and entity mapping.
- Replace or remove generic public provider transaction create/update/delete
  surfaces in `backend/src/transaction/transaction.controller.ts`. Preserve
  narrow category, reporting-date, and manual-transaction operations.
- Resolve every public `accountId`, `categoryId`, and `bankLinkId` through an
  owned/active lookup before persistence.
- Reject negative `MoneyWithSign` magnitudes at the API boundary and normalize
  trusted internal mappings through the existing `MoneyWithSign` class.
- Reuse one frontend currency-aware helper in `AddAccountModal` and
  `UpdateBalanceModal`, including negative initial values and zero-decimal
  currencies.
- Regenerate the Orval client and adapt consumers to the narrow schemas.

Exit criteria:

- Provider fields are rejected by public routes and provider ingestion still
  compiles and passes sync tests.
- Cross-owner account, category, and BankLink references fail without writes.
- Positive/negative USD and JPY manual create/update round trips preserve exact
  values and sign.
- Focused backend controller/service/schema tests and frontend component payload
  tests pass.

### 2. Push Ownership and Webhook Retry Safety

Implementation tasks:

- Make endpoint registration transactional. On cross-user reuse, revoke the old
  ownership, prevent all unsent old-user deliveries from being claimed, and
  establish the new ownership without a window that can leak payloads.
- Require notification/subscription `userId` equality in claim and immediately
  before send as defense in depth.
- Replace update/status webhook read-then-complete acquisition with a unique,
  atomic pending claim and return its claim ID.
- Mark that exact claim completed only after every required sync succeeds;
  failures must mark it failed and propagate so retries are not suppressed.
- Preserve time-window deduplication for successful claims and fail closed for
  concurrent processing claims.

Exit criteria:

- Endpoint A-to-B reassignment cannot claim or send A's pending/processing
  delivery after ownership changes.
- Concurrent webhook acquisition has one winner; failure is retryable; success
  suppresses a duplicate within the configured window.
- Account, transaction, holding, and investment-transaction failure tests prove
  failed rather than completed webhook state.
- Focused notification, webhook-event, and BankLink tests pass.

### 3. Currency Completeness and Honest Aggregation

Implementation tasks:

- Include normalized base, target, and date in daily FIAT existing-rate keys.
- Propagate rate-fetch and missing-rate state from `BalanceQueryService` instead
  of silently returning native balances under a requested target currency.
- Prevent `BalanceHistorySurfaceService` and frontend transforms from summing
  heterogeneous currencies; sort account summaries by converted balance when
  conversion was requested.
- Keep same-currency and exact-zero balances working without unnecessary rate
  requirements.

Exit criteria:

- Two bases sharing one target do not suppress either provider request.
- A missing required rate cannot produce a labeled net-worth number composed of
  mixed units.
- Converted asset and liability ordering is deterministic and correct.
- Focused currency backfill, balance query/surface, and frontend transform tests
  pass.

### 4. Frontend Data Truthfulness

Implementation tasks:

- Add explicit error and retry UI for `CategoryTransactionsModal` and account
  balance-history failure in `AccountModal`.
- Make `useInvestmentActivity` and `AccountModal` page or load more until users
  can reach every row represented by the API `total`.
- Change dashboard and account chart downsampling to retain the last result even
  when it is not the first day of a month, without duplicating a month-first
  point.
- Track Settings server baseline separately from dirty local draft values; do
  not reset dirty fields after unrelated immediate-save refetches.
- Synchronize Analysis picker values whenever validated route search changes and
  verify back/forward behavior.

Exit criteria:

- Failed queries never render the same UI as a valid empty response and retry
  can recover.
- Activity rows after the first ten are reachable and displayed totals remain
  truthful.
- Every long-range chart ends at the actual latest requested observation.
- Settings dirty drafts survive all unrelated refetches and a successful
  General save establishes the new clean baseline.
- Analysis URL, picker label, and request parameters stay identical through
  direct navigation and back/forward.
- Focused Vitest suites pass and browser validation covers error/retry,
  pagination, settings draft retention, and Analysis navigation.

### 5. Integration, Review, and Release Readiness

Implementation tasks:

- Regenerate OpenAPI/Orval outputs and verify no generated files were hand
  edited.
- Run backend and frontend lint, typecheck, unit suites, and production builds.
- Run PostgreSQL-backed concurrency tests for webhook claims and any push
  registration path that depends on row locks or unique constraints.
- Run an independent read-only review against every ledger item; fix and repeat
  until the reviewer reports no major issues.
- Produce a rollout order that keeps old/new frontend and backend contracts
  compatible and prevents old/new webhook handlers from overlapping. Re-run
  staging invariants read-only after rollout; do not mutate staging unless a
  new verified anomaly appears and the user separately authorizes its repair.

Exit criteria:

- Every ledger item is verified rather than merely implemented.
- Full relevant checks are green and browser console/runtime checks show no new
  errors.
- Independent review says exactly `No major issues remain.`
- The changes can merge in one reviewable PR, but deployment is deliberately
  sequenced: frontend first, then a drained backend cutover with no old/new
  handler overlap.

## Verification Evidence

Evidence captured on 2026-08-15 against the settled worktree:

- Backend: full ESLint and strict typecheck passed; production build passed;
  Jest passed 75/75 suites and 762/762 tests outside the sandbox so the two
  Supertest suites could bind ephemeral local ports.
- Frontend: full ESLint and strict typecheck passed; production build passed;
  Vitest passed 44/44 files and 255/255 tests. Build output contained only the
  existing route-test discovery and large-chunk warnings.
- API generation: Orval was run from the live local OpenAPI document. The
  content hash for `frontend/src/api/**` was identical before and after the
  clean regeneration:
  `143d553089b97b29f2969a306dabe46bc77626e435843e948d020cfd473ff72b`.
- Real PostgreSQL notification proof used production service/query paths with
  separate connections. It verified fresh processing A-to-B reassignment
  returns 409 without ownership change, stale and lease-less processing can be
  recovered, pending A work is cancelled before a fresh B subscription is
  created, revoked worker-death rows are swept, concurrent cross-user
  registrations serialize, and send completes before reassignment with exactly
  one old-owner provider send. Fixture residue counts were all zero.
- Real PostgreSQL webhook proof verified literal-prefix isolation, concurrent
  work returning retriable 503, callback serialization beyond the old 15-minute
  lease, completed deduplication, failed terminal state, a four-connection
  dedicated lock-pool cap returning 503, and continued main application-pool
  availability at that cap. Proof rows and lock sessions were both zero after
  cleanup.
- Balance regressions prove an account currency change still requests the
  historical snapshot's actual currency, a partially available multi-pair map
  fails the aggregate closed, a completely shadowed prior snapshot does not
  demand an unused rate, inverted pair keys remain canonical, archived accounts
  cannot be re-funded or renamed, and bulk undo cannot restore an archived
  category.
- Settings regressions prove dirty drafts survive refetches, clean forms adopt
  server changes immediately, and a server change cached during a dirty draft
  is adopted when the user manually reverts that draft to the old baseline.
- The independent reviewer and both final matrix/contract subreviews returned
  the exact verdict: `No major issues remain.`
- Browser validation with local auth verified category drilldown error and
  Retry recovery (16 populated rows), investment activity from 10/15 through
  15/15, the mobile full-width 15/15 list, dirty Settings draft retention
  across an unrelated immediate save/refetch, and Analysis URL/picker parity
  through Back and Forward. No uncaught page errors remained.
- The temporary nullable column used only to make the old local clone readable
  by the current backend was empty, removed immediately after browser testing,
  and verified absent. Browser, backend, frontend, and local Postgres services
  were stopped. Staging was never mutated during this tranche.

## Rollout Order

Use one combined PR, but publish and activate the two application artifacts in
this order. This tranche has no migration and no authorized data cleanup.

1. Freeze the release commit and build immutable frontend and backend images;
   record both repository digests.
2. Deploy the new frontend first. Its narrow requests and canonical money
   payloads are accepted by the old backend. Do not deploy the new backend
   while any old frontend remains because the old manual-balance UI can send a
   negative magnitude that the new backend correctly rejects.
3. Perform a drained backend cutover, not a mixed-version rolling update:
   temporarily stop routing webhook ingress and make provider attempts receive
   a retriable failure rather than a false success; drain old HTTP requests and
   push sends; confirm the old backend replica count is zero; then start and
   health-check the new backend image, prove its database-backed read, scale
   only that exact digest, and restore webhook ingress. A brief recreate outage
   or blue/green route switch is acceptable; old and new webhook handlers must
   not overlap.
4. Verify every frontend/backend container uses the expected repository digest,
   has no restarts, and passes both process health and a database-backed read.
5. Re-run staging checks read-only for cross-owner account/category/link data,
   push notification/subscription ownership, malformed negative money
   magnitudes, required FX conversion coverage, and webhook claim state. This
   release is expected to need zero staging mutations.

Before backend activation, either artifact can be rolled back independently.
After the new backend is active, never roll the frontend back to the legacy UI
while leaving the new backend in place. A full rollback must use the same
drained boundary in reverse: stop webhook ingress with retriable responses,
drain current HTTP requests and push sends, verify there are no active
`splice-webhook-fence` sessions or pending update/status claims owned by the new
backend, stop every new-backend replica, and only then start the old backend.
If a claim cannot be proven terminal, keep ingress paused and let the new build
recover it rather than exposing the claim to both protocols. Restore the old
frontend only after the old backend is healthy. No schema rollback is needed.

## Tests

### Backend

- Account and transaction public-controller rejection of provider-owned fields.
- Cross-owner BankLink/account/category reference rejection and no-write
  assertions.
- Money schema magnitude validation and USD/JPY round trips.
- Push endpoint cross-user reassignment, owner-mismatch claim/send exclusion,
  same-user key refresh, and concurrent registration.
- Webhook concurrent claim, in-progress duplicate, failed retry, successful
  dedupe, and every downstream failure path.
- FIAT base/target/date dedupe, rate-provider failure, historical snapshot
  currencies after an account currency change, multi-pair partial-rate
  failure, zero/same-currency behavior, and converted sorting.

### Frontend

- Manual account/balance payloads for positive/negative USD, negative initial
  state, and JPY.
- Category and account-history loading, valid-empty, error, retry, and recovered
  states.
- Investment activity with more than one page and accurate total.
- Dashboard and account charts ending on a mid-month latest date.
- Settings dirty draft through each unrelated immediate-toggle refetch and clean
  baseline after save.
- Analysis rerender/search change plus real browser Back/Forward behavior.

## Validation Commands

Backend:

```bash
cd backend && yarn lint
cd backend && yarn typecheck
cd backend && yarn test
cd backend && yarn build
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn lint
cd frontend && yarn typecheck
cd frontend && yarn test
cd frontend && yarn build
```

Repository:

```bash
git diff --check
git status --short
```

Browser validation uses the repository's local auth bypass and `agent-browser`
for error/retry, pagination, Settings refetch, Analysis Back/Forward, responsive
layout, and console-error checks. Any browser session started for this plan must
be terminated afterward.

## Overall Exit Criteria

- No authenticated public route accepts provider-managed financial fields or
  can create a cross-owner relationship.
- Manual money is canonical and exact across signs and currency precisions.
- Push delivery cannot cross user ownership after endpoint reuse.
- Provider update/status webhook failure remains retryable and successful work
  is deduplicated atomically.
- No mixed-currency total is emitted as a valid single-currency amount and daily
  backfill cannot skip a base/target pair because another base has that target.
- Frontend failed, incomplete, stale, or URL-desynchronized data is never
  presented as authoritative.
- All focused/full automated checks, generated-client verification, browser
  checks, and the independent review loop pass.

## Risks And Open Questions

- Removing generic transaction routes is an API-contract change. Repository
  consumers must be searched before removal; retain a narrow reporting-date
  endpoint if the generated frontend currently uses generic PATCH solely for
  that field.
- Push endpoint ownership rotation must remain safe during a mixed-version
  rolling deployment. Prefer a no-migration compatible transition unless a
  database constraint is necessary; if a migration is added, document exact
  old/new compatibility and rollout order.
- FX fail-closed behavior must distinguish a truly required non-zero conversion
  from zero and same-currency balances so one harmless row does not make the
  whole surface unavailable.
- Settings server updates can race a dirty draft. Tests must cover background
  refetch, explicit save success, save failure, and a newer server value arriving
  while fields are clean.
