import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
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

// Explicit opt-in: use a disposable local DB. Each run owns a unique schema;
// never synchronize, truncate, or drop an existing application's schema.
const databaseUrl = process.env.DASHBOARD_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite('Dashboard PostgreSQL projections', () => {
  let database: DataSource;
  const schema = `dashboard_test_${randomUUID().replaceAll('-', '')}`;
  const fixture = createDashboardFixture(20);
  let dashboard: DashboardQueryService;
  let legacy: BalanceQueryService;
  let queries: string[] = [];
  const userId = DASHBOARD_FIXTURE_USER_ID;

  beforeAll(async () => {
    const url = new URL(databaseUrl!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/splice_dashboard_test'
    )
      throw new Error(
        'Dashboard SQL tests require a dedicated local splice_dashboard_test database',
      );
    database = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      entities: [
        UserEntity,
        BankLinkEntity,
        AccountEntity,
        BalanceSnapshotEntity,
        ExchangeRateEntity,
      ],
      synchronize: false,
      logging: ['query'],
      logger: {
        logQuery: (query) => {
          queries.push(query);
        },
        logQueryError: () => {},
        logQuerySlow: () => {},
        logSchemaBuild: () => {},
        logMigration: () => {},
        log: () => {},
      },
    });
    await database.initialize();
    await database.query(`CREATE SCHEMA "${schema}"`);
    await database.synchronize();
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
        rate: 0.007,
        rateDate: '2016-01-01',
      }),
      ExchangeRateEntity.fromDto({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.1,
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
        findOne: (id: string) => users.findOneBy({ id }),
      } as unknown as UserService,
    );
    dashboard = new DashboardQueryService(legacy);
  }, 30000);
  afterAll(async () => {
    if (database?.isInitialized) {
      await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await database.destroy();
    }
  });

  it('uses ordered boundary rows, fills sparse histories, preserves outside-range sync and bounds SQL count', async () => {
    queries = [];
    const query = { period: 'tenYears' as const, endDate: '2026-09-05' };
    const summary = await dashboard.getSummary(userId, query);
    expect(queries.filter((sql) => sql.startsWith('SELECT'))).toHaveLength(11);
    expect(summary.assets.length + summary.liabilities.length).toBe(20);
    expect(
      summary.assets.find((account) => account.id === fixture.accounts[0].id)
        ?.syncedAt,
    ).toBe('2026-10-01T12:00:00.000Z');
    queries = [];
    const series = await dashboard.getSeries(userId, query);
    expect(queries.filter((sql) => sql.startsWith('SELECT'))).toHaveLength(7);
    expect(series.points).toHaveLength(121);
    expect(series.points.at(-1)?.netWorth).toEqual(summary.netWorth);
    const expected = await fixture.dashboard.getSummary(userId, query);
    expect(summary.netWorth).toEqual(expected.netWorth);
    expect(summary.changeAmount).toEqual(expected.changeAmount);
    queries = [];
    await dashboard.getSummary(userId, { ...query, period: 'day' });
    expect(queries.filter((sql) => sql.startsWith('SELECT'))).toHaveLength(11);
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
      old[0].balances[fixture.accounts[0].id].currentBalance.balance.money
        .amount,
    ).toBeGreaterThan(0);
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
              ? -1
              : 1) *
              money.money.amount
          );
        },
        0,
      );
      const actual = series.points[index].netWorth;
      expect((actual.sign === 'negative' ? -1 : 1) * actual.money.amount).toBe(
        expected,
      );
    }
  });
});
