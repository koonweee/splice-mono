import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
import { UserEntity } from '../../src/user/user.entity';
import { InvestmentService } from '../../src/investment/investment.service';
import { HoldingsQueryService } from '../../src/investment/holdings-query.service';
import { HoldingsSnapshotHeaderEntity } from '../../src/investment/holdings-snapshot-header.entity';
import { InvestmentHoldingSnapshotEntity } from '../../src/investment/investment-holding-snapshot.entity';
import { InvestmentSecurityEntity } from '../../src/investment/investment-security.entity';
import { InvestmentTransactionEntity } from '../../src/investment/investment-transaction.entity';
import { ManualBrokerageService } from '../../src/investment/manual-brokerage.service';
import { CurrencyExchangeService } from '../../src/currency-exchange/currency-exchange.service';
import { ExchangeRateEntity } from '../../src/currency-exchange/exchange-rate.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';
import type {
  ProviderInvestmentHoldingsResponse,
  ProviderInvestmentSecurity,
  ProviderInvestmentTransactionsResponse,
} from '../../src/types/Investment';

const databaseUrl = process.env.BACKEND_BENCHMARK_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;
suite(
  'Investment complete snapshots and generation fencing in PostgreSQL',
  () => {
    let database: DataSource;
    let service: InvestmentService;
    let reads: HoldingsQueryService;
    let userId: string;
    let bankLinkId: string;
    let accountIds: string[];
    let legacyManualId: string;
    let queries: string[] = [];
    const schema = `investment_test_${randomUUID().replaceAll('-', '')}`;
    const security: ProviderInvestmentSecurity = {
      externalSecurityId: 'SECURITY',
      institutionId: null,
      institutionSecurityId: null,
      name: 'Synthetic stock',
      tickerSymbol: 'SYN',
      isin: null,
      cusip: null,
      sedol: null,
      type: 'equity',
      subtype: null,
      isCashEquivalent: false,
      closePrice: '10',
      closePriceAsOf: '2026-09-05',
      updateDatetime: null,
      isoCurrencyCode: 'USD',
      unofficialCurrencyCode: null,
      marketIdentifierCode: null,
      sector: null,
      industry: null,
    };
    const money = {
      money: { amount: '100000', currency: 'USD' },
      sign: MoneySign.POSITIVE,
    };
    const response = (count = 1): ProviderInvestmentHoldingsResponse => ({
      externalAccountIds: accountIds
        .slice(0, count)
        .map((_, index) => `external-${index}`),
      securities: [security],
      holdings: accountIds.slice(0, count).map((_, index) => ({
        externalAccountId: `external-${index}`,
        externalSecurityId: security.externalSecurityId,
        quantity: '1',
        costBasis: null,
        institutionPrice: '10',
        institutionPriceAsOf: '2026-09-05',
        institutionPriceDatetime: null,
        institutionValue: '10',
        isoCurrencyCode: 'USD',
        unofficialCurrencyCode: null,
        vestedQuantity: null,
        vestedValue: null,
      })),
    });
    const map = () =>
      new Map(accountIds.map((id, index) => [`external-${index}`, id]));
    async function sync(
      input: ProviderInvestmentHoldingsResponse,
      date = '2026-09-05',
    ) {
      const token = await service.beginProviderSync(
        userId,
        bankLinkId,
        'holdings',
      );
      return service.upsertPlaidHoldings(userId, map(), date, input, token);
    }
    const transactionResponse = (
      kind = 'buy',
    ): ProviderInvestmentTransactionsResponse => ({
      externalAccountIds: ['external-0'],
      securities: [security],
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      transactions: [
        {
          externalActivityId: `activity-${kind}`,
          externalAccountId: 'external-0',
          externalSecurityId: security.externalSecurityId,
          providerDate: '2026-09-05',
          providerDatetime: null,
          name: 'Synthetic transaction',
          quantity: '1',
          amount: money,
          price: '10',
          fees: null,
          investmentType: kind,
          investmentSubtype: 'buy',
          cancelExternalActivityId: null,
          providerPayload: { fixture: true },
        },
      ],
    });

    beforeAll(async () => {
      const url = new URL(databaseUrl!);
      if (
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        url.pathname !== '/splice_backend_benchmark'
      )
        throw new Error(
          'Investment SQL tests require the dedicated local splice_backend_benchmark database',
        );
      database = new DataSource({
        type: 'postgres',
        url: databaseUrl,
        schema,
        extra: { options: `-c search_path=${schema},public -c timezone=UTC` },
        entities: [path.join(__dirname, '../../src/**/*.entity.ts')],
        migrations: [path.join(__dirname, '../../src/migrations/*.ts')],
        synchronize: false,
        logging: ['query'],
        logger: {
          logQuery: (query) => queries.push(query),
          logQueryError() {},
          logQuerySlow() {},
          logSchemaBuild() {},
          logMigration() {},
          log() {},
        },
      });
      await database.initialize();
      await database.query(`CREATE SCHEMA "${schema}"`);
      const allMigrations = [...database.migrations];
      database.migrations.splice(
        0,
        database.migrations.length,
        ...allMigrations.filter(
          (migration) => migration.name !== 'AddHoldingsSnapshots1788643000000',
        ),
      );
      await database.runMigrations({ transaction: 'all' });
      const user = await database.getRepository(UserEntity).save(
        UserEntity.fromGoogleIdentity({
          email: `${schema}@example.test`,
          googleSubject: schema,
        }),
      );
      userId = user.id;
      const link = await database
        .getRepository(BankLinkEntity)
        .save(
          BankLinkEntity.fromDto(
            { providerName: 'plaid', authentication: {}, accountIds: [] },
            userId,
          ),
        );
      bankLinkId = link.id;
      const accounts = Array.from({ length: 100 }, (_, index) =>
        AccountEntity.fromDto(
          {
            name: `Investment ${index}`,
            mask: null,
            type: 'investment',
            subType: 'brokerage',
            currentBalance: money,
            availableBalance: money,
            externalAccountId: `external-${index}`,
            bankLinkId,
          } as any,
          userId,
        ),
      );
      accountIds = (
        await database.getRepository(AccountEntity).save(accounts)
      ).map((account) => account.id);
      const legacySecurity = await database
        .getRepository(InvestmentSecurityEntity)
        .save(InvestmentSecurityEntity.fromProvider(security, userId));
      await database.query(
        `INSERT INTO investment_holding_snapshot_entity ("userId","accountId","securityId",provider,"snapshotDate",quantity,"institutionValue") VALUES ($1,$2,$3,'plaid','2026-09-01',1,10)`,
        [userId, accountIds[0], legacySecurity.id],
      );
      const legacyManual = AccountEntity.fromDto(
        {
          name: 'Legacy cleared portfolio',
          type: 'investment',
          subType: 'brokerage',
          currentBalance: money,
          availableBalance: money,
          valuationMode: 'holdings',
        } as any,
        userId,
      );
      legacyManualId = (
        await database.getRepository(AccountEntity).save(legacyManual)
      ).id;
      await database.query(
        `INSERT INTO balance_snapshot_entity ("userId","accountId","snapshotDate","snapshotType","currentBalanceAmount","currentBalanceCurrency","currentBalanceSign","availableBalanceAmount","availableBalanceCurrency","availableBalanceSign") VALUES ($1,$2,'2026-09-03','USER_UPDATE',0,'USD','positive',0,'USD','positive'),($1,$3,'2026-09-03','SYNC',1000,'USD','positive',1000,'USD','positive')`,
        [userId, legacyManualId, accountIds[0]],
      );
      database.migrations.splice(
        0,
        database.migrations.length,
        ...allMigrations,
      );
      await database.runMigrations({ transaction: 'all' });
      reads = new HoldingsQueryService(database);
      service = new InvestmentService(
        database.getRepository(InvestmentSecurityEntity),
        database.getRepository(InvestmentHoldingSnapshotEntity),
        database.getRepository(InvestmentTransactionEntity),
        database.getRepository(AccountEntity),
        database,
        reads,
      );
    }, 60000);

    afterAll(async () => {
      if (database?.isInitialized) {
        await database.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await database.destroy();
      }
    });

    it('backfills known positions and factual manual clears without inventing provider empty snapshots', async () => {
      const provider = await service.findLatestHoldingsForAccount(
        userId,
        accountIds[0],
      );
      expect(provider.snapshotDate).toBe('2026-09-01');
      expect(provider.holdings).toHaveLength(1);
      const manual = await service.findLatestHoldingsForAccount(
        userId,
        legacyManualId,
      );
      expect(manual).toMatchObject({
        snapshotDate: '2026-09-03',
        accountValue: { money: { amount: '0' } },
        holdings: [],
      });
      await database
        .getRepository(BalanceSnapshotEntity)
        .delete({ accountId: legacyManualId, userId });
      await database
        .getRepository(AccountEntity)
        .delete({ id: legacyManualId, userId });
    });

    it.each([1, 20, 100])(
      'loads latest complete holdings for %i accounts in at most three SELECTs',
      async (count) => {
        await sync(response(count));
        queries = [];
        const result = await reads.read(userId, {
          accountIds: accountIds.slice(0, count),
        });
        expect(result).toHaveLength(count);
        expect(result.every((row) => row.snapshot.holdings.length === 1)).toBe(
          true,
        );
        expect(result[0].account.currentBalance.toMoneyWithSign()).toEqual(
          money,
        );
        expect(
          queries.filter((query) => /^SELECT\b/i.test(query)),
        ).toHaveLength(3);
        expect(queries.join('\n')).not.toContain('rawApiAccount');
      },
    );

    it('a completed empty provider snapshot never falls back to older holdings', async () => {
      await sync({ ...response(), holdings: [] }, '2026-09-06');
      const [result] = await reads.read(userId, {
        accountIds: [accountIds[0]],
      });
      expect(result.snapshot).toMatchObject({
        snapshotDate: '2026-09-06',
        holdings: [],
      });
      const historical = await service.findHoldingsForAccountOnDate(
        userId,
        accountIds[0],
        '2026-09-05',
      );
      expect(historical.holdings).toHaveLength(1);
    });

    it('rolls back every header/security/position write on a failed holding batch', async () => {
      await database.query(
        `CREATE FUNCTION fail_holding() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.quantity=999 THEN RAISE EXCEPTION 'injected holding failure'; END IF; RETURN NEW; END $$`,
      );
      await database.query(
        'CREATE TRIGGER fail_holding BEFORE INSERT OR UPDATE ON investment_holding_snapshot_entity FOR EACH ROW EXECUTE FUNCTION fail_holding()',
      );
      const input = response(2);
      input.holdings[1].quantity = '999';
      await expect(sync(input, '2026-09-07')).rejects.toThrow(
        'injected holding failure',
      );
      expect(
        await database
          .getRepository(HoldingsSnapshotHeaderEntity)
          .count({ where: { userId, snapshotDate: '2026-09-07' } }),
      ).toBe(0);
      expect(
        (await service.findLatestHoldingsForAccount(userId, accountIds[0]))
          .snapshotDate,
      ).toBe('2026-09-06');
      await database.query(
        'DROP TRIGGER fail_holding ON investment_holding_snapshot_entity',
      );
    });

    it('rejects an older response after a newer generation commits', async () => {
      const old = await service.beginProviderSync(
        userId,
        bankLinkId,
        'holdings',
      );
      const current = await service.beginProviderSync(
        userId,
        bankLinkId,
        'holdings',
      );
      await service.upsertPlaidHoldings(
        userId,
        map(),
        '2026-09-07',
        { ...response(), holdings: [] },
        current,
      );
      await expect(
        service.upsertPlaidHoldings(
          userId,
          map(),
          '2026-09-07',
          response(),
          old,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.upsertPlaidHoldings(
          userId,
          map(),
          '2026-09-07',
          response(),
          current,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(
        (await service.findLatestHoldingsForAccount(userId, accountIds[0]))
          .holdings,
      ).toEqual([]);
    });

    it('serializes simultaneous generations without duplicate positions', async () => {
      const tokens = await Promise.all([
        service.beginProviderSync(userId, bankLinkId, 'holdings'),
        service.beginProviderSync(userId, bankLinkId, 'holdings'),
      ]);
      const results = await Promise.allSettled(
        tokens.map((token) =>
          service.upsertPlaidHoldings(
            userId,
            map(),
            '2026-09-08',
            response(),
            token,
          ),
        ),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        await database.getRepository(InvestmentHoldingSnapshotEntity).count({
          where: {
            userId,
            accountId: accountIds[0],
            snapshotDate: '2026-09-08',
          },
        }),
      ).toBe(1);
    });

    it('rolls back investment activities and completion metadata if the detail write fails', async () => {
      await database.query(
        `CREATE FUNCTION fail_detail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."investmentType"='fail' THEN RAISE EXCEPTION 'injected detail failure'; END IF; RETURN NEW; END $$`,
      );
      await database.query(
        'CREATE TRIGGER fail_detail BEFORE INSERT OR UPDATE ON investment_transaction_entity FOR EACH ROW EXECUTE FUNCTION fail_detail()',
      );
      const token = await service.beginProviderSync(
        userId,
        bankLinkId,
        'transactions',
      );
      await expect(
        service.upsertPlaidInvestmentTransactions(
          userId,
          map(),
          transactionResponse('fail'),
          token,
        ),
      ).rejects.toThrow('injected detail failure');
      const rows = await database.query(
        `SELECT count(*)::int AS count FROM account_activity_entity WHERE "userId"=$1 AND "externalActivityId"='activity-fail'`,
        [userId],
      );
      expect(rows[0].count).toBe(0);
      const link = await database
        .getRepository(BankLinkEntity)
        .findOneByOrFail({ id: bankLinkId });
      expect(link.authentication.investmentTransactionsSync).toBeUndefined();
      await database.query(
        'DROP TRIGGER fail_detail ON investment_transaction_entity',
      );
      const next = await service.beginProviderSync(
        userId,
        bankLinkId,
        'transactions',
      );
      await service.upsertPlaidInvestmentTransactions(
        userId,
        map(),
        transactionResponse(),
        next,
      );
      const updated = await database
        .getRepository(BankLinkEntity)
        .findOneByOrFail({ id: bankLinkId });
      expect(updated.authentication.investmentTransactionsSync).toMatchObject({
        lastStartDate: '2026-09-01',
        lastEndDate: '2026-09-05',
      });
      expect(
        await database
          .getRepository(InvestmentTransactionEntity)
          .count({ where: { userId } }),
      ).toBe(1);
    });

    it('preserves manual empty snapshots and cascades their headers on account deletion', async () => {
      const quotes = new Map([
        [
          'SYN',
          {
            symbol: 'SYN',
            name: 'Synthetic',
            quoteType: 'EQUITY',
            exchangeCode: 'NMS',
            exchangeName: 'NASDAQ',
            currency: 'USD',
            marketIdentifierCode: 'XNAS',
            price: '0.000000000001',
            priceAsOf: '2026-09-05',
            priceDatetime: '2026-09-05T00:00:00Z',
          },
        ],
      ]);
      const manual = new ManualBrokerageService(
        database,
        database.getRepository(AccountEntity),
        database.getRepository(InvestmentHoldingSnapshotEntity),
        {
          resolveQuotes: async (_user: string, symbols: string[]) => ({
            quotes: symbols.length ? quotes : new Map(),
            staleSymbols: [],
            missingSymbols: [],
          }),
        } as any,
        { getRate: async () => '1' } as any,
        {
          getTimezone: async () => 'UTC',
          getPreferredCurrency: async () => 'USD',
        } as any,
        service,
        reads,
      );
      const created = await manual.createManualBrokerageAccount(
        {
          name: 'Manual',
          accountCurrency: 'USD',
          positions: [
            { symbol: 'SYN', quantity: '999999999999999999.999999999999' },
          ],
        },
        userId,
      );
      expect(created.snapshot.holdings).toHaveLength(1);
      expect(created.snapshot.holdings[0]).toMatchObject({
        quantity: '999999999999999999.999999999999',
        institutionPrice: '0.000000000001',
      });
      expect(created.account.currentBalance.money.amount).toBe('100000000');
      const cleared = await manual.replaceManualBrokerageHoldings(
        created.account.id,
        { positions: [] },
        userId,
      );
      expect(cleared.snapshot.holdings).toEqual([]);
      expect(cleared.snapshot.accountValue?.money.amount).toBe('0');
      expect(cleared.snapshot.snapshotDate).not.toBeNull();
      await database
        .getRepository(BalanceSnapshotEntity)
        .delete({ accountId: created.account.id, userId });
      await database
        .getRepository(AccountEntity)
        .delete({ id: created.account.id, userId });
      expect(
        await database
          .getRepository(HoldingsSnapshotHeaderEntity)
          .count({ where: { accountId: created.account.id } }),
      ).toBe(0);
    });

    it('persists ordinary inverse FX and exact half-cent ties with a 12-decimal informational rate', async () => {
      const date = new Date().toISOString().slice(0, 10);
      const exchange = new CurrencyExchangeService(
        database.getRepository(ExchangeRateEntity),
        {} as any,
        {} as any,
      );
      await database.getRepository(ExchangeRateEntity).save(
        ExchangeRateEntity.fromDto({
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: '1.1',
          rateDate: date,
        }),
      );
      let price = '10';
      const manual = new ManualBrokerageService(
        database,
        database.getRepository(AccountEntity),
        database.getRepository(InvestmentHoldingSnapshotEntity),
        {
          resolveQuotes: async () => ({
            quotes: new Map([
              [
                'FX',
                {
                  symbol: 'FX',
                  name: 'USD equity',
                  quoteType: 'EQUITY',
                  exchangeCode: 'NMS',
                  exchangeName: 'NASDAQ',
                  currency: 'USD',
                  marketIdentifierCode: 'XNAS',
                  price,
                  priceAsOf: date,
                  priceDatetime: null,
                },
              ],
            ]),
            staleSymbols: [],
            missingSymbols: [],
          }),
        } as any,
        exchange,
        {
          getTimezone: async () => 'UTC',
          getPreferredCurrency: async () => 'EUR',
        } as any,
        service,
        reads,
      );
      for (const [
        quotePrice,
        quantity,
        canonicalRate,
        expectedMinorUnits,
        storedRate,
      ] of [
        ['10', '1', '1.1', '909', '0.909090909091'],
        ['0.0055', '1', '1.1', '1', '0.909090909091'],
        ['1', '0.035', '7', '1', '0.142857142857'],
      ]) {
        price = quotePrice;
        await database
          .getRepository(ExchangeRateEntity)
          .update(
            { baseCurrency: 'EUR', targetCurrency: 'USD', rateDate: date },
            { rate: canonicalRate },
          );
        const result = await manual.createManualBrokerageAccount(
          {
            name: 'EUR position',
            accountCurrency: 'EUR',
            positions: [{ symbol: 'FX', quantity }],
          },
          userId,
        );
        expect(result.account.currentBalance.money).toEqual({
          amount: expectedMinorUnits,
          currency: 'EUR',
        });
        expect(result.snapshot.holdings[0].exchangeRateToAccountCurrency).toBe(
          storedRate,
        );
        expect(result.snapshot.accountValue?.money.amount).toBe(
          expectedMinorUnits,
        );
        await database
          .getRepository(BalanceSnapshotEntity)
          .delete({ accountId: result.account.id, userId });
        await database
          .getRepository(InvestmentHoldingSnapshotEntity)
          .delete({ accountId: result.account.id, userId });
        await database
          .getRepository(AccountEntity)
          .delete({ id: result.account.id, userId });
      }
    });

    it('rejects archived accounts and wrong owners before applying provider work', async () => {
      const token = await service.beginProviderSync(
        userId,
        bankLinkId,
        'holdings',
      );
      await database
        .getRepository(AccountEntity)
        .update({ id: accountIds[99], userId }, { archivedAt: new Date() });
      await expect(
        service.upsertPlaidHoldings(
          userId,
          map(),
          '2026-09-09',
          response(100),
          token,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        reads.read(randomUUID(), { accountIds: [accountIds[0]] }),
      ).rejects.toThrow('not found');
      expect(await reads.read(userId, { includeArchived: false })).toHaveLength(
        99,
      );
      expect(await reads.read(userId, { includeArchived: true })).toHaveLength(
        100,
      );
    });
  },
);
