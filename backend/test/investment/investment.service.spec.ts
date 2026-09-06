import { ConflictException, NotFoundException } from '@nestjs/common';
import { InvestmentService } from '../../src/investment/investment.service';
import { InvestmentHoldingSnapshotEntity } from '../../src/investment/investment-holding-snapshot.entity';
import { InvestmentSecurityEntity } from '../../src/investment/investment-security.entity';
import { MoneySign } from '../../src/types/MoneyWithSign';
import type {
  ProviderInvestmentHoldingsResponse,
  ProviderInvestmentTransactionsResponse,
} from '../../src/types/Investment';

jest.mock('../../src/investment/investment-write-values', () => ({
  investmentWriteValues: (_repository: unknown, entities: unknown[]) =>
    entities,
}));
const userId = '11111111-1111-1111-1111-111111111111';
const accountId = '22222222-2222-2222-2222-222222222222';
const securityId = '33333333-3333-3333-3333-333333333333';
const activityId = '55555555-5555-5555-5555-555555555555';

const providerResponse: ProviderInvestmentHoldingsResponse = {
  externalAccountIds: ['external-account-id'],
  securities: [
    {
      externalSecurityId: 'security-id',
      institutionId: 'ins_123',
      institutionSecurityId: 'institution-security-id',
      name: 'Vanguard FTSE All-World UCITS ETF',
      tickerSymbol: 'VWRA',
      isin: 'IE00BK5BQT80',
      cusip: null,
      sedol: null,
      type: 'etf',
      subtype: 'etf',
      isCashEquivalent: false,
      closePrice: '120.250000000001',
      closePriceAsOf: '2026-05-20',
      updateDatetime: '2026-05-20T21:00:00Z',
      isoCurrencyCode: 'USD',
      unofficialCurrencyCode: null,
      marketIdentifierCode: 'XLON',
      sector: null,
      industry: null,
    },
  ],
  holdings: [
    {
      externalAccountId: 'external-account-id',
      externalSecurityId: 'security-id',
      quantity: '10.123456789012',
      costBasis: '1000.000000000001',
      institutionPrice: '120.250000000001',
      institutionPriceAsOf: '2026-05-20',
      institutionPriceDatetime: '2026-05-20T21:00:00Z',
      institutionValue: '1217.345678901234',
      isoCurrencyCode: 'USD',
      unofficialCurrencyCode: null,
      vestedQuantity: null,
      vestedValue: null,
    },
  ],
};

const providerTransactionResponse: ProviderInvestmentTransactionsResponse = {
  externalAccountIds: ['external-account-id'],
  startDate: '2026-01-01',
  endDate: '2026-05-20',
  securities: providerResponse.securities,
  transactions: [
    {
      externalActivityId: 'investment-transaction-id',
      externalAccountId: 'external-account-id',
      externalSecurityId: 'security-id',
      providerDate: '2026-05-20',
      providerDatetime: null,
      name: 'Buy VWRA',
      quantity: '2',
      amount: {
        money: { currency: 'USD', amount: '12345' },
        sign: MoneySign.NEGATIVE,
      },
      price: '61.725',
      fees: '1.25',
      investmentType: 'buy',
      investmentSubtype: 'buy',
      cancelExternalActivityId: null,
      providerPayload: {
        investment_transaction_id: 'investment-transaction-id',
      },
    },
  ],
};

function buildSecurity(): InvestmentSecurityEntity {
  const security = InvestmentSecurityEntity.fromProvider(
    providerResponse.securities[0],
    userId,
  );
  security.id = securityId;
  security.createdAt = new Date('2026-05-20T00:00:00Z');
  security.updatedAt = new Date('2026-05-20T00:00:00Z');
  return security;
}

function buildHolding(): InvestmentHoldingSnapshotEntity {
  const holding = InvestmentHoldingSnapshotEntity.fromProvider(
    providerResponse.holdings[0],
    userId,
    accountId,
    securityId,
    '2026-05-20',
  );
  holding.id = '44444444-4444-4444-4444-444444444444';
  holding.security = buildSecurity();
  holding.createdAt = new Date('2026-05-20T00:00:00Z');
  holding.updatedAt = new Date('2026-05-20T00:00:00Z');
  return holding;
}

