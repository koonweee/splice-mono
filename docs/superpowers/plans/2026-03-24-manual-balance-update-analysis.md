# Manual Balance Update Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make manual-account balance edits contribute to transaction analysis by creating dated synthetic `Balance update` transactions while safely resetting stale future history for backdated edits.

**Architecture:** Keep the public entry point on `POST /account/:id/balance`, but move the dated manual-balance workflow into a dedicated backend service inside the `account` module so the whole operation can run in one database transaction without introducing a `AccountModule <-> TransactionModule` cycle. Add a durable transaction-source marker plus a partial unique index for synthetic balance-update rows, expose `latestSnapshotDate` and a typed `UpdateManualBalanceDto` through OpenAPI, then update the existing balance modal to send `effectiveDate` and require confirmation before destructive backdated saves.

**Tech Stack:** NestJS, TypeORM, PostgreSQL migrations, Zod, Jest, React, Mantine, TanStack Query, Vitest, Orval, TypeScript

---

### File Structure

**Backend files to create**
- `backend/src/account/manual-balance-update.service.ts`
- `backend/test/account/manual-balance-update.service.spec.ts`
- `backend/src/migrations/<generated-timestamp>-AddManualBalanceUpdateTransactionSource.ts`

**Backend files to modify**
- `backend/src/types/Account.ts`
- `backend/src/account/account.controller.ts`
- `backend/src/account/account.module.ts`
- `backend/src/account/account.service.ts`
- `backend/src/transaction/transaction.entity.ts`
- `backend/src/events/account.events.ts`
- `backend/src/balance-snapshot/balance-snapshot.listener.ts`
- `backend/test/account/account.controller.spec.ts`
- `backend/test/account/account.service.spec.ts`
- `backend/test/balance-snapshot/balance-snapshot.listener.spec.ts`
- `backend/test/mocks/account/account-service.mock.ts`

**Frontend files to create**
- `frontend/src/components/accounts/UpdateBalanceModal.test.tsx`

**Frontend files to modify**
- `frontend/src/components/accounts/UpdateBalanceModal.tsx`

**Generated files expected to change**
- `frontend/src/api/clients/spliceAPI.ts`
- `frontend/src/api/models/account.ts`
- `frontend/src/api/models/accountControllerUpdateBalanceBody.ts`
- `frontend/src/api/models/index.ts`
- `frontend/src/api/models/updateManualBalanceDto.ts`

**Why these files**
- `backend/src/types/Account.ts`: define the named request schema for manual balance updates so Orval stops generating an `unknown` body, and expose `latestSnapshotDate` for the destructive-reset warning.
- `backend/src/account/account.controller.ts`: validate and forward `balance`, `effectiveDate`, and `confirmHistoryReset`.
- `backend/src/account/account.module.ts`: register the new workflow service and the `TransactionEntity` repository without importing `TransactionModule`.
- `backend/src/account/account.service.ts`: keep account CRUD focused and delegate manual balance updates to the new workflow service; also include `latestSnapshotDate` when returning accounts.
- `backend/src/account/manual-balance-update.service.ts`: own the atomic workflow for prior-snapshot lookup, destructive reset, synthetic-transaction replacement, and account-balance synchronization.
- `backend/src/transaction/transaction.entity.ts`: persist a durable source marker for synthetic balance-update rows and enforce one such row per account/date.
- `backend/src/events/account.events.ts` and `backend/src/balance-snapshot/balance-snapshot.listener.ts`: keep creation-time manual snapshots, but remove the now-incorrect event-driven path for balance updates.
- `backend/src/migrations/<generated-timestamp>-AddManualBalanceUpdateTransactionSource.ts`: apply the `source` column and partial unique index in PostgreSQL.
- `backend/test/account/manual-balance-update.service.spec.ts`: lock down the high-value behavior before implementation.
- `frontend/src/components/accounts/UpdateBalanceModal.tsx`: add the effective-date input, destructive warning, confirmation flow, and broader query invalidation.
- `frontend/src/components/accounts/UpdateBalanceModal.test.tsx`: prove the date defaults, warning flow, typed payload, and invalidations.
- Generated frontend API files: pick up the named DTO and `latestSnapshotDate` from the backend OpenAPI spec.

