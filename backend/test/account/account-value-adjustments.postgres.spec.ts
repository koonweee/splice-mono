import { AccountEntity } from '../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BalanceQueryService } from '../../src/balance-query/balance-query.service';
import { DashboardQueryService } from '../../src/balance-query/dashboard-query.service';
import { CurrencyExchangeService } from '../../src/currency-exchange/currency-exchange.service';
import { ExchangeRateEntity } from '../../src/currency-exchange/exchange-rate.entity';
import { UserEntity } from '../../src/user/user.entity';
import { UserService } from '../../src/user/user.service';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';

postgresSuite('Account value adjustments PostgreSQL', () => {
  let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
  let userId: string;
  let accountId: string;
  let balances: BalanceQueryService;
  beforeAll(async () => {
    harness = await isolatedPostgres('account_value', 1794074400000);
    const db = harness.database;
    const user = await db.getRepository(UserEntity).save(
      UserEntity.fromGoogleIdentity({
        email: 'valuation@example.invalid',
        googleSubject: 'valuation-test',
      }),
    );
    userId = user.id;
    const [row] = await db.query(
      `INSERT INTO account_entity
      ("userId",name,type,"currentBalanceAmount","currentBalanceCurrency","currentBalanceSign",
       "availableBalanceAmount","availableBalanceCurrency","availableBalanceSign")
      VALUES ($1,'RSUs','investment',10000000,'USD','positive',0,'USD','positive') RETURNING id`,
      [userId],
    );
    accountId = row.id;
    await db.getRepository(BalanceSnapshotEntity).save(
      BalanceSnapshotEntity.fromDto(
        {
          accountId,
          snapshotDate: '2026-09-01',
          snapshotType: BalanceSnapshotType.SYNC,
          currentBalance: {
            money: { amount: '10000000', currency: 'USD' },
            sign: MoneySign.POSITIVE,
          },
          availableBalance: {
            money: { amount: '0', currency: 'USD' },
            sign: MoneySign.POSITIVE,
          },
        },
        userId,
      ),
    );
    await db.runMigrations({ transaction: 'all' });
    const exchange = new CurrencyExchangeService(
      db.getRepository(ExchangeRateEntity),
      {} as never,
      {} as never,
    );
    const users = {
      findSettings: async (id: string) =>
        db.getRepository(UserEntity).findOneBy({ id }),
    };
    balances = new BalanceQueryService(
      db.getRepository(AccountEntity),
      db.getRepository(BalanceSnapshotEntity),
      exchange,
      users as unknown as UserService,
    );
  }, 120000);
  afterAll(async () => harness?.close());
  it('backfills old accounts without changing their base balances', async () => {
    const account = await harness.database
      .getRepository(AccountEntity)
      .findOneByOrFail({ id: accountId });
    expect(account.expectedValuePercent).toBe('100');
    expect(account.expectedTaxPercent).toBe('0');
    expect(account.toObject().effectiveBalance?.money.amount).toBe('10000000');
  });
  it('revalues history and dashboard using current settings while leaving snapshots untouched', async () => {
    const db = harness.database;
    await db.getRepository(AccountEntity).update(accountId, {
      expectedValuePercent: '50',
      expectedTaxPercent: '30',
    });
    const history = await balances.getBalancesForDateRange(
      [accountId],
      '2026-09-01',
      '2026-09-02',
      userId,
    );
    expect(
      history.map(
        (day) => day.balances[accountId].effectiveBalance.balance.money.amount,
      ),
    ).toEqual(['3500000', '3500000']);
    const summary = await new DashboardQueryService(balances).getSummary(
      userId,
      { period: 'month', endDate: '2026-09-02' },
    );
    expect(summary.netWorth.money.amount).toBe('3500000');
    expect(summary.assets[0].expectedValuePercent).toBe('50');
    const snapshots = await db
      .getRepository(BalanceSnapshotEntity)
      .findBy({ accountId });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].currentBalance.amount).toBe('10000000');
    await db
      .getRepository(AccountEntity)
      .update(accountId, { expectedValuePercent: '80' });
    expect(
      (
        await balances.getBalancesForDateRange(
          [accountId],
          '2026-09-01',
          '2026-09-01',
          userId,
        )
      )[0].balances[accountId].effectiveBalance.balance.money.amount,
    ).toBe('5600000');
  });
  it('filters discounted accounts before all Home valuation reads and keeps 100/above100/tax-only accounts', async () => {
    const db = harness.database;
    const repo = db.getRepository(AccountEntity);
    const snapshots = db.getRepository(BalanceSnapshotEntity);
    await repo.update(accountId, {
      expectedValuePercent: '50',
      expectedTaxPercent: '30',
    });
    const dashboard = new DashboardQueryService(balances);
    const empty = await dashboard.getSummary(userId, {
      period: 'all',
      endDate: '2026-09-01',
      hideDiscountedAccounts: true,
    });
    expect(empty.assets).toEqual([]);
    expect(empty.netWorth.money.amount).toBe('0');
    expect(empty.startDate).toBe('2026-09-01');
    const original = (await repo.findOneByOrFail({ id: accountId })).toObject();
    const added: string[] = [];
    const saveSnapshot = (id: string, date: string, amount: string) =>
      snapshots.save(
        BalanceSnapshotEntity.fromDto(
          {
            accountId: id,
            snapshotDate: date,
            snapshotType: BalanceSnapshotType.SYNC,
            currentBalance: {
              money: { amount, currency: 'USD' },
              sign: MoneySign.POSITIVE,
            },
            availableBalance: {
              money: { amount: '0', currency: 'USD' },
              sign: MoneySign.POSITIVE,
            },
          },
          userId,
        ),
      );
    try {
      await saveSnapshot(accountId, '2026-08-31', '8000000');
      for (const [value, tax, prior] of [
        ['100', '30', '9000000'],
        ['150', '0', '8000000'],
      ]) {
        const account = await repo.save(
          AccountEntity.fromDto(
            {
              ...original,
              expectedValuePercent: value,
              expectedTaxPercent: tax,
            },
            userId,
          ),
        );
        added.push(account.id);
        await saveSnapshot(account.id, '2026-08-31', prior);
        await saveSnapshot(account.id, '2026-09-01', '10000000');
      }
      const query = {
        period: 'day' as const,
        endDate: '2026-09-01',
        hideDiscountedAccounts: true,
      };
      const filtered = await dashboard.getSummary(userId, query);
      expect(filtered.assets.map((a) => a.expectedValuePercent).sort()).toEqual(
        ['100', '150'],
      );
      expect(filtered.netWorth.money.amount).toBe('22000000');
      expect(filtered.changeAmount.money.amount).toBe('3700000');
      const series = await dashboard.getSeries(userId, query);
      expect(series.points.map((p) => p.netWorth.money.amount)).toEqual([
        '18300000',
        '22000000',
      ]);
      const included = await dashboard.getSummary(userId, {
        ...query,
        hideDiscountedAccounts: false,
      });
      expect(included.netWorth.money.amount).toBe('25500000');
      expect(included.changeAmount.money.amount).toBe('4400000');
      expect(
        (
          await dashboard.getSeries(userId, {
            ...query,
            hideDiscountedAccounts: false,
          })
        ).points.map((p) => p.netWorth.money.amount),
      ).toEqual(['21100000', '25500000']);
    } finally {
      for (const id of added) {
        await snapshots.delete({ accountId: id });
        await repo.delete(id);
      }
      await snapshots.delete({ accountId, snapshotDate: '2026-08-31' });
    }
  });

  it('does not require FX for an excluded account', async () => {
    const db = harness.database;
    await db.getRepository(AccountEntity).update(accountId, {
      expectedValuePercent: '50',
      expectedTaxPercent: '30',
    });
    await db.query(
      'UPDATE balance_snapshot_entity SET "currentBalanceCurrency"=$1 WHERE "accountId"=$2',
      ['EUR', accountId],
    );
    try {
      const dashboard = new DashboardQueryService(balances);
      await expect(
        dashboard.getSummary(userId, {
          period: 'day',
          endDate: '2026-09-01',
          hideDiscountedAccounts: true,
        }),
      ).resolves.toMatchObject({ assets: [] });
      await expect(
        dashboard.getSummary(userId, { period: 'day', endDate: '2026-09-01' }),
      ).rejects.toThrow();
    } finally {
      await db.query(
        'UPDATE balance_snapshot_entity SET "currentBalanceCurrency"=$1 WHERE "accountId"=$2',
        ['USD', accountId],
      );
    }
  });

  it.each(['0', '-1', 'NaN', 'Infinity'])(
    'rejects invalid value %s in the database',
    async (value) => {
      await expect(
        harness.database.query(
          'UPDATE account_entity SET "expectedValuePercent"=$1 WHERE id=$2',
          [value, accountId],
        ),
      ).rejects.toThrow();
    },
  );
  it.each(['-1', '101', 'NaN', 'Infinity'])(
    'rejects invalid tax %s in the database',
    async (tax) => {
      await expect(
        harness.database.query(
          'UPDATE account_entity SET "expectedTaxPercent"=$1 WHERE id=$2',
          [tax, accountId],
        ),
      ).rejects.toThrow();
    },
  );
  it('allows values above 100 and a fully taxed value of zero', async () => {
    const repository = harness.database.getRepository(AccountEntity);
    await repository.update(accountId, {
      expectedValuePercent: '150',
      expectedTaxPercent: '100',
    });
    const entity = await repository.findOneByOrFail({ id: accountId });
    expect(entity.toObject().effectiveBalance?.money.amount).toBe('0');
  });
});