describe('InvestmentService shared reads and bulk write orchestration', () => {
  const token = {
    bankLinkId: 'link',
    kind: 'holdings' as const,
    generation: '1',
  };
  const transactionToken = { ...token, kind: 'transactions' as const };
  const securityRepository = { find: jest.fn(), upsert: jest.fn() };
  const holdingRepository = {
    find: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  };
  const transactionRepository = { upsert: jest.fn() };
  const activityRepository = { find: jest.fn(), upsert: jest.fn() };
  const stateRepository = { findOne: jest.fn(), update: jest.fn() };
  const bankLinkRepository = { findOne: jest.fn(), update: jest.fn() };
  const accountQuery: any = { getMany: jest.fn() };
  for (const method of ['where', 'andWhere', 'orderBy', 'setLock'])
    accountQuery[method] = jest.fn(() => accountQuery);
  const accountRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => accountQuery),
  };
  const repositories: Record<string, unknown> = {
    InvestmentSecurityEntity: securityRepository,
    InvestmentHoldingSnapshotEntity: holdingRepository,
    InvestmentTransactionEntity: transactionRepository,
    AccountActivityEntity: activityRepository,
    InvestmentSyncStateEntity: stateRepository,
    BankLinkEntity: bankLinkRepository,
    AccountEntity: accountRepository,
  };
  const manager = {
    getRepository: jest.fn((entity) => repositories[entity.name]),
    query: jest.fn(),
  };
  const dataSource = {
    transaction: jest.fn(async (callback) => callback(manager)),
  };
  const reads = { read: jest.fn() };
  const service = new InvestmentService(
    securityRepository as any,
    holdingRepository as any,
    transactionRepository as any,
    accountRepository as any,
    dataSource as any,
    reads as any,
  );
  const accountMap = new Map([['external-account-id', accountId]]);

  beforeEach(() => {
    jest.clearAllMocks();
    const savedSecurity = InvestmentSecurityEntity.fromProvider(
      providerResponse.securities[0],
      userId,
    );
    savedSecurity.id = securityId;
    securityRepository.find.mockResolvedValue([savedSecurity]);
    holdingRepository.find.mockResolvedValue([]);
    holdingRepository.delete.mockResolvedValue({ affected: 1 });
    bankLinkRepository.findOne.mockResolvedValue({
      id: 'link',
      userId,
      authentication: { untouched: true },
    });
    stateRepository.findOne.mockResolvedValue({
      id: 'state',
      requestedGeneration: '1',
      completedGeneration: '0',
    });
    accountQuery.getMany.mockResolvedValue([{ id: accountId }]);
    manager.query.mockResolvedValue([{ id: 'header', accountId }]);
    activityRepository.find.mockResolvedValue([
      {
        id: activityId,
        accountId,
        externalActivityId: 'investment-transaction-id',
      },
    ]);
    reads.read.mockResolvedValue([
      {
        snapshot: {
          accountId,
          snapshotDate: '2026-05-20',
          accountCurrency: null,
          accountValue: null,
          holdings: [buildHolding().toObject()],
        },
      },
    ]);
  });

  it('writes one batch with exact decimal values and a completed header', async () => {
    const result = await service.upsertPlaidHoldings(
      userId,
      accountMap,
      '2026-05-20',
      providerResponse,
      token,
    );
    expect(securityRepository.upsert.mock.calls[0][0][0].closePrice).toBe(
      '120.250000000001',
    );
    expect(holdingRepository.upsert.mock.calls[0][0][0]).toMatchObject({
      headerId: 'header',
      accountId,
      securityId,
      quantity: '10.123456789012',
      institutionValue: '1217.345678901234',
    });
    expect(result).toEqual({
      accounts: 1,
      securities: 1,
      holdings: 1,
      deletedStaleHoldings: 0,
    });
    expect(stateRepository.update).toHaveBeenCalledWith(
      { id: 'state', userId },
      expect.objectContaining({ completedGeneration: '1' }),
    );
  });

  it('deduplicates repeated provider securities and preserves the final observation', async () => {
    await service.upsertPlaidHoldings(
      userId,
      accountMap,
      '2026-05-20',
      {
        ...providerResponse,
        securities: [
          providerResponse.securities[0],
          { ...providerResponse.securities[0], closePrice: '121.000000000001' },
        ],
      },
      token,
    );
    expect(securityRepository.upsert).toHaveBeenCalledTimes(1);
    expect(securityRepository.upsert.mock.calls[0][0]).toHaveLength(1);
    expect(securityRepository.upsert.mock.calls[0][0][0].closePrice).toBe(
      '121.000000000001',
    );
  });

  it('retains existing same-day identities and deletes only obsolete positions', async () => {
    holdingRepository.find.mockResolvedValue([
      { id: 'kept', accountId, securityId },
      { id: 'obsolete', accountId, securityId: 'other' },
    ]);
    const result = await service.upsertPlaidHoldings(
      userId,
      accountMap,
      '2026-05-20',
      providerResponse,
      token,
    );
    expect(holdingRepository.upsert.mock.calls[0][1].conflictPaths).toEqual([
      'accountId',
      'snapshotDate',
      'securityId',
    ]);
    expect(result.deletedStaleHoldings).toBe(1);
    expect(holdingRepository.delete.mock.calls[0][0].id.value).toEqual([
      'obsolete',
    ]);
  });

  it('delegates latest and explicit-date reads to the shared owner-scoped reader', async () => {
    const result = await service.findLatestHoldingsForAccount(
      userId,
      accountId,
    );
    expect(result.holdings[0].quantity).toBe('10.123456789012');
    expect(reads.read).toHaveBeenCalledWith(userId, {
      accountIds: [accountId],
      includeArchived: true,
    });
    await service.findHoldingsForAccountOnDate(userId, accountId, '2026-05-20');
    expect(reads.read).toHaveBeenLastCalledWith(userId, {
      accountIds: [accountId],
      includeArchived: true,
      snapshotDate: '2026-05-20',
    });
  });

  it('preserves a completed empty snapshot and propagates ownership failures', async () => {
    const snapshot = {
      accountId,
      snapshotDate: '2026-05-21',
      accountCurrency: 'USD',
      accountValue: {
        money: { currency: 'USD', amount: '0' },
        sign: MoneySign.POSITIVE,
      },
      holdings: [],
    };
    reads.read.mockResolvedValueOnce([{ snapshot }]);
    expect(
      await service.findLatestHoldingsForAccount(userId, accountId),
    ).toEqual(snapshot);
    reads.read.mockRejectedValueOnce(new NotFoundException());
    await expect(
      service.findLatestHoldingsForAccount(userId, accountId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('batches activity and detail writes before completion metadata', async () => {
    const result = await service.upsertPlaidInvestmentTransactions(
      userId,
      accountMap,
      providerTransactionResponse,
      transactionToken,
    );
    expect(
      activityRepository.upsert.mock.calls[0][0][0].amount.toMoneyWithSign(),
    ).toEqual({
      money: { currency: 'USD', amount: '12345' },
      sign: MoneySign.NEGATIVE,
    });
    expect(transactionRepository.upsert.mock.calls[0][0][0]).toMatchObject({
      activityId,
      securityId,
      name: 'Buy VWRA',
      quantity: '2',
      price: '61.725',
      fees: '1.25',
    });
    expect(result).toEqual({
      accounts: 1,
      securities: 1,
      transactions: 1,
      skippedMissingAccount: 0,
    });
    expect(
      bankLinkRepository.update.mock.calls[0][1].authentication.untouched,
    ).toBe(true);
  });

  it('stores cash-only activity without a security association', async () => {
    await service.upsertPlaidInvestmentTransactions(
      userId,
      accountMap,
      {
        ...providerTransactionResponse,
        securities: [],
        transactions: [
          {
            ...providerTransactionResponse.transactions[0],
            externalSecurityId: null,
            investmentType: 'cash',
            investmentSubtype: 'interest',
          },
        ],
      },
      transactionToken,
    );
    expect(transactionRepository.upsert.mock.calls[0][0][0]).toMatchObject({
      securityId: null,
      externalSecurityId: null,
      investmentType: 'cash',
    });
  });

  it('counts unavailable provider accounts without writing orphan activities', async () => {
    const result = await service.upsertPlaidInvestmentTransactions(
      userId,
      new Map(),
      providerTransactionResponse,
      transactionToken,
    );
    expect(result.skippedMissingAccount).toBe(1);
    expect(activityRepository.upsert).not.toHaveBeenCalled();
    expect(transactionRepository.upsert).not.toHaveBeenCalled();
  });

  it('rejects obsolete generations before any write', async () => {
    stateRepository.findOne.mockResolvedValueOnce({
      requestedGeneration: '2',
      completedGeneration: '2',
    });
    await expect(
      service.upsertPlaidHoldings(
        userId,
        accountMap,
        '2026-05-20',
        providerResponse,
        token,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(securityRepository.upsert).not.toHaveBeenCalled();
  });
});