### Task 1: Add Failing Backend Coverage For The Dated Manual-Balance Workflow

**Files:**
- Create: `backend/test/account/manual-balance-update.service.spec.ts`
- Modify: `backend/test/account/account.controller.spec.ts`
- Modify: `backend/test/account/account.service.spec.ts`
- Modify: `backend/test/balance-snapshot/balance-snapshot.listener.spec.ts`
- Modify: `backend/test/mocks/account/account-service.mock.ts`

- [ ] **Step 1: Add a controller contract test for `effectiveDate` and `confirmHistoryReset`**

```ts
it('forwards the typed manual balance update payload to AccountService', async () => {
  const body = {
    balance: {
      money: { amount: 125000, currency: 'USD' },
      sign: MoneySign.POSITIVE,
    },
    effectiveDate: '2026-03-24',
    confirmHistoryReset: false,
  };

  await controller.updateBalance('manual-id', mockUser, body);

  expect(mockAccountService.updateManualBalance).toHaveBeenCalledWith(
    'manual-id',
    mockUser.userId,
    body,
  );
});
```

- [ ] **Step 2: Create a focused service spec for the atomic workflow**

```ts
it('creates a positive Balance update transaction from the latest prior snapshot', async () => {
  priorSnapshotRepo.findOne.mockResolvedValue(
    buildSnapshot({ snapshotDate: '2026-03-20', amount: 100000 }),
  );

  await service.updateManualBalance('manual-id', mockUserId, {
    balance: money(125000),
    effectiveDate: '2026-03-24',
    confirmHistoryReset: false,
  });

  expect(transactionRepo.save).toHaveBeenCalledWith(
    expect.objectContaining({
      merchantName: 'Balance update',
      date: '2026-03-24',
      source: TransactionSource.MANUAL_BALANCE_UPDATE,
      amount: expect.objectContaining({ amount: 25000 }),
    }),
  );
});
```

- [ ] **Step 3: Add the destructive-reset and replacement regressions**

```ts
it('recomputes same-day replacement from the same prior snapshot baseline', async () => {
  await service.updateManualBalance('manual-id', mockUserId, {
    balance: money(140000),
    effectiveDate: '2026-03-24',
    confirmHistoryReset: false,
  });

  expect(transactionRepo.save).toHaveBeenLastCalledWith(
    expect.objectContaining({
      merchantName: 'Balance update',
      amount: expect.objectContaining({ amount: 40000 }),
    }),
  );
});

it('deletes later snapshots and later synthetic balance-update transactions when backdating', async () => {
  await service.updateManualBalance('manual-id', mockUserId, {
    balance: money(120000),
    effectiveDate: '2026-03-18',
    confirmHistoryReset: true,
  });

  expect(snapshotRepo.delete).toHaveBeenCalledWith(
    expect.objectContaining({
      accountId: 'manual-id',
      userId: mockUserId,
    }),
  );
  expect(transactionRepo.delete).toHaveBeenCalledWith(
    expect.objectContaining({
      accountId: 'manual-id',
      userId: mockUserId,
      source: TransactionSource.MANUAL_BALANCE_UPDATE,
    }),
  );
});

it('rejects destructive backdated saves when confirmHistoryReset is false', async () => {
  await expect(
    service.updateManualBalance('manual-id', mockUserId, {
      balance: money(120000),
      effectiveDate: '2026-03-18',
      confirmHistoryReset: false,
    }),
  ).rejects.toThrow(BadRequestException);
});
```

- [ ] **Step 4: Update existing account and listener specs to fail against the old event-driven path**

