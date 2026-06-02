# Recurring Manual Transactions

## Status

Planned

## Goal

Support recurring manual transactions that create real manual transactions only when their scheduled date is due.

The ideal UX is: while adding or editing a manual transaction, a user can mark it as recurring monthly, choose the day of the month, and save a reusable schedule. Future intended transactions are managed from a separate recurring list, not pre-created in the normal Transactions table. Generated rows should behave like existing manual transactions: editable, deletable, categorized, included in transaction lists and analysis after creation, and never tied to provider sync or balance snapshot mutations.

## Current Behavior

- `frontend/src/components/transactions/ManualTransactionModal.tsx` is the current create/edit surface for manual transactions. It captures account, signed amount, read-only account currency, date, merchant, and required category.
- `frontend/src/routes/_authed/transactions.tsx` opens `ManualTransactionModal`, invalidates transaction/category/analysis queries after saves, and exposes manual-only edit/delete actions through `TransactionsTable` and `TransactionsMobileList`.
- `frontend/src/lib/manual-transactions.ts` identifies manual rows by `TransactionSource.manual`.
- `backend/src/types/Transaction.ts` already has `TransactionSourceSchema`, `CreateManualTransactionDtoSchema`, and `UpdateManualTransactionDtoSchema`.
- `backend/src/transaction/transaction.controller.ts` exposes `POST /transaction/manual`, `PATCH /transaction/:id/manual`, and `DELETE /transaction/:id/manual`.
- `backend/src/transaction/transaction.service.ts` validates active account ownership and assignable categories for manual transactions, then creates `source = 'manual'` `BankingTransactionEntity` rows through the shared `AccountActivityEntity` spine.
- Manual transactions currently do not update account balances, balance snapshots, or provider sync state.
- Scheduled backend work already uses `@nestjs/schedule`, including `backend/src/bank-link/bank-link.scheduled.ts`, `backend/src/currency-exchange/currency-exchange.scheduled.ts`, and `backend/src/transaction-categorization/recommendations/categorization-rule-recommendation.processor.ts`.
- User timezone exists in `UserSettingsSchema` in `backend/src/types/UserSettings.ts`, but transaction dates are date-only strings. Monthly recurrence can use date-only occurrence dates and avoid time-of-day UI for the first version.

UX decisions settled for this plan:

- Generated transactions materialize only on their due date.
- Future recurring intent appears in a separate recurring schedule management surface, not as future rows in the Transactions table.
- A monthly schedule for day 29, 30, or 31 uses the last calendar day when a month is shorter.
- Generated transactions remain normal manual transactions. Editing or deleting a generated transaction changes that occurrence only; schedule edits affect future occurrences only.

## Target Data Shape

Add a recurring schedule resource:

```ts
type RecurringManualTransactionSchedule = {
  id: string
  userId: string
  accountId: string
  accountName?: string | null
  amount: MoneyWithSign
  merchantName: string
  categoryId: string
  category?: Category | null
  frequency: 'monthly'
  dayOfMonth: number
  startDate: string
  endDate: string | null
  nextOccurrenceDate: string
  lastGeneratedOccurrenceDate: string | null
  pausedAt: Date | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}
```

Add occurrence tracking for idempotency and audit:

```ts
type RecurringManualTransactionOccurrence = {
  id: string
  userId: string
  scheduleId: string
  occurrenceDate: string
  transactionId: string
  generatedAt: Date
  createdAt: Date
  updatedAt: Date
}
```

Add DTOs in a new backend type file, likely `backend/src/types/RecurringManualTransaction.ts`:

```ts
type CreateRecurringManualTransactionScheduleDto = {
  accountId: string
  amount: MoneyWithSign
  merchantName: string
  categoryId: string
  frequency: 'monthly'
  dayOfMonth: number
  startDate: string
  endDate?: string | null
}

type UpdateRecurringManualTransactionScheduleDto = {
  accountId?: string
  amount?: MoneyWithSign
  merchantName?: string
  categoryId?: string
  dayOfMonth?: number
  startDate?: string
  endDate?: string | null
  paused?: boolean
}
```

