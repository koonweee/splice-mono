import { randomUUID } from 'node:crypto';
import { AccountEntity } from '../../src/account/account.entity';
import { CategoryEntity } from '../../src/category/category.entity';
import { McpTransactionCategoriesService } from '../../src/mcp/mcp-transaction-categories.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { UserEntity } from '../../src/user/user.entity';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';

postgresSuite('MCP transaction categories PostgreSQL', () => {
  let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
  let service: McpTransactionCategoriesService;
  let userId: string;
  let categoryId: string;
  let ids: string[];

  beforeAll(async () => {
    harness = await isolatedPostgres('mcp_category_write');
    const db = harness.database;
    userId = (
      await db.getRepository(UserEntity).save(
        UserEntity.fromGoogleIdentity({
          email: randomUUID() + '@example.test',
          googleSubject: randomUUID(),
        }),
      )
    ).id;
    const balance = {
      money: { amount: '0', currency: 'USD' },
      sign: 'positive',
    };
    const accountId = (
      await db.getRepository(AccountEntity).save(
        AccountEntity.fromDto(
          {
            name: 'Fixture',
            type: 'depository',
            currentBalance: balance,
            availableBalance: balance,
          } as any,
          userId,
        ),
      )
    ).id;
    const category = new CategoryEntity();
    category.userId = userId;
    category.setLabels('Food', 'Groceries');
    category.description = '';
    category.color = '#228be6';
    category.archivedAt = null;
    categoryId = (await db.getRepository(CategoryEntity).save(category)).id;
    ids = (
      await db.query<{ id: string }[]>(
        `WITH activities AS (
        INSERT INTO account_activity_entity ("userId","accountId",provider,"externalActivityId","activityKind","activityDate","providerDate","amountAmount","amountCurrency","amountSign")
        SELECT $1,$2,'manual',gen_random_uuid()::text,'banking_transaction','2026-09-01','2026-09-01',100,'USD','negative' FROM generate_series(1,500) RETURNING id)
        INSERT INTO banking_transaction_entity ("activityId",source,"merchantName",pending)
        SELECT id,'manual','Fixture',false FROM activities RETURNING id`,
        [userId, accountId],
      )
    ).map((row) => row.id);
    service = new McpTransactionCategoriesService(
      db.getRepository(TransactionEntity),
    );
  }, 120000);
  afterAll(async () => harness?.close());
  beforeEach(async () => {
    await harness.database
      .getRepository(TransactionEntity)
      .createQueryBuilder()
      .update()
      .set({
        categoryId: null,
        categoryAssignmentSource: null,
        categoryAssignmentRuleId: null,
      })
      .execute();
    harness.queries.length = 0;
  });

  it('updates 500 manually entered transactions with one bulk write and retries without writes', async () => {
    const result = await service.setCategories(userId, [
      { transactionIds: ids, categoryId },
    ]);
    expect(result).toMatchObject({
      requested: 500,
      updated: 500,
      unchanged: 0,
    });
    expect(
      harness.queries.filter(
        (sql) =>
          sql.startsWith('UPDATE ') &&
          sql.includes('"banking_transaction_entity"'),
      ),
    ).toHaveLength(1);
    const rows = await harness.database.getRepository(TransactionEntity).find();
    expect(
      rows.every(
        (row) =>
          row.categoryId === categoryId &&
          row.categoryAssignmentSource === 'manual',
      ),
    ).toBe(true);
    harness.queries.length = 0;
    expect(
      await service.setCategories(userId, [
        { transactionIds: ids, categoryId },
      ]),
    ).toMatchObject({ updated: 0, unchanged: 500 });
    expect(harness.queries.some((sql) => sql.startsWith('UPDATE '))).toBe(
      false,
    );
  });

  it('rejects a mixed valid/missing batch without changing the valid row', async () => {
    await expect(
      service.setCategories(userId, [
        { transactionIds: [ids[0], randomUUID()], categoryId },
      ]),
    ).rejects.toThrow('transactions are unavailable');
    expect(
      (
        await harness.database
          .getRepository(TransactionEntity)
          .findOneByOrFail({ id: ids[0] })
      ).categoryId,
    ).toBeNull();
    expect(harness.queries.some((sql) => sql.startsWith('UPDATE '))).toBe(
      false,
    );
  });

  it('rejects another user and archived categories', async () => {
    await expect(
      service.setCategories(randomUUID(), [
        { transactionIds: [ids[0]], categoryId: null },
      ]),
    ).rejects.toThrow('transactions are unavailable');
    await expect(
      service.setCategories(randomUUID(), [
        { transactionIds: [ids[0]], categoryId },
      ]),
    ).rejects.toThrow('categories are unavailable');
    await harness.database
      .getRepository(CategoryEntity)
      .update(categoryId, { archivedAt: new Date() });
    try {
      await expect(
        service.setCategories(userId, [
          { transactionIds: [ids[0]], categoryId },
        ]),
      ).rejects.toThrow('categories are unavailable');
    } finally {
      await harness.database
        .getRepository(CategoryEntity)
        .update(categoryId, { archivedAt: null });
    }
  });

  it('rolls back earlier category groups if a later write fails', async () => {
    const db = harness.database;
    await db.query(`CREATE FUNCTION reject_fixture_category() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id = '${ids[1]}'::uuid THEN RAISE EXCEPTION 'fixture write failure'; END IF; RETURN NEW; END $$`);
    await db.query(
      'CREATE TRIGGER reject_fixture_category BEFORE UPDATE ON banking_transaction_entity FOR EACH ROW EXECUTE FUNCTION reject_fixture_category()',
    );
    try {
      await expect(
        service.setCategories(userId, [
          { transactionIds: [ids[0]], categoryId },
          { transactionIds: [ids[1]], categoryId: null },
        ]),
      ).rejects.toThrow('fixture write failure');
      expect(
        (
          await db
            .getRepository(TransactionEntity)
            .findOneByOrFail({ id: ids[0] })
        ).categoryId,
      ).toBeNull();
    } finally {
      await db.query(
        'DROP TRIGGER reject_fixture_category ON banking_transaction_entity',
      );
      await db.query('DROP FUNCTION reject_fixture_category()');
    }
  });

  it('serializes overlapping updates and preserves manual Uncategorized', async () => {
    const results = await Promise.all([
      service.setCategories(userId, [{ transactionIds: [ids[0]], categoryId }]),
      service.setCategories(userId, [{ transactionIds: [ids[0]], categoryId }]),
    ]);
    expect(results.map((result) => result.updated).sort()).toEqual([0, 1]);
    await service.setCategories(userId, [
      { transactionIds: [ids[0]], categoryId: null },
    ]);
    expect(
      await harness.database
        .getRepository(TransactionEntity)
        .findOneByOrFail({ id: ids[0] }),
    ).toMatchObject({
      categoryId: null,
      categoryAssignmentSource: 'manual',
      categoryAssignmentRuleId: null,
      categoryUpdatedAt: null,
    });
  });
});