```ts
it('delegates manual balance updates instead of emitting ManualAccountBalanceUpdatedEvent', async () => {
  await accountService.updateManualBalance('manual-id', mockUserId, dto);

  expect(mockEventEmitter.emit).not.toHaveBeenCalledWith(
    ManualAccountEvents.BALANCE_UPDATED,
    expect.anything(),
  );
});

it('only handles ManualAccountEvents.CREATED for manual account snapshots', async () => {
  expect(listener.handleManualAccountCreated).toBeDefined();
  expect((listener as any).handleManualAccountUpdate).toBeUndefined();
});
```

- [ ] **Step 5: Run the targeted backend tests to verify they fail**

Run: `cd backend && yarn test test/account/account.controller.spec.ts test/account/account.service.spec.ts test/account/manual-balance-update.service.spec.ts test/balance-snapshot/balance-snapshot.listener.spec.ts --runInBand`

Expected: FAIL with missing `updateManualBalance(id, userId, dto)` contract, missing `ManualBalanceUpdateService`, and stale balance-update event expectations.

- [ ] **Step 6: Commit**

```bash
git add backend/test/account/account.controller.spec.ts backend/test/account/account.service.spec.ts backend/test/account/manual-balance-update.service.spec.ts backend/test/balance-snapshot/balance-snapshot.listener.spec.ts backend/test/mocks/account/account-service.mock.ts
git commit -m "test: cover manual balance update workflow"
```

### Task 2: Implement The Atomic Backend Workflow And Durable Transaction Marker

**Files:**
- Create: `backend/src/account/manual-balance-update.service.ts`
- Create: `backend/src/migrations/<generated-timestamp>-AddManualBalanceUpdateTransactionSource.ts`
- Modify: `backend/src/types/Account.ts`
- Modify: `backend/src/account/account.controller.ts`
- Modify: `backend/src/account/account.module.ts`
- Modify: `backend/src/account/account.service.ts`
- Modify: `backend/src/transaction/transaction.entity.ts`
- Modify: `backend/src/events/account.events.ts`
- Modify: `backend/src/balance-snapshot/balance-snapshot.listener.ts`
- Test: `backend/test/account/account.controller.spec.ts`
- Test: `backend/test/account/account.service.spec.ts`
- Test: `backend/test/account/manual-balance-update.service.spec.ts`
- Test: `backend/test/balance-snapshot/balance-snapshot.listener.spec.ts`

- [ ] **Step 1: Add a named DTO and expose `latestSnapshotDate` on account responses**

```ts
export const UpdateManualBalanceDtoSchema = registerSchema(
  'UpdateManualBalanceDto',
  z.object({
    balance: CurrentAndAvailableBalanceSchema.shape.currentBalance,
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    confirmHistoryReset: z.boolean().default(false),
  }),
);

export const AccountSchema = registerSchema(
  'Account',
  z.object({
    // existing fields...
    latestSnapshotDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
);
```

- [ ] **Step 2: Add a dedicated synthetic source marker to `TransactionEntity`**

```ts
export enum TransactionSource {
  STANDARD = 'STANDARD',
  MANUAL_BALANCE_UPDATE = 'MANUAL_BALANCE_UPDATE',
}

@Index('UQ_manual_balance_update_per_account_date', ['accountId', 'date'], {
  unique: true,
  where: `"source" = 'MANUAL_BALANCE_UPDATE'`,
})
@Entity()
export class TransactionEntity extends OwnedEntity {
  @Column({ type: 'varchar', default: TransactionSource.STANDARD })
  source: TransactionSource;
}
```

- [ ] **Step 3: Create `ManualBalanceUpdateService` and implement the whole write flow in one DB transaction**

