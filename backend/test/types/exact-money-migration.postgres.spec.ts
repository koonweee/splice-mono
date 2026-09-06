import { randomUUID } from 'node:crypto';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';
import { ExactMoney1788642000000 } from '../../src/migrations/1788642000000-ExactMoney';
import { CategoryEntity } from '../../src/category/category.entity';
import { UserEntity } from '../../src/user/user.entity';
import { AccountEntity } from '../../src/account/account.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';

postgresSuite('Exact money migration on stored PostgreSQL values', () => {
  let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
  let userId: string;
  let accountId: string;
  let categoryId: string;
  const migration = new ExactMoney1788642000000();
  async function migrate(direction: 'up' | 'down') {
    const runner = harness.database.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await migration[direction](runner);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
  beforeEach(async () => {
    harness = await isolatedPostgres('exact_migration', 1788642000000);
    const db = harness.database;
    userId = (
      await db.getRepository(UserEntity).save(
        UserEntity.fromGoogleIdentity({
          email: `${randomUUID()}@example.test`,
          googleSubject: randomUUID(),
        }),
      )
    ).id;
    const balance = {
      money: { amount: '1234', currency: 'USD' },
      sign: MoneySign.POSITIVE,
    };
    const category = db.getRepository(CategoryEntity).create({
      userId,
      description: 'Fixture',
      color: '#000000',
      archivedAt: null,
    });
    category.setLabels('Fixture', 'Fixture');
    categoryId = (await db.getRepository(CategoryEntity).save(category)).id;
    accountId = (
      await db.getRepository(AccountEntity).save(
        AccountEntity.fromDto(
          {
            name: 'Fixture',
            type: 'depository',
            availableBalance: balance,
            currentBalance: balance,
          } as any,
          userId,
        ),
      )
    ).id;
  }, 120000);
  afterEach(async () => harness?.close());

  it('converts database JSON before JS parsing without changing unrelated values', async () => {
    await harness.database.query(
      `UPDATE account_entity SET "rawApiAccount" = '{"balance":{"money":{"amount":9007199254740993,"currency":"USD"},"sign":"positive"},"providerAmount":1.125,"id":"unchanged"}'::jsonb WHERE id=$1`,
      [accountId],
    );
    await harness.database.query(
      `INSERT INTO categorization_rule_entity ("userId",name,priority,"targetCategoryId",conditions) VALUES ($1,'Fixture',10,$2,'[{"field":"amount","operator":"between","value":{"min":1.000000000000000001,"max":9007199254740993}},{"field":"merchantName","operator":"contains","value":"Store"}]'::jsonb)`,
      [userId, categoryId],
    );
    await migrate('up');
    const [account] = await harness.database.query(
      'SELECT "rawApiAccount","currentBalanceAmount"::text AS amount FROM account_entity WHERE id=$1',
      [accountId],
    );
    expect(account.rawApiAccount).toEqual({
      balance: {
        money: { amount: '9007199254740993', currency: 'USD' },
        sign: 'positive',
      },
      providerAmount: 1.125,
      id: 'unchanged',
    });
    expect(account.amount).toBe('1234');
    const [rule] = await harness.database.query(
      'SELECT conditions FROM categorization_rule_entity',
    );
    expect(rule.conditions[0].value).toEqual({
      min: '1.000000000000000001',
      max: '9007199254740993',
    });
    expect(rule.conditions[1].value).toBe('Store');
    await expect(migrate('down')).rejects.toThrow('Cannot revert');
    expect(
      (
        await harness.database.query(
          'SELECT "rawApiAccount" FROM account_entity WHERE id=$1',
          [accountId],
        )
      )[0].rawApiAccount.balance.money.amount,
    ).toBe('9007199254740993');
  });

  it('accepts 78 digits and refuses an unsafe narrowing without partial schema changes', async () => {
    await migrate('up');
    const amount = '9'.repeat(78);
    await harness.database.query(
      'UPDATE account_entity SET "currentBalanceAmount"=$1 WHERE id=$2',
      [amount, accountId],
    );
    expect(
      (
        await harness.database
          .getRepository(AccountEntity)
          .findOneByOrFail({ id: accountId })
      ).currentBalance.amount,
    ).toBe(amount);
    await expect(migrate('down')).rejects.toThrow('old bigint range');
    const [column] = await harness.database.query(
      `SELECT numeric_precision FROM information_schema.columns WHERE table_schema=$1 AND table_name='account_entity' AND column_name='availableBalanceAmount'`,
      [harness.schema],
    );
    expect(column.numeric_precision).toBe(78);
    await expect(
      harness.database.query(
        'UPDATE account_entity SET "availableBalanceAmount"=-1 WHERE id=$1',
        [accountId],
      ),
    ).rejects.toThrow('check constraint');
    await expect(
      harness.database.query(
        'UPDATE account_entity SET "availableBalanceAmount"=$1 WHERE id=$2',
        ['1' + '0'.repeat(78), accountId],
      ),
    ).rejects.toThrow('overflow');
  });

  it('migrates stored recommendation previews and reconciliation archives without parsing old numbers', async () => {
    const [generation] = await harness.database.query(
      `INSERT INTO categorization_rule_suggestion_generation_entity ("userId",status,model) VALUES ($1,'completed','fixture') RETURNING id`,
      [userId],
    );
    await harness.database.query(
      `INSERT INTO categorization_rule_suggestion_entity
        ("userId","generationId",name,"targetCategoryId",priority,conditions,rationale,status,matched,updated,"skippedManual","manualAgreement","manualConflicts","existingRuleOverlap","previewTransactions","generatedBy",model)
        VALUES ($1,$2,'Fixture',$3,10,'[{"field":"amount","operator":"equals","value":1.000000000000000001}]'::jsonb,'Fixture','pending',1,0,0,0,0,0,
          '[{"amount":{"money":{"amount":9007199254740993,"currency":"ETH"},"sign":"negative"},"account":{"currentBalance":{"money":{"amount":1234,"currency":"USD"},"sign":"positive"}},"pending":false}]'::jsonb,'fixture','fixture')`,
      [userId, generation.id, categoryId],
    );
    await harness.database.query(
      `INSERT INTO transaction_reconciliation_archive_entity ("userId","accountId","externalTransactionId",snapshot,evidence,"expiresAt")
        VALUES ($1,$2,'fixture','{"schemaVersion":1,"activity":{"amountAmount":9007199254740993,"amountCurrency":"ETH","amountSign":"negative"},"transaction":{"merchantName":"Fixture"}}'::jsonb,'{}'::jsonb,now()+interval '1 day')`,
      [userId, accountId],
    );
    await migrate('up');
    const [suggestion] = await harness.database.query(
      'SELECT conditions,"previewTransactions" FROM categorization_rule_suggestion_entity',
    );
    expect(suggestion.conditions[0].value).toBe('1.000000000000000001');
    expect(suggestion.previewTransactions[0]).toEqual({
      amount: {
        money: { amount: '9007199254740993', currency: 'ETH' },
        sign: 'negative',
      },
      account: {
        currentBalance: {
          money: { amount: '1234', currency: 'USD' },
          sign: 'positive',
        },
      },
      pending: false,
    });
    const [archive] = await harness.database.query(
      'SELECT snapshot FROM transaction_reconciliation_archive_entity',
    );
    expect(archive.snapshot).toEqual({
      schemaVersion: 2,
      activity: {
        amountAmount: '9007199254740993',
        amountCurrency: 'ETH',
        amountSign: 'negative',
      },
      transaction: { merchantName: 'Fixture' },
    });
    // Remove the independently unsafe preview/threshold to exercise the archive guard.
    await harness.database.query(
      'DELETE FROM categorization_rule_suggestion_entity',
    );
    await expect(migrate('down')).rejects.toThrow('reconciliation archives');
    expect(
      (
        await harness.database.query(
          'SELECT snapshot FROM transaction_reconciliation_archive_entity',
        )
      )[0].snapshot,
    ).toEqual(archive.snapshot);
  });

  it('round trips old representable columns and normalized JSON atomically', async () => {
    await harness.database.query(
      `UPDATE account_entity SET "rawApiAccount" = '{"balance":{"money":{"amount":1234,"currency":"USD"},"sign":"positive"}}'::jsonb WHERE id=$1`,
      [accountId],
    );
    await migrate('up');
    await migrate('down');
    const [account] = await harness.database.query(
      'SELECT "rawApiAccount","currentBalanceAmount"::text AS amount FROM account_entity WHERE id=$1',
      [accountId],
    );
    expect(account.amount).toBe('1234');
    expect(account.rawApiAccount.balance.money.amount).toBe(1234);
    await migrate('up');
    expect(
      (
        await harness.database.query(
          'SELECT "rawApiAccount" FROM account_entity WHERE id=$1',
          [accountId],
        )
      )[0].rawApiAccount.balance.money.amount,
    ).toBe('1234');
  });
});
