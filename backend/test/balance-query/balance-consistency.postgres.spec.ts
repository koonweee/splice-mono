import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager } from 'typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BalanceQueryService } from '../../src/balance-query/balance-query.service';
import { CurrencyExchangeService } from '../../src/currency-exchange/currency-exchange.service';
import { ExchangeRateEntity } from '../../src/currency-exchange/exchange-rate.entity';
import type { FiatExchangeRateProvider } from '../../src/currency-exchange/providers/fiat-exchange-rate.provider';
import type { CryptoExchangeRateProvider } from '../../src/currency-exchange/providers/crypto-exchange-rate.provider';
import { UserEntity } from '../../src/user/user.entity';
import { UserService } from '../../src/user/user.service';
import { fixtureAccount, fixtureSnapshot } from './fixtures/dashboard.fixture';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';

postgresSuite('Balance projection read consistency', () => {
  let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
  let database: DataSource;
  beforeAll(async () => {
    harness = await isolatedPostgres('balance_consistency');
    database = harness.database;
  }, 120000);
  afterAll(async () => harness?.close());

  it.each([false, true])(
    'uses one committed financial and FX version (boundaryOnly=%s) and releases before daily projection',
    async (boundaryOnly) => {
      const userId = randomUUID();
      const users = database.getRepository(UserEntity);
      const user = Object.assign(
        UserEntity.fromGoogleIdentity({
          email: `${userId}@example.test`,
          googleSubject: userId,
        }),
        { id: userId },
      );
      user.settings = { ...user.settings, currency: 'USD' };
      await users.save(user);
      const account = fixtureAccount(0);
      account.id = randomUUID();
      account.userId = userId;
      account.name = 'Before';
      await database.getRepository(AccountEntity).save(account);
      const dates = ['2026-09-01', '2026-09-02'];
      const snapshots = dates.map((date, index) =>
        Object.assign(
          fixtureSnapshot(account.id, date, (index + 1) * 100, 'EUR'),
          { id: randomUUID(), userId },
        ),
      );
      await database.getRepository(BalanceSnapshotEntity).save(snapshots);
      const rates = database.getRepository(ExchangeRateEntity);
      await rates.upsert(
        dates.flatMap((rateDate, index) =>
          ['USD', 'SGD'].map((targetCurrency) => ({
            baseCurrency: 'EUR',
            targetCurrency,
            rateDate,
            rate:
              targetCurrency === 'USD'
                ? ['1.1', '1.2'][index]
                : ['1.5', '1.6'][index],
          })),
        ),
        ['baseCurrency', 'targetCurrency', 'rateDate'],
      );
      const exchange = new CurrencyExchangeService(
        rates,
        {} as FiatExchangeRateProvider,
        {} as CryptoExchangeRateProvider,
      );
      const service = new BalanceQueryService(
        database.getRepository(AccountEntity),
        database.getRepository(BalanceSnapshotEntity),
        exchange,
        {
          findSettings: (id: string, manager: EntityManager) =>
            manager
              .withRepository(users)
              .findOne({ where: { id }, select: { id: true, settings: true } }),
        } as UserService,
      );
      let reached!: () => void;
      const atFx = new Promise<void>((resolve) => {
        reached = resolve;
      });
      let resume!: () => void;
      const afterWrite = new Promise<void>((resolve) => {
        resume = resolve;
      });
      const observedManagers = new Set<EntityManager>();
      const original = exchange.getRatesForDateRange.bind(exchange);
      const spy = jest
        .spyOn(exchange, 'getRatesForDateRange')
        .mockImplementation(async (pairs, start, end, manager) => {
          expect(manager?.queryRunner?.isTransactionActive).toBe(true);
          observedManagers.add(manager!);
          reached();
          await afterWrite;
          return original(pairs, start, end, manager);
        });
      const loading = service.loadBalanceProjection(
        userId,
        dates[0],
        dates[1],
        { accountIds: [account.id], boundaryOnly, includeLatestSync: true },
      );
      await atFx;
      try {
        await database.transaction(async (manager) => {
          await manager.getRepository(UserEntity).update(userId, {
            settings: { ...user.settings, currency: 'SGD' },
          });
          await manager
            .getRepository(AccountEntity)
            .update(account.id, { name: 'After' });
          for (const [index, snapshot] of snapshots.entries())
            await manager
              .getRepository(BalanceSnapshotEntity)
              .update(snapshot.id, {
                currentBalance: { amount: String((index + 3) * 100) },
                availableBalance: { amount: String((index + 3) * 100) },
              });
          await manager.getRepository(ExchangeRateEntity).upsert(
            dates.flatMap((rateDate, index) =>
              ['USD', 'SGD'].map((targetCurrency) => ({
                baseCurrency: 'EUR',
                targetCurrency,
                rateDate,
                rate: String(index + 3),
              })),
            ),
            ['baseCurrency', 'targetCurrency', 'rateDate'],
          );
        });
      } finally {
        resume();
      }
      const projection = await loading;
      expect(observedManagers.size).toBe(1);
      for (const manager of observedManagers)
        expect(manager.queryRunner?.isReleased).toBe(true);
      expect(projection.reportingCurrency).toBe('USD');
      const old = [...projection.balances];
      expect(
        old.map(
          (day) =>
            day.balances[account.id].currentBalance.convertedBalance?.money
              .amount,
        ),
      ).toEqual(['110', '240']);
      expect(old.map((day) => day.balances[account.id].account.name)).toEqual([
        'Before',
        'Before',
      ]);
      expect(
        old.map(
          (day) =>
            day.balances[account.id].currentBalance.exchangeRate?.requestedDate,
        ),
      ).toEqual(dates);
      spy.mockRestore();
      const next = await service.loadBalanceProjection(
        userId,
        dates[0],
        dates[1],
        { accountIds: [account.id], boundaryOnly, includeLatestSync: true },
      );
      expect(next.reportingCurrency).toBe('SGD');
      expect(
        [...next.balances].map(
          (day) =>
            day.balances[account.id].currentBalance.convertedBalance?.money
              .amount,
        ),
      ).toEqual(['900', '1600']);
      expect(
        harness.queries.some((query) => query.includes('REPEATABLE READ')),
      ).toBe(true);
    },
  );
});