```ts
await this.accountRepository.manager.transaction(async (manager) => {
  const accountRepo = manager.getRepository(AccountEntity);
  const snapshotRepo = manager.getRepository(BalanceSnapshotEntity);
  const transactionRepo = manager.getRepository(TransactionEntity);

  const account = await accountRepo.findOneOrFail({
    where: { id: accountId, userId },
  });
  assertManualAccount(account);

  const priorSnapshot = await snapshotRepo.findOne({
    where: {
      accountId,
      userId,
      snapshotDate: LessThan(effectiveDate),
    },
    order: { snapshotDate: 'DESC' },
  });

  const latestSnapshot = await snapshotRepo.findOne({
    where: { accountId, userId },
    order: { snapshotDate: 'DESC' },
  });

  const isDestructive =
    !!latestSnapshot && latestSnapshot.snapshotDate > effectiveDate;
  if (isDestructive && !confirmHistoryReset) {
    throw new BadRequestException(
      'Backdated balance updates require confirmation before clearing later history',
    );
  }

  await upsertSnapshot(snapshotRepo, account, balance, effectiveDate, userId);
  await snapshotRepo.delete({
    accountId,
    userId,
    snapshotDate: MoreThan(effectiveDate),
  });
  await transactionRepo.delete({
    accountId,
    userId,
    source: TransactionSource.MANUAL_BALANCE_UPDATE,
    date: MoreThan(effectiveDate),
  });

  const delta = calculateDelta(priorSnapshot, balance);
  await syncBalanceUpdateTransaction(transactionRepo, {
    account,
    effectiveDate,
    delta,
    userId,
  });

  syncAccountBalances(account, balance);
  await accountRepo.save(account);
});
```

- [ ] **Step 4: Wire the controller and module to the new service, and remove the stale balance-update event path**

```ts
@Post(':id/balance')
@ZodApiBody({ schema: UpdateManualBalanceDtoSchema })
async updateBalance(
  @Param('id') id: string,
  @CurrentUser() user: JwtUser,
  @Body(new ZodValidationPipe(UpdateManualBalanceDtoSchema))
  body: UpdateManualBalanceDto,
): Promise<Account> {
  return this.accountService.updateManualBalance(id, user.userId, body);
}
```

```ts
@Injectable()
export class AccountService extends OwnedCrudService<...> {
  async updateManualBalance(
    accountId: string,
    userId: string,
    dto: UpdateManualBalanceDto,
  ): Promise<Account> {
    return this.manualBalanceUpdateService.updateManualBalance(
      accountId,
      userId,
      dto,
    );
  }
}
```

```ts
export const ManualAccountEvents = {
  CREATED: 'manual-account.created',
} as const;
```

- [ ] **Step 5: Generate and review the migration for the new `source` column**

Run: `cd backend && yarn migration:generate src/migrations/AddManualBalanceUpdateTransactionSource`

Expected: a new file under `backend/src/migrations/` that adds the `source` column with default `'STANDARD'`. Review the generated SQL and manually add the partial unique index if TypeORM does not generate it:

```ts
await queryRunner.query(`
  CREATE UNIQUE INDEX "UQ_manual_balance_update_per_account_date"
  ON "transaction_entity" ("accountId", "date")
  WHERE "source" = 'MANUAL_BALANCE_UPDATE'
`);
```

- [ ] **Step 6: Run the targeted backend tests until they pass**

Run: `cd backend && yarn test test/account/account.controller.spec.ts test/account/account.service.spec.ts test/account/manual-balance-update.service.spec.ts test/balance-snapshot/balance-snapshot.listener.spec.ts --runInBand`

Expected: PASS with the new typed DTO, delegated workflow, destructive-reset guard, and no `BALANCE_UPDATED` event path.

- [ ] **Step 7: Commit**

```bash
git add backend/src/types/Account.ts backend/src/account/account.controller.ts backend/src/account/account.module.ts backend/src/account/account.service.ts backend/src/account/manual-balance-update.service.ts backend/src/transaction/transaction.entity.ts backend/src/events/account.events.ts backend/src/balance-snapshot/balance-snapshot.listener.ts backend/src/migrations/*.ts
git commit -m "feat: add manual balance update workflow"
```

