import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';
import { AccountEntity } from '../../src/account/account.entity';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { CurrencyExchangeService } from '../../src/currency-exchange/currency-exchange.service';
import { ExchangeRateEntity } from '../../src/currency-exchange/exchange-rate.entity';
import { convertMinorUnits } from '../../src/common/exact-money';
import { TransactionController } from '../../src/transaction/transaction.controller';
import { TransactionQueryService } from '../../src/transaction/transaction-query.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserEntity } from '../../src/user/user.entity';

postgresSuite('Transaction HTTP page financial snapshots in PostgreSQL', () => {
  let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
  let queries: TransactionQueryService;
  let conversion: CurrencyConversionService;
  let controller: TransactionController;
  let userId: string;
  let accountId: string;
  const date = '2026-09-01';
  beforeAll(async () => {
    harness = await isolatedPostgres('transaction_page');
    const database = harness.database;
    const user = await database.getRepository(UserEntity).save(
      UserEntity.fromGoogleIdentity({
        email: `${randomUUID()}@example.test`,
        googleSubject: randomUUID(),
      }),
    );
    userId = user.id;
    const money = {
      money: { currency: 'EUR', amount: '0' },
      sign: MoneySign.POSITIVE,
    };
    const account = await database.getRepository(AccountEntity).save(
      AccountEntity.fromDto(
        {
          name: 'Synthetic page',
          type: 'depository',
          availableBalance: money,
          currentBalance: money,
        } as any,
        userId,
      ),
    );
    accountId = account.id;
    queries = new TransactionQueryService(
      database.getRepository(TransactionEntity),
    );
    conversion = new CurrencyConversionService(
      new CurrencyExchangeService(
        database.getRepository(ExchangeRateEntity),
        {} as any,
        {} as any,
      ),
      {} as any,
    );
    controller = new TransactionController({} as any, conversion, queries);
  }, 120000);
  afterAll(async () => {
    await harness?.close();
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    const database = harness.database;
    await database.query('DELETE FROM banking_transaction_entity');
    await database.query('DELETE FROM account_activity_entity');
    await database.query('DELETE FROM exchange_rate_entity');
    await database.query(
      `UPDATE user_entity SET settings=settings || '{"currency":"USD"}'::jsonb WHERE id=$1`,
      [userId],
    );
    const id = randomUUID();
    await database.query(
      `INSERT INTO account_activity_entity (id,"userId","accountId",provider,"externalActivityId","activityKind","activityDate","providerDate","amountAmount","amountCurrency","amountSign") VALUES ($1,$2,$3,'manual',$4,'banking_transaction',$5,$5,100,'EUR','negative')`,
      [id, userId, accountId, id, date],
    );
    await database.query(
      `INSERT INTO banking_transaction_entity ("activityId",source,"merchantName",pending,"providerPayload") VALUES ($1,'manual','Synthetic',false,'{"private":"not selected"}')`,
      [id],
    );
    await database.getRepository(ExchangeRateEntity).save(
      ExchangeRateEntity.fromDto({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: '1.5',
        rateDate: date,
      }),
    );
  });
  const read = (convert = 'true') =>
    controller.findAll(
      { userId, email: 'fixture@example.test' },
      undefined,
      '100',
      undefined,
      undefined,
      undefined,
      date,
      '2026-09-30',
      undefined,
      undefined,
      convert,
    );

  it('keeps page amounts and their FX quotes coherent across an atomic concurrent update, then converts after commit', async () => {
    const original = conversion.getResolvedRates.bind(conversion);
    let context: EntityManager | undefined;
    jest
      .spyOn(conversion, 'getResolvedRates')
      .mockImplementationOnce(async (...args) => {
        context = args[1];
        expect(context?.queryRunner?.isTransactionActive).toBe(true);
        await harness.database.transaction(async (manager) => {
          await manager.query(
            'UPDATE account_activity_entity SET "amountAmount"=200 WHERE "userId"=$1',
            [userId],
          );
          await manager.query(
            'UPDATE exchange_rate_entity SET rate=3 WHERE "baseCurrency"=\'EUR\' AND "targetCurrency"=\'USD\'',
          );
        });
        return original(...args);
      });
    jest.spyOn(conversion, 'convertAmount').mockImplementation((...args) => {
      expect(context?.queryRunner?.isTransactionActive).toBe(false);
      expect(context?.queryRunner?.isReleased).toBe(true);
      return convertMinorUnits(...args);
    });
    const first = await read();
    expect(first).toMatchObject({ total: 1, hasMore: false, nextCursor: null });
    expect(first.data[0].amount.money.amount).toBe('100');
    expect(first.data[0].convertedAmount?.money.amount).toBe('150');
    expect(first.data[0]).not.toHaveProperty('providerPayload');
    const next = await read();
    expect(next.data[0].amount.money.amount).toBe('200');
    expect(next.data[0].convertedAmount?.money.amount).toBe('600');
  });

  it('loads preferred currency from the same snapshot as the page', async () => {
    const original = queries.readPage.bind(queries);
    jest.spyOn(queries, 'readPage').mockImplementationOnce(async (...args) => {
      const page = await original(...args);
      await harness.database.query(
        `UPDATE user_entity SET settings=settings || '{"currency":"EUR"}'::jsonb WHERE id=$1`,
        [userId],
      );
      return page;
    });
    expect((await read()).data[0].convertedAmount?.money).toEqual({
      amount: '150',
      currency: 'USD',
    });
    expect((await read()).data[0].convertedAmount).toBeUndefined();
  });

  it('does not query FX for foreign zero or same-currency rows and fails missing required FX without partial conversion', async () => {
    await harness.database.query('DELETE FROM exchange_rate_entity');
    const convert = jest.spyOn(conversion, 'convertAmount');
    await expect(read()).rejects.toThrow(
      'Required exchange rate is unavailable',
    );
    expect(convert).not.toHaveBeenCalled();
    await harness.database.query(
      'UPDATE account_activity_entity SET "amountAmount"=0 WHERE "userId"=$1',
      [userId],
    );
    harness.queries.length = 0;
    expect((await read()).data[0].convertedAmount?.money.amount).toBe('0');
    expect(
      harness.queries.filter((sql) =>
        sql.includes('FROM exchange_rate_entity'),
      ),
    ).toHaveLength(0);
    await harness.database.query(
      `UPDATE account_activity_entity SET "amountAmount"=100,"amountCurrency"='USD' WHERE "userId"=$1`,
      [userId],
    );
    harness.queries.length = 0;
    expect((await read()).data[0].convertedAmount).toBeUndefined();
    expect(
      harness.queries.filter((sql) =>
        sql.includes('FROM exchange_rate_entity'),
      ),
    ).toHaveLength(0);
  });

  it('reads an unconverted page without currency or FX work', async () => {
    const currency = jest.spyOn(conversion, 'getPreferredCurrency');
    const fx = jest.spyOn(conversion, 'getResolvedRates');
    expect((await read('false')).data).toHaveLength(1);
    expect(currency).not.toHaveBeenCalled();
    expect(fx).not.toHaveBeenCalled();
  });
});
