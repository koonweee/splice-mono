import { convertMinorUnits } from '../../src/common/exact-money';
import { randomUUID } from 'node:crypto';
import { isolatedPostgres, postgresSuite } from '../helpers/isolated-postgres';
import { AccountEntity } from '../../src/account/account.entity';
import { AnalysisRuleEntity } from '../../src/analysis-rule/analysis-rule.entity';
import { AnalysisRuleService } from '../../src/analysis-rule/analysis-rule.service';
import { CategoryEntity } from '../../src/category/category.entity';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { CurrencyExchangeService } from '../../src/currency-exchange/currency-exchange.service';
import { ExchangeRateEntity } from '../../src/currency-exchange/exchange-rate.entity';
import { CashFlowQueryService } from '../../src/transaction-analysis/cash-flow-query.service';
import { TransactionAnalysisService } from '../../src/transaction-analysis/transaction-analysis.service';
import { TransactionQueryService } from '../../src/transaction/transaction-query.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserEntity } from '../../src/user/user.entity';

postgresSuite('Cash-flow request snapshots in PostgreSQL', () => {
  let harness: Awaited<ReturnType<typeof isolatedPostgres>>;
  let service: CashFlowQueryService;
  let transactions: TransactionQueryService;
  let conversion: CurrencyConversionService;
  let userId: string;
  let accountId: string;

  beforeAll(async () => {
    harness = await isolatedPostgres('cashflow_test');
    const database = harness.database;
    const user = await database.getRepository(UserEntity).save(
      UserEntity.fromGoogleIdentity({
        email: `${randomUUID()}@example.test`,
        googleSubject: randomUUID(),
      }),
    );
    userId = user.id;
    const money = {
      money: { amount: '0', currency: 'USD' },
      sign: MoneySign.POSITIVE,
    };
    const account = await database.getRepository(AccountEntity).save(
      AccountEntity.fromDto(
        {
          name: 'Synthetic cash-flow',
          type: 'depository',
          currentBalance: money,
          availableBalance: money,
        } as any,
        userId,
      ),
    );
    accountId = account.id;
    transactions = new TransactionQueryService(
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
    service = new CashFlowQueryService(
      database,
      transactions,
      conversion,
      new AnalysisRuleService(
        database.getRepository(AnalysisRuleEntity),
        database.getRepository(CategoryEntity),
      ),
    );
  }, 120000);
  afterAll(async () => {
    await harness?.close();
  });
  beforeEach(async () => {
    jest.restoreAllMocks();
    await harness.database.query('DELETE FROM banking_transaction_entity');
    await harness.database.query('DELETE FROM account_activity_entity');
    await harness.database.query('DELETE FROM analysis_rule_entity');
    await harness.database.query('DELETE FROM exchange_rate_entity');
    await harness.database.query(
      `UPDATE user_entity SET settings = settings || '{"currency":"USD","neutralizationLookaroundDays":60}'::jsonb WHERE id=$1`,
      [userId],
    );
  });

  async function insert(
    amount = '1',
    currency = 'EUR',
    date = '2026-09-01',
    sign = 'negative',
  ) {
    const id = randomUUID();
    await harness.database.query(
      `INSERT INTO account_activity_entity (id,"userId","accountId",provider,"externalActivityId","activityKind","activityDate","providerDate","amountAmount","amountCurrency","amountSign") VALUES ($1::uuid,$2,$3,'manual',$1::text,'banking_transaction',$4,$4,$5,$6,$7)`,
      [id, userId, accountId, date, amount, currency, sign],
    );
    const rows = await harness.database.query(
      `INSERT INTO banking_transaction_entity ("activityId",source,"merchantName",pending,"providerPayload") VALUES ($1,'manual','Synthetic',false,'{"unused":"opaque"}') RETURNING id`,
      [id],
    );
    return rows[0].id as string;
  }
  async function rate(date = '2026-09-01', value = '1.5') {
    await harness.database.getRepository(ExchangeRateEntity).save(
      ExchangeRateEntity.fromDto({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rateDate: date,
        rate: value,
      }),
    );
  }

  it('reads settings, rules and candidates once and loads batched FX before commit and releases before calculation; summary and drilldown reconcile', async () => {
    await insert();
    await insert();
    await rate();
    const read = jest.spyOn(transactions, 'readAnalysis');
    const original = conversion.getResolvedRates.bind(conversion);
    const fx = jest
      .spyOn(conversion, 'getResolvedRates')
      .mockImplementation(async (...args) => {
        expect(harness.queries).not.toContain('COMMIT');
        expect(args[1]?.queryRunner?.isTransactionActive).toBe(true);
        return original(...args);
      });
    harness.queries.length = 0;
    jest.spyOn(conversion, 'convertAmount').mockImplementation((...args) => {
      expect(harness.queries).toContain('COMMIT');
      return convertMinorUnits(...args);
    });
    const report = await service.report(userId, '2026-09-01', '2026-09-30');
    expect(read).toHaveBeenCalledTimes(1);
    expect(fx).toHaveBeenCalledTimes(1);
    expect(report.summary.totalOutflow).toBe('4');
    const detail = service.categoryTransactions(
      report,
      'UNCATEGORIZED',
      'outflow',
    );
    expect(
      detail.reduce(
        (sum, row) => sum + BigInt(row.convertedAmount!.money.amount),
        0n,
      ),
    ).toBe(4n);
    expect(
      report.evaluatedTransactions.every(
        (row) => row.transaction.providerPayload === undefined,
      ),
    ).toBe(true);
    const selects = harness.queries.filter((query) =>
      /^SELECT|^\s*WITH/i.test(query),
    );
    expect(
      selects.filter((query) => /FROM [^\n]*"user_entity"/.test(query)),
    ).toHaveLength(1);
    expect(
      selects.filter((query) =>
        /FROM [^\n]*"analysis_rule_entity"/.test(query),
      ),
    ).toHaveLength(1);
    expect(
      selects.filter((query) =>
        /FROM [^\n]*"banking_transaction_entity"/.test(query),
      ),
    ).toHaveLength(1);
    expect(selects.length).toBeLessThanOrEqual(6);
  });

  it('keeps settings, rules and candidates from one repeatable-read version during concurrent edits', async () => {
    await insert('100', 'USD');
    const original = transactions.readAnalysis.bind(transactions);
    jest
      .spyOn(transactions, 'readAnalysis')
      .mockImplementationOnce(async (...args) => {
        // This second connection commits after the report has already read its settings.
        await harness.database.transaction(async (manager) => {
          await manager.query(
            `UPDATE user_entity SET settings=settings || '{"currency":"EUR","neutralizationLookaroundDays":0}'::jsonb WHERE id=$1`,
            [userId],
          );
          await manager.getRepository(AnalysisRuleEntity).save({
            userId,
            name: 'Concurrent exclusion',
            type: 'exclude',
            excludeScope: { mode: 'all' },
            inflowScope: null,
            outflowScope: null,
            archivedAt: null,
          });
          await manager.query(
            `UPDATE account_activity_entity SET "amountAmount"=999 WHERE "userId"=$1`,
            [userId],
          );
        });
        return original(...args);
      });
    const originalReport = await service.report(
      userId,
      '2026-09-01',
      '2026-09-30',
    );
    expect(originalReport.summary.currency).toBe('USD');
    expect(originalReport.summary.totalOutflow).toBe('100');
    expect(originalReport.audit.rows).toHaveLength(0);
    expect(originalReport.audit.neutralizationLookaroundDays).toBe(60);
    const nextReport = await service.report(userId, '2026-09-01', '2026-09-30');
    expect(nextReport.summary.currency).toBe('EUR');
    expect(nextReport.summary.totalOutflow).toBe('0');
    expect(nextReport.audit.rows).toHaveLength(1);
    expect(nextReport.audit.neutralizationLookaroundDays).toBe(0);
  });

  it('uses effective-day quotes and reports unavailable FX without returning partial totals', async () => {
    const id = await insert('100', 'EUR', '2026-09-01');
    await insert('100', 'EUR', '2026-09-02');
    await harness.database.query(
      `UPDATE banking_transaction_entity SET "reportingDateOverride"='2026-09-03' WHERE id=$1`,
      [id],
    );
    await rate('2026-09-02', '2');
    await rate('2026-09-03', '1.5');
    expect(
      (await service.report(userId, '2026-09-01', '2026-09-30')).summary
        .totalOutflow,
    ).toBe('350');
    await insert('1', 'JPY');
    await expect(
      service.report(userId, '2026-09-01', '2026-09-30'),
    ).rejects.toThrow(/rate/i);
    await expect(
      new TransactionAnalysisService(service).getAnalysisAudit(
        '2026-09-01',
        '2026-09-30',
        userId,
      ),
    ).rejects.toThrow(/rate/i);
  });

  it('keeps transaction amounts and FX quotes from one version during a concurrent atomic update', async () => {
    await insert('100', 'EUR');
    await rate('2026-09-01', '1.5');
    const original = conversion.getResolvedRates.bind(conversion);
    jest
      .spyOn(conversion, 'getResolvedRates')
      .mockImplementationOnce(async (...args) => {
        // Candidates have already been read. A second connection publishes a new amount and quote together.
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
    const first = await service.report(userId, '2026-09-01', '2026-09-30');
    expect(first.summary.totalOutflow).toBe('150');
    expect(first.evaluatedTransactions[0].transaction.amount.amount).toBe(
      '100',
    );
    const next = await service.report(userId, '2026-09-01', '2026-09-30');
    expect(next.summary.totalOutflow).toBe('600');
    expect(next.evaluatedTransactions[0].transaction.amount.amount).toBe('200');
  });

  it.each(['exclude', 'neutralize'] as const)(
    'does not require missing candidate FX after the %s rule removes the rows',
    async (type) => {
      await insert('100', 'JPY');
      if (type === 'neutralize')
        await insert('100', 'JPY', '2026-09-02', 'positive');
      await harness.database.getRepository(AnalysisRuleEntity).save({
        userId,
        name: 'No quote needed',
        type,
        archivedAt: null,
        excludeScope: type === 'exclude' ? { mode: 'all' } : null,
        inflowScope: type === 'neutralize' ? { mode: 'all' } : null,
        outflowScope: type === 'neutralize' ? { mode: 'all' } : null,
      });
      const report = await service.report(userId, '2026-09-01', '2026-09-30');
      expect(report.summary).toMatchObject({
        totalInflow: '0',
        totalOutflow: '0',
        netFlow: '0',
      });
      expect(report.evaluatedTransactions).toHaveLength(0);
      expect(report.audit.rows).toHaveLength(1);
      expect(report.audit.rows[0].type).toBe(
        type === 'exclude' ? 'excluded' : 'neutralized',
      );
    },
  );

  it('does not expose another owner and rejects invalid work before opening a transaction', async () => {
    await insert('100', 'USD');
    const other = await harness.database.getRepository(UserEntity).save(
      UserEntity.fromGoogleIdentity({
        email: `${randomUUID()}@example.test`,
        googleSubject: randomUUID(),
      }),
    );
    expect(
      (await service.report(other.id, '2026-09-01', '2026-09-30'))
        .evaluatedTransactions,
    ).toHaveLength(0);
    harness.queries.length = 0;
    await expect(
      service.report(userId, '2026-02-30', '2026-09-30'),
    ).rejects.toThrow();
    expect(harness.queries).toHaveLength(0);
  });
});
