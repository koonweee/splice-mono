import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { CategoryEntity } from '../../src/category/category.entity';
import { convertMinorUnits } from '../../src/common/exact-money';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { CurrencyExchangeService } from '../../src/currency-exchange/currency-exchange.service';
import { ExchangeRateEntity } from '../../src/currency-exchange/exchange-rate.entity';
import { HoldingsQueryService } from '../../src/investment/holdings-query.service';
import { InvestmentTransactionEntity } from '../../src/investment/investment-transaction.entity';
import { McpPortfolioVisualizationService } from '../../src/mcp/mcp-portfolio-visualization.service';
import { McpReadService } from '../../src/mcp/mcp-read.service';
import { TransactionQueryService } from '../../src/transaction/transaction-query.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserEntity } from '../../src/user/user.entity';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';

postgresSuite('MCP financial input and FX snapshots', () => {
  let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
  let service: McpReadService;
  let conversion: CurrencyConversionService;
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    harness = await isolatedPostgres('mcp_snapshot');
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
      money: { amount: '0', currency: 'EUR' },
      sign: MoneySign.POSITIVE,
    };
    accountId = (
      await db.getRepository(AccountEntity).save(
        AccountEntity.fromDto(
          {
            name: 'Fixture',
            type: 'investment',
            currentBalance: balance,
            availableBalance: balance,
          } as any,
          userId,
        ),
      )
    ).id;
    conversion = new CurrencyConversionService(
      new CurrencyExchangeService(
        db.getRepository(ExchangeRateEntity),
        {} as any,
        {} as any,
      ),
      {} as any,
    );
    const transactions = new TransactionQueryService(
      db.getRepository(TransactionEntity),
    );
    service = new McpReadService(
      db.getRepository(TransactionEntity),
      db.getRepository(BalanceSnapshotEntity),
      db.getRepository(CategoryEntity),
      new HoldingsQueryService(db),
      db.getRepository(InvestmentTransactionEntity),
      conversion,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      transactions,
    );
  }, 120000);
  afterAll(async () => harness?.close());
  beforeEach(async () => {
    jest.restoreAllMocks();
    await harness.database.query('DELETE FROM banking_transaction_entity');
    await harness.database.query('DELETE FROM account_activity_entity');
    await harness.database.query('DELETE FROM holdings_snapshot_header_entity');
    await harness.database.query('DELETE FROM exchange_rate_entity');
  });

  async function insertTransactions(count: number, currency = 'EUR') {
    await harness.database.query(
      `WITH activities AS (
      INSERT INTO account_activity_entity ("userId","accountId",provider,"externalActivityId","activityKind","activityDate","providerDate","amountAmount","amountCurrency","amountSign")
      SELECT $1,$2,'manual',gen_random_uuid()::text,'banking_transaction','2026-09-01','2026-09-01',100,$3,'negative' FROM generate_series(1,$4::integer) RETURNING id)
      INSERT INTO banking_transaction_entity ("activityId",source,"merchantName",pending) SELECT id,'manual','Fixture',false FROM activities`,
      [userId, accountId, currency, count],
    );
  }
  async function rate(value = '1') {
    await harness.database.getRepository(ExchangeRateEntity).save(
      ExchangeRateEntity.fromDto({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rateDate: '2026-09-01',
        rate: value,
      }),
    );
  }

  it('uses one data/quote version across filtered candidate batches and computes after commit', async () => {
    await insertTransactions(220);
    await rate();
    const resolve = conversion.getResolvedRates.bind(conversion);
    let snapshot: EntityManager | undefined;
    const read = jest
      .spyOn(conversion, 'getResolvedRates')
      .mockImplementation(async (...args) => {
        snapshot = args[1];
        expect(snapshot?.queryRunner?.isTransactionActive).toBe(true);
        await harness.database.transaction(async (writer) => {
          await writer.query(
            'UPDATE account_activity_entity SET "amountAmount"=300',
          );
          await writer.query('UPDATE exchange_rate_entity SET rate=2');
        });
        return resolve(...args);
      });
    const convert = jest
      .spyOn(conversion, 'convertAmount')
      .mockImplementation((...args) => {
        expect(snapshot?.queryRunner?.isTransactionActive).toBe(false);
        return convertMinorUnits(...args);
      });
    const result = await service.listTransactions(userId, {
      reportingCurrency: 'USD',
      pageSize: 100,
      amountFilter: { currency: 'USD', min: '2' },
    });
    expect(result.data).toEqual([]);
    expect(result.pageInfo.hasMore).toBe(false);
    expect(convert).toHaveBeenCalledTimes(220);
    expect(read).toHaveBeenCalledTimes(1);
    expect(result.conversion.rates[0].rate).toBe('1');
    jest.restoreAllMocks();
    const fresh = await service.listTransactions(userId, {
      reportingCurrency: 'USD',
      pageSize: 100,
    });
    expect(fresh.data[0].amount.amount).toBe('3');
    expect(fresh.data[0].convertedAmount.amount).toBe('6');
  });

  it('does not require an unused candidate quote, but fails if that row must be processed', async () => {
    await insertTransactions(2, 'USD');
    await insertTransactions(1, 'EUR');
    await harness.database.query(
      `UPDATE account_activity_entity SET "providerDate"='2026-08-01' WHERE "amountCurrency"='EUR'`,
    );
    const result = await service.listTransactions(userId, {
      reportingCurrency: 'USD',
      pageSize: 1,
      amountFilter: { currency: 'USD', min: '0' },
    });
    expect(result.data).toHaveLength(1);
    expect(result.pageInfo.hasMore).toBe(true);
    const unfiltered = await service.listTransactions(userId, {
      reportingCurrency: 'USD',
      pageSize: 2,
    });
    expect(unfiltered.data).toHaveLength(2);
    expect(unfiltered.pageInfo.hasMore).toBe(true);
    await expect(
      service.listTransactions(userId, {
        reportingCurrency: 'USD',
        pageSize: 100,
        amountFilter: { currency: 'USD', min: '0' },
      }),
    ).rejects.toThrow('conversion was not resolved');
  });

  it('values a portfolio from the same snapshot as its FX and releases it before valuation', async () => {
    await rate();
    const [security] = await harness.database.query(
      `INSERT INTO investment_security_entity ("userId",provider,"externalSecurityId",name) VALUES ($1,'plaid',$2,'Fixture') RETURNING id`,
      [userId, randomUUID()],
    );
    const [header] = await harness.database.query(
      `INSERT INTO holdings_snapshot_header_entity ("userId","accountId",provider,"snapshotDate","completedAt") VALUES ($1,$2,'plaid','2026-09-01',now()) RETURNING id`,
      [userId, accountId],
    );
    await harness.database.query(
      `INSERT INTO investment_holding_snapshot_entity ("userId","accountId","headerId","securityId",provider,"snapshotDate",quantity,"institutionValue","isoCurrencyCode") VALUES ($1,$2,$3,$4,'plaid','2026-09-01',1,100,'EUR')`,
      [userId, accountId, header.id, security.id],
    );
    const resolve = conversion.getResolvedRates.bind(conversion);
    let snapshot: EntityManager | undefined;
    jest
      .spyOn(conversion, 'getResolvedRates')
      .mockImplementation(async (...args) => {
        snapshot = args[1];
        expect(snapshot?.queryRunner?.isTransactionActive).toBe(true);
        await harness.database.transaction(async (writer) => {
          await writer.query(
            'UPDATE investment_holding_snapshot_entity SET "institutionValue"=300',
          );
          await writer.query('UPDATE exchange_rate_entity SET rate=2');
        });
        const rates = await resolve(...args);
        const get = rates.get.bind(rates);
        jest.spyOn(rates, 'get').mockImplementation((key) => {
          expect(snapshot?.queryRunner?.isTransactionActive).toBe(false);
          return get(key);
        });
        return rates;
      });
    const portfolio = new McpPortfolioVisualizationService(service, conversion);
    expect((await portfolio.visualize(userId)).totalValueUsd.amount).toBe(
      '100',
    );
    jest.restoreAllMocks();
    expect((await portfolio.visualize(userId)).totalValueUsd.amount).toBe(
      '600',
    );
  });
});