Database shape:

- Add `recurring_manual_transaction_schedule_entity`.
- Add `recurring_manual_transaction_occurrence_entity`.
- Add a unique index on `recurring_manual_transaction_occurrence_entity ("scheduleId", "occurrenceDate")` so retries cannot generate duplicate monthly occurrences.
- Keep generated banking transactions as existing `source = 'manual'` rows. Do not add future transaction rows.

## Milestones

### 1. Backend Schedule Contract And Persistence

Implementation tasks:

- Create `backend/src/types/RecurringManualTransaction.ts` with registered Zod schemas for schedule responses, create/update DTOs, and occurrence responses where needed.
- Add `backend/src/recurring-manual-transaction/recurring-manual-transaction-schedule.entity.ts`.
- Add `backend/src/recurring-manual-transaction/recurring-manual-transaction-occurrence.entity.ts`.
- Add a migration under `backend/src/migrations/` for the two tables, account/category/transaction foreign keys, `archivedAt`/`pausedAt` columns, and the unique `(scheduleId, occurrenceDate)` index.
- Store amount using the existing `BalanceColumns` embedded column style from `backend/src/common/balance.columns.ts`.
- Store `frequency` as `monthly` for now, with schema validation leaving room for future frequencies without implementing them.
- Implement date helpers in `backend/src/recurring-manual-transaction/recurring-manual-transaction-date.ts`:
  - validate `dayOfMonth` from 1 through 31.
  - compute the next monthly occurrence on or after a supplied date.
  - clamp day 29, 30, or 31 to the last day of shorter months.
  - stop when the computed occurrence is after `endDate`.

Exit criteria:

- Migrations are reversible.
- Zod schemas are OpenAPI-compatible via `registerSchema()`.
- Date helper tests cover normal months, February, leap years, start dates before/after the chosen day, end dates, and 31st fallback behavior.

### 2. Backend Schedule Service And API

Implementation tasks:

- Add `backend/src/recurring-manual-transaction/recurring-manual-transaction.module.ts`, `.service.ts`, and `.controller.ts`.
- Import `AccountEntity`, `CategoryEntity`, `TransactionEntity`, the two new recurring entities, `CategoryModule`, and `TransactionModule` as needed.
- Implement user-scoped service methods:
  - `findAll(userId)` for active, non-archived schedules.
  - `create(userId, dto)` with active account validation mirroring `TransactionService.findActiveUserAccount()` behavior.
  - `update(id, userId, dto)` where edits recalculate `nextOccurrenceDate` from today or the current `nextOccurrenceDate`, whichever is later.
  - `pause(id, userId)` and `resume(id, userId)` if the update DTO does not make pause semantics clean enough.
  - `archive(id, userId)` as a soft delete that does not delete previously generated transactions.
- Validate `categoryId` through `CategoryService.findActiveAssignableCategory()` just like manual transaction creation.
- Validate amount currency against the selected account's `currentBalance.currency` using the same rule as `TransactionService.buildManualAmount()`.
- Expose endpoints:
  - `GET /recurring-manual-transaction`
  - `POST /recurring-manual-transaction`
  - `PATCH /recurring-manual-transaction/:id`
  - `DELETE /recurring-manual-transaction/:id`
  - optional `POST /recurring-manual-transaction/:id/pause` and `/resume` if separated from `PATCH`.
- Add `ZodApiBody`, `ZodApiResponse`, `ZodValidationPipe`, and `@ApiResponse` metadata for OpenAPI generation.

Exit criteria:

- Schedule create/update fails for archived accounts, unowned accounts, unavailable categories, zero amounts, invalid dates, and currency mismatches.
- Schedule list only returns the current user's non-archived schedules.
- Deleting a schedule archives it and leaves existing generated manual transactions untouched.

### 3. Idempotent Due-Date Materialization

Implementation tasks:

- Add `backend/src/recurring-manual-transaction/recurring-manual-transaction.scheduled.ts` with a daily cron. Use a stable low-traffic UTC time, and compare against date-only `nextOccurrenceDate` values.
- Add `RecurringManualTransactionService.generateDueOccurrences(todayDate)` that:
  - finds active schedules with `pausedAt IS NULL`, `archivedAt IS NULL`, and `nextOccurrenceDate <= todayDate`.
  - processes all due occurrences for a schedule in order, so an offline backend catches up missed months.
  - inserts the occurrence row under the unique `(scheduleId, occurrenceDate)` constraint before creating the transaction.
  - creates the actual transaction through a refactored transaction service method that accepts an `EntityManager` or otherwise participates in the same TypeORM transaction.
  - updates `lastGeneratedOccurrenceDate` and `nextOccurrenceDate` after each generated occurrence.
  - logs structured success/failure context with schedule id, user id, occurrence date, and generated transaction id.
- Refactor `backend/src/transaction/transaction.service.ts` so manual transaction creation can be reused safely by the scheduler:
  - extract manual account/category/amount validation into reusable helpers.
  - add a transaction-manager-aware `createManualWithManager(userId, dto, manager)` or equivalent.
  - keep the existing `createManual(userId, dto)` controller behavior unchanged.
- Keep generated transactions as `source = 'manual'`, `provider = 'manual'`, `pending = false`, with `providerDate` and `activityDate` set to the occurrence date.

Exit criteria:

- Running the scheduled processor twice for the same date creates exactly one transaction per schedule occurrence.
- A schedule that was paused or archived before processing creates no transaction.
- A schedule with missed months creates each missed due occurrence once and advances to the next future occurrence.
- Generated transactions are visible through existing `GET /transaction` and summary/analysis paths only after generation.

### 4. Generated Client And Frontend Recurrence UX

Implementation tasks:

- Run `cd frontend && yarn orval` after the backend OpenAPI contract includes recurring endpoints.
- Extend `frontend/src/components/transactions/ManualTransactionModal.tsx` for create mode:
  - add a compact recurrence section below the date/category fields.
  - use a `Switch` or checkbox labeled for monthly recurrence.
  - when enabled, show a day-of-month select or numeric input constrained to 1-31.
  - default the recurrence day from the entered transaction date.
  - set schedule `startDate` to the entered date.
  - preserve the existing one-time transaction path when recurrence is off.
- On recurring save, create the recurring schedule and create the first manual transaction only if the entered date is due now or in the past. For a future start date, create only the schedule.
- Add success/error notifications that distinguish "Transaction added" from "Recurring transaction scheduled".
- Add a recurring schedule management surface. Prefer a new Settings tab such as `settings?tab=recurring` or a Transactions-page drawer reached from the Add transaction workflow; choose the lower-friction placement during implementation based on existing route ergonomics in `frontend/src/routes/_authed/settings.tsx` and `frontend/src/routes/_authed/transactions.tsx`.
- The recurring list should show merchant, account, amount, category, monthly day, next occurrence, paused status, and actions for edit, pause/resume, and delete.
- Reuse `AccountSelect`, `CategorySelect`, `getViewportAwareOverlayComboboxProps()`, `viewportAwareDropdownMaxHeight`, and existing transaction invalidation patterns.

Exit criteria:

- A user can create a one-time manual transaction exactly as before.
- A user can create a monthly recurring schedule from the manual transaction modal without future transactions appearing in the Transactions table.
- The recurring schedule list shows the next occurrence and supports pause/resume, edit, and delete.
- Mobile and desktop layouts fit without overlapping controls or clipped text.

### 5. Tests And UI Validation

Implementation tasks:

- Add backend service tests for schedule create/update/archive and due occurrence generation under `backend/test/recurring-manual-transaction/`.
- Add backend controller tests for user-scoped endpoints, validation failures, and OpenAPI-shaped responses.
- Add scheduled processor tests for duplicate prevention, catch-up generation, paused/archived schedules, end dates, and 31st fallback.
- Update `backend/test/transaction/transaction.service.spec.ts` if the manual transaction service refactor changes helper boundaries.
- Add frontend tests for `ManualTransactionModal` recurrence controls and submit branching.
- Add frontend tests for the recurring schedule list surface.
- Update `frontend/src/routes/_authed/settings.test.tsx` or `frontend/src/routes/_authed/transactions.test.tsx` depending on where the management surface lands.