### Task 3: Regenerate The Frontend Client And Add Failing UI Coverage

**Files:**
- Create: `frontend/src/components/accounts/UpdateBalanceModal.test.tsx`
- Modify: `frontend/src/components/accounts/UpdateBalanceModal.tsx`
- Modify: `frontend/src/api/clients/spliceAPI.ts`
- Modify: `frontend/src/api/models/account.ts`
- Modify: `frontend/src/api/models/accountControllerUpdateBalanceBody.ts`
- Modify: `frontend/src/api/models/index.ts`
- Modify: `frontend/src/api/models/updateManualBalanceDto.ts`

- [ ] **Step 1: Regenerate the frontend API client from the updated backend schema**

Run:

```bash
cd backend && yarn start:dev
cd frontend && yarn orval
```

Expected:
- `frontend/src/api/models/accountControllerUpdateBalanceBody.ts` becomes a typed body instead of `{ [key: string]: unknown }`
- `frontend/src/api/models/updateManualBalanceDto.ts` is created
- `frontend/src/api/models/account.ts` includes `latestSnapshotDate?: string`

- [ ] **Step 2: Add a focused modal test covering the new warning flow**

```tsx
it('shows a destructive warning before a backdated save that clears later history', async () => {
  renderModal({
    account: makeAccount({ latestSnapshotDate: '2026-03-24' }),
  });

  await user.clear(screen.getByLabelText('Current Balance'));
  await user.type(screen.getByLabelText('Current Balance'), '1200.00');
  await user.type(screen.getByLabelText('Effective Date'), '2026-03-18');
  await user.click(screen.getByRole('button', { name: 'Save' }));

  expect(
    screen.getByText(/remove all later balance history for this account/i),
  ).toBeTruthy();
  expect(updateBalanceMock).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Add an invalidation assertion for transactions and analysis**

```tsx
it('invalidates transactions and analysis queries after a confirmed save', async () => {
  await confirmAndSubmit();

  expect(invalidateQueriesMock).toHaveBeenCalledWith(
    expect.objectContaining({
      queryKey: getTransactionControllerFindAllQueryKey(),
    }),
  );
  expect(invalidateQueriesMock).toHaveBeenCalledWith(
    expect.objectContaining({
      queryKey: ['/transaction-analysis'],
    }),
  );
});
```

- [ ] **Step 4: Run the new frontend test to verify it fails**

Run: `cd frontend && yarn test src/components/accounts/UpdateBalanceModal.test.tsx`

Expected: FAIL because the modal has no date input, no warning state, and no transaction-analysis invalidation yet.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/accounts/UpdateBalanceModal.test.tsx frontend/src/api/clients/spliceAPI.ts frontend/src/api/models/account.ts frontend/src/api/models/accountControllerUpdateBalanceBody.ts frontend/src/api/models/index.ts frontend/src/api/models/updateManualBalanceDto.ts
git commit -m "test: cover manual balance update modal"
```

### Task 4: Implement The Frontend Effective-Date And Confirmation UX

**Files:**
- Modify: `frontend/src/components/accounts/UpdateBalanceModal.tsx`
- Test: `frontend/src/components/accounts/UpdateBalanceModal.test.tsx`

- [ ] **Step 1: Add the effective-date field and destructive-warning state to the modal**

```tsx
const form = useForm({
  initialValues: {
    amount: account.currentBalance.money.amount / 100,
    effectiveDate: dayjs().format('YYYY-MM-DD'),
    confirmHistoryReset: false,
  },
});

const requiresResetConfirmation =
  !!account.latestSnapshotDate &&
  dayjs(form.values.effectiveDate).isBefore(account.latestSnapshotDate, 'day') &&
  !form.values.confirmHistoryReset;
```

