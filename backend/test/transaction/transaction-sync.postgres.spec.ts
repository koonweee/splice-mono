import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';
import { TransactionQueryService } from '../../src/transaction/transaction-query.service';
import { TransactionService } from '../../src/transaction/transaction.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { UserEntity } from '../../src/user/user.entity';
import { AccountEntity } from '../../src/account/account.entity';
import { CategoryEntity } from '../../src/category/category.entity';
import { CategoryService } from '../../src/category/category.service';
import { CategorizationRuleEntity } from '../../src/transaction-categorization/categorization-rule.entity';
import { TransactionCategorizationService } from '../../src/transaction-categorization/categorization-rule.service';
import { RuleBasedCategorizationEngine } from '../../src/transaction-categorization/rule-based-categorization.engine';
import { MoneySign } from '../../src/types/MoneyWithSign';
import type { CreateTransactionDto } from '../../src/types/Transaction';

postgresSuite('Atomic batched banking sync in PostgreSQL', () => {
  let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
  let service: TransactionService;
  let rules: TransactionCategorizationService;
  let userId: string;
  let accountId: string;
  let categoryId: string;
  let events: EventEmitter2;
  const money = {
    money: { amount: '1000000000000000001', currency: 'ETH' },
    sign: MoneySign.NEGATIVE,
  };
  const dto = (
    id: string,
    extra: Partial<CreateTransactionDto> = {},
  ): CreateTransactionDto => ({
    accountId: 'provider-account',
    externalTransactionId: id,
    providerDate: '2026-09-05',
    amount: money,
    merchantName: 'Synthetic merchant',
    pending: false,
    ...extra,
  });
  const sync = (
    added: CreateTransactionDto[],
    modified: CreateTransactionDto[] = [],
    removed: string[] = [],
    hooks = {},
  ) =>
    service.processSyncResults(
      userId,
      new Map([['provider-account', accountId]]),
      { added, modified, removed, nextCursor: 'next', hasMore: false },
      hooks,
    );
  beforeAll(async () => {
    harness = await isolatedPostgres('banking_sync');
    const db = harness.database;
    const txns = db.getRepository(TransactionEntity);
    const categories = db.getRepository(CategoryEntity);
    const accounts = db.getRepository(AccountEntity);
    rules = new TransactionCategorizationService(
      db.getRepository(CategorizationRuleEntity),
      accounts,
      categories,
      txns,
      new RuleBasedCategorizationEngine(),
    );
    events = new EventEmitter2();
    service = new TransactionService(
      txns,
      categories,
      accounts,
      {} as CategoryService,
      rules,
      events,
      new TransactionQueryService(txns),
    );
    jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation(() => undefined);
    const user = await db.getRepository(UserEntity).save(
      UserEntity.fromGoogleIdentity({
        email: `${randomUUID()}@example.test`,
        googleSubject: randomUUID(),
      }),
    );
    userId = user.id;
    accountId = (
      await accounts.save(
        AccountEntity.fromDto(
          {
            name: 'Synthetic',
            type: 'depository',
            currentBalance: money,
            availableBalance: money,
          } as any,
          userId,
        ),
      )
    ).id;
    const category = categories.create({
      userId,
      description: 'Fixture',
      color: '#000000',
      archivedAt: null,
    });
    category.setLabels('Test', 'Test');
    categoryId = (await categories.save(category)).id;
  }, 120000);
  beforeEach(async () => {
    await harness.database.query('DELETE FROM account_activity_entity');
    await harness.database.query(
      'DELETE FROM transaction_reconciliation_archive_entity',
    );
    await harness.database
      .getRepository(CategorizationRuleEntity)
      .delete({ userId });
    await harness.database
      .getRepository(AccountEntity)
      .update(accountId, { archivedAt: null });
    jest.restoreAllMocks();
    jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation(() => undefined);
  });
  afterAll(async () => harness?.close());

  it.each([50, 500, 5000])(
    'writes %i rows in bounded statements with one rule snapshot',
    async (count) => {
      await harness.database.getRepository(CategorizationRuleEntity).save({
        userId,
        name: 'Synthetic rule',
        priority: 10,
        targetCategoryId: categoryId,
        conditions: [
          { field: 'merchantName', operator: 'contains', value: 'synthetic' },
        ],
        archivedAt: null,
      });
      harness.queries.length = 0;
      await sync(Array.from({ length: count }, (_, i) => dto(`txn-${i}`)));
      const inserts = harness.queries.filter((sql) => /^INSERT INTO/.test(sql));
      expect(inserts).toHaveLength(2 * Math.ceil(count / 250));
      expect(
        harness.queries.filter(
          (sql) =>
            /^SELECT/.test(sql) &&
            sql.includes('FROM "') &&
            sql.includes('"categorization_rule_entity"'),
        ),
      ).toHaveLength(1);
      const rows = await harness.database
        .getRepository(TransactionEntity)
        .find({ relations: ['activity'] });
      expect(rows).toHaveLength(count);
      expect(
        rows.every(
          (row) =>
            row.amount.amount === money.money.amount &&
            row.categoryId === categoryId,
        ),
      ).toBe(true);
    },
    120000,
  );

  it('deduplicates additions and modifications and emits inserted identities once after commit', async () => {
    const observed: number[] = [];
    const emit = jest.spyOn(events, 'emit').mockImplementation(() => {
      observed.push(harness.queries.filter((sql) => sql === 'COMMIT').length);
      return true;
    });
    harness.queries.length = 0;
    await sync(
      [dto('duplicate'), dto('duplicate', { merchantName: 'Second' })],
      [dto('duplicate', { merchantName: 'Final' })],
    );
    const rows = await harness.database
      .getRepository(TransactionEntity)
      .find({ relations: ['activity'] });
    expect(rows).toHaveLength(1);
    expect(rows[0].merchantName).toBe('Final');
    expect(emit).toHaveBeenCalledTimes(1);
    expect(observed).toEqual([1]);
    await sync([dto('duplicate')]);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('preserves pending manual metadata and does not resurrect an out-of-order pending identity', async () => {
    await sync([dto('pending', { pending: true })]);
    await harness.database.query(
      'UPDATE banking_transaction_entity SET "reportingDateOverride"=$1,"categoryId"=$2,"categoryAssignmentSource"=\'manual\',"categoryUpdatedAt"=now()',
      ['2026-08-01', categoryId],
    );
    await sync([
      dto('posted', { pendingTransactionId: 'pending' }),
      dto('pending', { pending: true }),
    ]);
    await sync([dto('pending', { pending: true })]);
    const rows = await harness.database
      .getRepository(TransactionEntity)
      .find({ relations: ['activity'] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pending: false,
      categoryId,
      categoryAssignmentSource: 'manual',
      reportingDateOverride: '2026-08-01',
    });
    expect(rows[0].externalTransactionId).toBe('posted');
    expect(rows[0].activity.activityDate).toBe('2026-08-01');
  });

  it('consolidates an existing posted and pending duplicate without losing the newest manual category', async () => {
    await sync([dto('pending', { pending: true }), dto('posted')]);
    await harness.database.query(
      'UPDATE banking_transaction_entity SET "categoryId"=$1,"categoryAssignmentSource"=\'manual\',"categoryUpdatedAt"=now() WHERE pending=true',
      [categoryId],
    );
    await sync([dto('posted', { pendingTransactionId: 'pending' })]);
    const rows = await harness.database
      .getRepository(TransactionEntity)
      .find({ relations: ['activity'] });
    expect(rows).toHaveLength(1);
    expect(rows[0].categoryId).toBe(categoryId);
  });

  it('rolls back every chunk and before-commit side effects after a failure, then retries safely', async () => {
    const emit = jest.spyOn(events, 'emit');
    await expect(
      sync(
        Array.from({ length: 500 }, (_, i) => dto(`txn-${i}`)),
        [],
        [],
        {
          beforeCommit: async () => {
            throw new Error('Injected failure');
          },
        },
      ),
    ).rejects.toThrow('Injected failure');
    expect(
      await harness.database.getRepository(TransactionEntity).count(),
    ).toBe(0);
    expect(emit).not.toHaveBeenCalled();
    await sync([dto('retry')]);
    expect(
      await harness.database.getRepository(TransactionEntity).count(),
    ).toBe(1);
  });

  it('serializes simultaneous triggers, rejects archived accounts, and uses one immutable rule snapshot', async () => {
    await Promise.all([
      sync([dto('simultaneous')]),
      sync([dto('simultaneous')]),
    ]);
    expect(
      await harness.database.getRepository(TransactionEntity).count(),
    ).toBe(1);
    const repository = harness.database.getRepository(CategorizationRuleEntity);
    const rule = await repository.save({
      userId,
      name: 'Rule',
      priority: 10,
      targetCategoryId: categoryId,
      conditions: [
        { field: 'merchantName', operator: 'contains', value: 'synthetic' },
      ],
      archivedAt: null,
    });
    const original = rules.loadActiveRules.bind(rules);
    jest.spyOn(rules, 'loadActiveRules').mockImplementation(async (...args) => {
      const snapshot = await original(...args);
      await repository.update(rule.id, { archivedAt: new Date() });
      return snapshot;
    });
    await sync([dto('one'), dto('two')]);
    expect(
      await harness.database
        .getRepository(TransactionEntity)
        .countBy({ categoryId }),
    ).toBe(2);
    await harness.database
      .getRepository(AccountEntity)
      .update(accountId, { archivedAt: new Date() });
    await expect(sync([dto('archived')])).rejects.toThrow('unavailable');
  });
  it('preserves provider hints and emits only inserted uncategorized identities', async () => {
    await harness.database.getRepository(CategorizationRuleEntity).save({
      userId,
      name: 'Matched',
      priority: 10,
      targetCategoryId: categoryId,
      conditions: [
        { field: 'merchantName', operator: 'equals', value: 'matched' },
      ],
      archivedAt: null,
    });
    const emit = jest.spyOn(events, 'emit');
    await sync([
      dto('matched', { merchantName: 'Matched' }),
      dto('uncategorized', {
        personalFinanceCategory: { primary: 'FOOD', detailed: 'FOOD_COFFEE' },
        providerPayload: { exact: '1000000000000000001' },
      }),
    ]);
    const rows = await harness.database
      .getRepository(TransactionEntity)
      .find({ relations: ['activity'] });
    const uncategorized = rows.find(
      (row) => row.externalTransactionId === 'uncategorized',
    )!;
    expect(uncategorized).toMatchObject({
      categoryId: null,
      providerCategoryPrimary: 'FOOD',
      providerPayload: { exact: '1000000000000000001' },
    });
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][1]).toMatchObject({
      transactionIds: [uncategorized.id],
      count: 1,
    });
  });

  it('removes provider activity parents in batches while preserving manual identities', async () => {
    await sync([dto('remove'), dto('manual')]);
    await harness.database.query(
      `UPDATE banking_transaction_entity SET source='manual' WHERE "activityId" IN (SELECT id FROM account_activity_entity WHERE "externalActivityId"='manual')`,
    );
    const result = await sync([], [], ['remove', 'manual']);
    expect(result.normalRemovedCount).toBe(1);
    const rows = await harness.database
      .getRepository(TransactionEntity)
      .find({ relations: ['activity'] });
    expect(rows).toHaveLength(1);
    expect(rows[0].externalTransactionId).toBe('manual');
  });

  async function prepareAbsence() {
    await sync([dto('absent', { pending: true, providerDate: '2020-01-01' })]);
    const [row] = await harness.database.query(
      `SELECT GREATEST(b."updatedAt", a."updatedAt") AS updated FROM banking_transaction_entity b JOIN account_activity_entity a ON a.id=b."activityId" WHERE a."externalActivityId"='absent'`,
    );
    return {
      internalAccountId: accountId,
      externalTransactionId: 'absent',
      expectedProviderDate: '2020-01-01',
      expectedLocalUpdatedAt: new Date(row.updated).toISOString(),
      evidence: { complete: true },
    };
  }

  it('archives an eligible absence with exact money before deleting its activity', async () => {
    const removal = await prepareAbsence();
    const result = await sync([], [], ['absent'], {
      authoritativePendingAbsenceRemovals: [removal],
    });
    expect(result).toEqual({
      normalRemovedCount: 0,
      authoritativeAbsenceArchivedCount: 1,
      authoritativeAbsenceDeletedCount: 1,
    });
    const [archive] = await harness.database.query(
      `SELECT snapshot FROM transaction_reconciliation_archive_entity WHERE "externalTransactionId"='absent'`,
    );
    expect(archive.snapshot.schemaVersion).toBe(2);
    expect(archive.snapshot.activity.amountAmount).toBe('1000000000000000001');
    expect(
      await harness.database.getRepository(TransactionEntity).count(),
    ).toBe(0);
  });

  it('keeps an absence that became posted before its lock', async () => {
    const removal = await prepareAbsence();
    const result = await sync([], [], ['absent'], {
      authoritativePendingAbsenceRemovals: [removal],
      beforeChanges: async (manager: any) =>
        manager.query('UPDATE banking_transaction_entity SET pending=false'),
    });
    expect(result.authoritativeAbsenceArchivedCount).toBe(0);
    expect(
      await harness.database.getRepository(TransactionEntity).count(),
    ).toBe(1);
  });

  it('keeps an absence when a posted replacement prevents the archive insert', async () => {
    const removal = await prepareAbsence();
    await sync([dto('replacement')]);
    await harness.database.query(
      `UPDATE banking_transaction_entity SET "pendingTransactionId"='absent' WHERE pending=false`,
    );
    const result = await sync([], [], ['absent'], {
      authoritativePendingAbsenceRemovals: [removal],
    });
    expect(result.authoritativeAbsenceArchivedCount).toBe(0);
    expect(
      await harness.database.getRepository(TransactionEntity).count(),
    ).toBe(2);
  });

  it('rolls back archival and deletion when the cursor commit fails', async () => {
    const removal = await prepareAbsence();
    await expect(
      sync([], [], ['absent'], {
        authoritativePendingAbsenceRemovals: [removal],
        beforeCommit: async () => {
          throw new Error('cursor failed');
        },
      }),
    ).rejects.toThrow('cursor failed');
    expect(
      await harness.database.getRepository(TransactionEntity).count(),
    ).toBe(1);
    expect(
      (
        await harness.database.query(
          'SELECT count(*)::int AS count FROM transaction_reconciliation_archive_entity',
        )
      )[0].count,
    ).toBe(0);
  });
});