Exit criteria:

- Focused backend and frontend tests pass.
- `$agent-browser` validates create, schedule list, pause/resume, edit, delete, desktop layout, and mobile layout against `http://localhost:4000`.

## Tests

### Backend

- `backend/test/recurring-manual-transaction/recurring-manual-transaction-date.spec.ts`
- `backend/test/recurring-manual-transaction/recurring-manual-transaction.service.spec.ts`
- `backend/test/recurring-manual-transaction/recurring-manual-transaction.controller.spec.ts`
- `backend/test/recurring-manual-transaction/recurring-manual-transaction.scheduled.spec.ts`
- Existing transaction service tests if manual creation is refactored for transaction-manager support.

Important cases:

- Monthly schedule on day 1, mid-month, 29, 30, and 31.
- Leap-year and non-leap February.
- Start date in the past, today, and future.
- End date before the next occurrence.
- Duplicate generation attempts.
- Archived accounts, archived schedules, paused schedules, unavailable categories, invalid amount/currency, and wrong-user access.

### Frontend

- `frontend/src/components/transactions/ManualTransactionModal.test.tsx`
- New recurring schedule list component tests under `frontend/src/components/transactions/` or `frontend/src/components/settings/`, depending on placement.
- `frontend/src/routes/_authed/transactions.test.tsx` for create modal integration.
- `frontend/src/routes/_authed/settings.test.tsx` if a Settings tab is added.

Important cases:

- Recurrence controls are hidden by default and appear when enabled.
- Recurrence day defaults from the selected date.
- One-time creation still calls `transactionControllerCreateManual`.
- Recurring creation calls the generated recurring schedule endpoint.
- Future start dates do not create visible transaction rows immediately.
- Pause/resume/edit/delete refresh the schedule list and transaction queries where relevant.

## Validation Commands

Backend:

```bash
cd backend && yarn test test/recurring-manual-transaction/recurring-manual-transaction-date.spec.ts test/recurring-manual-transaction/recurring-manual-transaction.service.spec.ts test/recurring-manual-transaction/recurring-manual-transaction.controller.spec.ts test/recurring-manual-transaction/recurring-manual-transaction.scheduled.spec.ts
cd backend && yarn test test/transaction/transaction.service.spec.ts
cd backend && yarn lint
```

Frontend:

```bash
cd frontend && yarn orval
cd frontend && yarn test src/components/transactions/ManualTransactionModal.test.tsx
cd frontend && yarn test src/routes/_authed/transactions.test.tsx src/routes/_authed/settings.test.tsx
cd frontend && yarn typecheck
cd frontend && yarn lint
```

Browser validation:

```bash
cd frontend && yarn dev
```

- Use `$agent-browser` to open `http://localhost:4000/transactions`.
- Validate one-time manual transaction creation still works.
- Validate recurring schedule creation from the manual transaction modal.
- Validate future start schedules do not add rows to the Transactions table.
- Validate the schedule management surface on desktop and mobile.
- Validate pause/resume/edit/delete actions and refreshed next occurrence display.

## Overall Exit Criteria

- Users can create a monthly recurring manual transaction schedule from the existing manual transaction flow.
- Real manual transaction rows are created only when an occurrence is due.
- Future recurring intent is visible and manageable in a recurring schedule surface.
- Generated transactions behave like existing manual transactions once materialized.
- Duplicate scheduled processing cannot create duplicate transactions for the same schedule occurrence.
- Pausing, editing, deleting, archived accounts, end dates, and shorter months behave predictably.
- Existing manual transaction creation, editing, deletion, transaction summaries, analysis, provider sync, account balances, and balance snapshots keep their current behavior.
- Backend tests, frontend tests, lint, typecheck, API regeneration, and `$agent-browser` validation pass.
