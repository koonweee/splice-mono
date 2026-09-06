import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BalanceQueryService } from '../../src/balance-query/balance-query.service';
import { DashboardQueryService } from '../../src/balance-query/dashboard-query.service';
import { CurrencyExchangeService } from '../../src/currency-exchange/currency-exchange.service';
import { ExchangeRateEntity } from '../../src/currency-exchange/exchange-rate.entity';
import type { FiatExchangeRateProvider } from '../../src/currency-exchange/providers/fiat-exchange-rate.provider';
import type { CryptoExchangeRateProvider } from '../../src/currency-exchange/providers/crypto-exchange-rate.provider';
import { UserEntity } from '../../src/user/user.entity';
import { UserService } from '../../src/user/user.service';
import {
  createDashboardFixture,
  DASHBOARD_FIXTURE_USER_ID,
  fixtureAccount,
  fixtureSnapshot,
} from './fixtures/dashboard.fixture';

postgresSuite('Dashboard PostgreSQL projections', () => {
  let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
  let database: DataSource;
  const fixture = createDashboardFixture(20);
  let dashboard: DashboardQueryService;
  let legacy: BalanceQueryService;
  let queries: string[] = [];
  const userId = DASHBOARD_FIXTURE_USER_ID;

  beforeAll(async () => {
    harness = await isolatedPostgres('dashboard_test');
    database = harness.database;
    queries = harness.queries;
    const users = database.getRepository(UserEntity);
    await users.save(
      Object.assign(
        UserEntity.fromGoogleIdentity({
          email: 'synthetic@example.test',
          googleSubject: 'synthetic-fixture',
        }),
        { id: userId },
      ),
    );
    const otherId = randomUUID();
    await users.save(
      Object.assign(
        UserEntity.fromGoogleIdentity({
          email: 'other@example.test',
          googleSubject: 'other-fixture',
        }),
        { id: otherId },
      ),
    );
    await database.getRepository(AccountEntity).save(fixture.accounts);
    for (const snapshot of fixture.snapshots) snapshot.id = randomUUID();
    const outsideSync = fixtureSnapshot(
      fixture.accounts[0].id,
      '2026-10-01',
      12300,
    );
    outsideSync.id = randomUUID();
    await database
      .getRepository(BalanceSnapshotEntity)
      .save([...fixture.snapshots, outsideSync], { chunk: 500 });
    // An unrelated user's rows must never enter any balance or timestamp read.
    const foreignAccount = fixtureAccount(99);
    foreignAccount.userId = otherId;
    await database.getRepository(AccountEntity).save(foreignAccount);
    const foreignSnapshot = fixtureSnapshot(
      foreignAccount.id,
      '2026-09-05',
      99999999,
    );
    foreignSnapshot.id = randomUUID();
    foreignSnapshot.userId = otherId;
    await database.getRepository(BalanceSnapshotEntity).save(foreignSnapshot);
    const rateRepository = database.getRepository(ExchangeRateEntity);
    await rateRepository.save([
      ExchangeRateEntity.fromDto({
        baseCurrency: 'JPY',
        targetCurrency: 'USD',
        rate: '0.007',
        rateDate: '2016-01-01',
      }),
      ExchangeRateEntity.fromDto({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: '1.1',
        rateDate: '2016-01-01',
      }),
    ]);
    const exchange = new CurrencyExchangeService(
      database.getRepository(ExchangeRateEntity),
      {} as FiatExchangeRateProvider,
      {} as CryptoExchangeRateProvider,
    );
    legacy = new BalanceQueryService(
      database.getRepository(AccountEntity),
      database.getRepository(BalanceSnapshotEntity),
      exchange,
      {
        findSettings: (id: string, manager?: EntityManager) =>
          (manager?.withRepository(users) ?? users).findOne({
            where: { id },
            select: { id: true, settings: true },
          }),
      } as unknown as UserService,
    );
    dashboard = new DashboardQueryService(legacy);
  }, 120000);
  afterAll(async () => {
    await harness?.close();
  });

  it('uses ordered boundary rows, fills sparse histories, preserves outside-range sync and bounds SQL count', async () => {
    queries.length = 0;
    const query = { period: 'tenYears' as const, endDate: '2026-09-05' };
    const summary = await dashboard.getSummary(userId, query);
    expect(queries.filter((sql) => /^SELECT|^\s*WITH/i.test(sql))).toHaveLength(
      7,
    );
    expect(summary.assets.length + summary.liabilities.length).toBe(20);
    expect(
      summary.assets.find((account) => account.id === fixture.accounts[0].id)
        ?.syncedAt,
    ).toBe('2026-10-01T12:00:00.000Z');
    queries.length = 0;
    const series = await dashboard.getSeries(userId, query);
    expect(queries.filter((sql) => /^SELECT|^\s*WITH/i.test(sql))).toHaveLength(
      5,
    );
    expect(series.points).toHaveLength(121);
    expect(series.points.at(-1)?.netWorth).toEqual(summary.netWorth);
    const expected = await fixture.dashboard.getSummary(userId, query);
    expect(summary.netWorth).toEqual(expected.netWorth);
    expect(summary.changeAmount).toEqual(expected.changeAmount);
    queries.length = 0;
    await dashboard.getSummary(userId, { ...query, period: 'day' });
    expect(queries.filter((sql) => /^SELECT|^\s*WITH/i.test(sql))).toHaveLength(
      7,
    );
  });

  it('keeps the existing history path equivalent on actual PostgreSQL rows', async () => {
    const old = await legacy.getAllBalancesForDateRange(
      '2026-08-06',
      '2026-09-05',
      userId,
    );
    const series = await dashboard.getSeries(userId, {
      period: 'month',
      endDate: '2026-09-05',
    });
    expect(old).toHaveLength(31);
    expect(
      BigInt(
        old[0].balances[fixture.accounts[0].id].currentBalance.balance.money
          .amount,
      ),
    ).toBeGreaterThan(0n);
    expect(series.points).toHaveLength(old.length);
    for (let index = 0; index < old.length; index++) {
      const expected = Object.values(old[index].balances).reduce(
        (total, result) => {
          const money =
            result.effectiveBalance.convertedBalance ??
            result.effectiveBalance.balance;
          return (
            total +
            (result.account.type === 'credit' || money.sign === 'negative'
              ? -1n
              : 1n) *
              BigInt(money.money.amount)
          );
        },
        0n,
      );
      const actual = series.points[index].netWorth;
      expect(
        (actual.sign === 'negative' ? -1n : 1n) * BigInt(actual.money.amount),
      ).toBe(expected);
    }
  });
});