```tsx
<DateInput
  label="Effective Date"
  valueFormat="YYYY-MM-DD"
  maxDate={new Date()}
  {...form.getInputProps('effectiveDate')}
/>

{requiresResetConfirmation && (
  <Alert color="yellow" title="This will clear later balance history">
    Saving this backdated balance will remove all later balance history for this
    account.
  </Alert>
)}
```

- [ ] **Step 2: Gate destructive submissions behind explicit confirmation and send the typed payload**

```tsx
if (requiresResetConfirmation) {
  form.setFieldValue('confirmHistoryReset', true);
  return;
}

updateBalance.mutate({
  id: account.id,
  data: {
    balance: toMoneyWithSign(values.amount, account.currentBalance.money.currency),
    effectiveDate: values.effectiveDate,
    confirmHistoryReset: values.confirmHistoryReset,
  },
});
```

- [ ] **Step 3: Invalidate all affected query families on success**

```tsx
queryClient.invalidateQueries({
  queryKey: getAccountControllerFindAllQueryKey(),
});
queryClient.invalidateQueries({
  queryKey: getBalanceQueryControllerGetBalancesQueryKey(),
});
queryClient.invalidateQueries({
  queryKey: getBalanceQueryControllerGetAllBalancesQueryKey(),
});
queryClient.invalidateQueries({
  queryKey: getTransactionControllerFindAllQueryKey(),
});
queryClient.invalidateQueries({
  queryKey: ['/transaction-analysis'],
});
queryClient.invalidateQueries({
  queryKey: ['/transaction-analysis/transactions'],
});
```

- [ ] **Step 4: Re-run the frontend tests and typecheck**

Run:

```bash
cd frontend && yarn test src/components/accounts/UpdateBalanceModal.test.tsx
cd frontend && yarn typecheck
```

Expected:
- Vitest PASS for the modal warning and invalidation flow
- TypeScript PASS with the regenerated Orval types

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/accounts/UpdateBalanceModal.tsx frontend/src/components/accounts/UpdateBalanceModal.test.tsx
git commit -m "feat: add dated manual balance updates"
```

### Task 5: Verify The End-To-End Change Set

**Files:**
- Test: `backend/test/account/account.controller.spec.ts`
- Test: `backend/test/account/account.service.spec.ts`
- Test: `backend/test/account/manual-balance-update.service.spec.ts`
- Test: `backend/test/balance-snapshot/balance-snapshot.listener.spec.ts`
- Test: `frontend/src/components/accounts/UpdateBalanceModal.test.tsx`
- Test: `frontend/src/components/CategoryTransactionsModal.test.tsx`

- [ ] **Step 1: Run the targeted backend verification suite**

Run: `cd backend && yarn test test/account/account.controller.spec.ts test/account/account.service.spec.ts test/account/manual-balance-update.service.spec.ts test/balance-snapshot/balance-snapshot.listener.spec.ts --runInBand`

Expected: PASS for the typed request contract, delegated workflow, creation-only snapshot listener, and destructive-reset cases.

- [ ] **Step 2: Run the targeted frontend verification suite**

Run: `cd frontend && yarn test src/components/accounts/UpdateBalanceModal.test.tsx src/components/CategoryTransactionsModal.test.tsx`

Expected: PASS with the new modal flow and no regression to analysis drilldown tests.

- [ ] **Step 3: Run frontend typecheck**

Run: `cd frontend && yarn typecheck`

Expected: PASS with the regenerated `UpdateManualBalanceDto` and `Account` model.

- [ ] **Step 4: Review the migration and worktree before handoff**

Run:

```bash
git diff -- backend/src/migrations
git status --short
```

Expected:
- the migration contains the `source` column and unique partial index for `MANUAL_BALANCE_UPDATE`
- the worktree contains only the expected backend, frontend, generated-client, and migration files

- [ ] **Step 5: Commit the verification-safe final state**

```bash
git add backend frontend
git commit -m "feat: sync manual balance updates into analysis"
```
