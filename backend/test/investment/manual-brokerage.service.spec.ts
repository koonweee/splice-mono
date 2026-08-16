import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { AccountSubtype, AccountType } from 'plaid';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceColumns } from '../../src/common/balance.columns';
import { ManualBrokerageService } from '../../src/investment/manual-brokerage.service';
import { MoneySign } from '../../src/types/MoneyWithSign';

const userId = '11111111-1111-1111-1111-111111111111';
const accountId = '22222222-2222-2222-2222-222222222222';

function buildAccount(): AccountEntity {
  const account = new AccountEntity();
  account.id = accountId;
  account.userId = userId;
  account.name = 'Prime Account';
  account.customName = null;
  account.notes = null;
  account.mask = null;
  account.type = String(AccountType.Investment);
  account.subType = String(AccountSubtype.Brokerage);
  account.valuationMode = 'holdings';
  account.externalAccountId = null;
  account.rawApiAccount = null;
  account.archivedAt = null;
  account.bankLinkId = null;
  account.bankLink = null;
  account.currentBalance = BalanceColumns.fromMoneyWithSign({
    money: { currency: 'USD', amount: 0 },
    sign: MoneySign.POSITIVE,
  });
  account.availableBalance = BalanceColumns.fromMoneyWithSign({
    money: { currency: 'USD', amount: 0 },
    sign: MoneySign.POSITIVE,
  });
  account.createdAt = new Date('2026-08-16T00:00:00Z');
  account.updatedAt = new Date('2026-08-16T00:00:00Z');
  return account;
}

const quotes = new Map([
  [
    'AAPL',
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quoteType: 'EQUITY' as const,
      exchangeCode: 'NMS',
      exchangeName: 'NasdaqGS',
      currency: 'USD',
      marketIdentifierCode: 'XNAS',
      price: '100',
      priceAsOf: '2026-08-15',
      priceDatetime: '2026-08-15T20:00:00.000Z',
    },
  ],
  [
    'C6L.SI',
    {
      symbol: 'C6L.SI',
      name: 'Singapore Airlines Limited',
      quoteType: 'EQUITY' as const,
      exchangeCode: 'SES',
      exchangeName: 'SES',
      currency: 'SGD',
      marketIdentifierCode: 'XSES',
      price: '7.05',
      priceAsOf: '2026-08-15',
      priceDatetime: '2026-08-15T09:00:00.000Z',
    },
  ],
]);

describe('ManualBrokerageService', () => {
  const accountRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const securityRepository = { find: jest.fn(), save: jest.fn() };
  const holdingRepository = {
    find: jest.fn(),
    delete: jest.fn(),
    save: jest.fn(),
  };
  const snapshotRepository = { findOne: jest.fn(), save: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity) => {
      if (entity.name === 'AccountEntity') return accountRepository;
      if (entity.name === 'InvestmentSecurityEntity') return securityRepository;
      if (entity.name === 'InvestmentHoldingSnapshotEntity') {
        return holdingRepository;
      }
      return snapshotRepository;
    }),
  };
  const dataSource = {
    transaction: jest.fn(async (callback) => callback(manager)),
  };
  const marketPriceService = {
    resolveQuotes: jest.fn(),
    resolveQuotesForUsers: jest.fn(),
  };
  const currencyExchangeService = { getRate: jest.fn() };
  const userService = {
    getTimezone: jest.fn(),
    getPreferredCurrency: jest.fn(),
  };
  const investmentService = { findLatestHoldingsForAccount: jest.fn() };

  const service = new ManualBrokerageService(
    dataSource as any,
    accountRepository as any,
    holdingRepository as any,
    marketPriceService as any,
    currencyExchangeService as any,
    userService as any,
    investmentService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    accountRepository.find.mockResolvedValue([]);
    userService.getTimezone.mockResolvedValue('UTC');
    userService.getPreferredCurrency.mockResolvedValue('USD');
    marketPriceService.resolveQuotes.mockResolvedValue({
      quotes,
      staleSymbols: [],
      missingSymbols: [],
    });
    currencyExchangeService.getRate.mockResolvedValue(0.75);
    accountRepository.save.mockImplementation(async (account) => {
      account.id ??= accountId;
      account.createdAt ??= new Date('2026-08-16T00:00:00Z');
      account.updatedAt ??= new Date('2026-08-16T00:00:00Z');
      return account;
    });
    securityRepository.find.mockResolvedValue([]);
    let securityIndex = 0;
    securityRepository.save.mockImplementation(async (security) => {
      security.id ??= `33333333-3333-3333-3333-33333333333${securityIndex++}`;
      security.createdAt ??= new Date('2026-08-16T00:00:00Z');
      security.updatedAt ??= new Date('2026-08-16T00:00:00Z');
      return security;
    });
    holdingRepository.delete.mockResolvedValue({ affected: 0 });
    holdingRepository.save.mockImplementation(async (holdings) => holdings);
    snapshotRepository.findOne.mockResolvedValue(null);
    snapshotRepository.save.mockImplementation(async (snapshot) => snapshot);
    investmentService.findLatestHoldingsForAccount.mockResolvedValue({
      accountId,
      snapshotDate: '2026-08-16',
      accountCurrency: 'USD',
      accountValue: {
        money: { currency: 'USD', amount: 125750 },
        sign: MoneySign.POSITIVE,
      },
      holdings: [],
    });
  });

  it('atomically creates and values mixed USD/SGD positions', async () => {
    const response = await service.createManualBrokerageAccount(
      {
        name: 'Prime Account',
        accountCurrency: 'USD',
        positions: [
          { symbol: 'AAPL', quantity: '2' },
          { symbol: 'C6L.SI', quantity: '200' },
        ],
      },
      userId,
    );

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(response.account.currentBalance.money.amount).toBe(125750);
    expect(response.account.valuationMode).toBe('holdings');
    const savedHoldings = holdingRepository.save.mock.calls[0][0];
    expect(savedHoldings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          quantity: '2',
          institutionValue: '200',
          accountValue: '200.00',
          exchangeRateToAccountCurrency: '1',
        }),
        expect.objectContaining({
          quantity: '200',
          institutionValue: '1410',
          accountValue: '1057.50',
          exchangeRateToAccountCurrency: '0.75',
        }),
      ]),
    );
    expect(snapshotRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotType: 'USER_UPDATE' }),
    );
  });

  it('deterministically values the five-position reference portfolio', async () => {
    const referenceQuotes = new Map([
      [
        'GOOGL',
        {
          ...quotes.get('AAPL')!,
          symbol: 'GOOGL',
          name: 'Alphabet Inc.',
          price: '347.39',
        },
      ],
      [
        'INTC',
        {
          ...quotes.get('AAPL')!,
          symbol: 'INTC',
          name: 'Intel Corporation',
          price: '103.06',
        },
      ],
      [
        'NVDA',
        {
          ...quotes.get('AAPL')!,
          symbol: 'NVDA',
          name: 'NVIDIA Corporation',
          price: '224.75',
        },
      ],
      [
        'TSM',
        {
          ...quotes.get('AAPL')!,
          symbol: 'TSM',
          name: 'Taiwan Semiconductor',
          price: '425.22',
        },
      ],
      ['C6L.SI', quotes.get('C6L.SI')!],
    ]);
    marketPriceService.resolveQuotes.mockResolvedValueOnce({
      quotes: referenceQuotes,
      staleSymbols: [],
      missingSymbols: [],
    });

    const response = await service.createManualBrokerageAccount(
      {
        name: 'Prime Account UI valuation test',
        accountCurrency: 'USD',
        positions: [
          { symbol: 'GOOGL', quantity: '2' },
          { symbol: 'INTC', quantity: '97' },
          { symbol: 'NVDA', quantity: '7' },
          { symbol: 'TSM', quantity: '8' },
          { symbol: 'C6L.SI', quantity: '200' },
        ],
      },
      userId,
    );

    expect(response.account.currentBalance.money.amount).toBe(1672411);
    expect(holdingRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ quantity: '2', accountValue: '694.78' }),
        expect.objectContaining({ quantity: '97', accountValue: '9996.82' }),
        expect.objectContaining({ quantity: '7', accountValue: '1573.25' }),
        expect.objectContaining({ quantity: '8', accountValue: '3401.76' }),
        expect.objectContaining({
          quantity: '200',
          institutionValue: '1410',
          accountValue: '1057.50',
        }),
      ]),
    );
  });

  it('rounds each normalized position before summing smallest units', async () => {
    const fractionalQuotes = new Map([
      [
        'AAA',
        {
          ...quotes.get('C6L.SI')!,
          symbol: 'AAA',
          name: 'First SGD equity',
          price: '1',
        },
      ],
      [
        'BBB',
        {
          ...quotes.get('C6L.SI')!,
          symbol: 'BBB',
          name: 'Second SGD equity',
          price: '1',
        },
      ],
    ]);
    marketPriceService.resolveQuotes.mockResolvedValueOnce({
      quotes: fractionalQuotes,
      staleSymbols: [],
      missingSymbols: [],
    });
    currencyExchangeService.getRate.mockResolvedValueOnce(0.005);

    const response = await service.createManualBrokerageAccount(
      {
        name: 'Rounding test',
        accountCurrency: 'USD',
        positions: [
          { symbol: 'AAA', quantity: '1' },
          { symbol: 'BBB', quantity: '1' },
        ],
      },
      userId,
    );

    expect(response.account.currentBalance.money.amount).toBe(2);
    const savedHoldings = holdingRepository.save.mock.calls[0][0];
    expect(savedHoldings.map((holding) => holding.accountValue)).toEqual([
      '0.01',
      '0.01',
    ]);
  });

  it('rejects missing prices before opening a transaction', async () => {
    marketPriceService.resolveQuotes.mockResolvedValueOnce({
      quotes: new Map(),
      staleSymbols: [],
      missingSymbols: ['UNKNOWN'],
    });

    await expect(
      service.createManualBrokerageAccount(
        {
          name: 'Bad account',
          accountCurrency: 'USD',
          positions: [{ symbol: 'UNKNOWN', quantity: '1' }],
        },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects empty creates at the service boundary', async () => {
    await expect(
      service.createManualBrokerageAccount(
        { name: 'Empty account', accountCurrency: 'USD', positions: [] },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(marketPriceService.resolveQuotes).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it.each(['-1', 'NaN', '0', '1.1234567890123'])(
    'validates quantity %s inside the service boundary',
    async (quantity) => {
      await expect(
        service.createManualBrokerageAccount(
          {
            name: 'Bad account',
            accountCurrency: 'USD',
            positions: [{ symbol: 'AAPL', quantity }],
          },
          userId,
        ),
      ).rejects.toThrow(BadRequestException);
      expect(marketPriceService.resolveQuotes).not.toHaveBeenCalled();
    },
  );

  it('does not perform a post-commit read when the atomic write rolls back', async () => {
    snapshotRepository.save.mockRejectedValueOnce(new Error('write failed'));

    await expect(
      service.createManualBrokerageAccount(
        {
          name: 'Rollback test',
          accountCurrency: 'USD',
          positions: [{ symbol: 'AAPL', quantity: '2' }],
        },
        userId,
      ),
    ).rejects.toThrow('write failed');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(
      investmentService.findLatestHoldingsForAccount,
    ).not.toHaveBeenCalled();
  });

  it('does not overwrite holdings changed while a refresh was in flight', async () => {
    const account = buildAccount();
    accountRepository.findOne.mockResolvedValue(account);
    accountRepository.save.mockResolvedValue(account);
    investmentService.findLatestHoldingsForAccount.mockResolvedValueOnce({
      accountId,
      snapshotDate: '2026-08-16',
      accountCurrency: 'USD',
      accountValue: null,
      holdings: [
        {
          quantity: '1',
          security: { externalSecurityId: 'AAPL' },
        },
      ],
    });
    snapshotRepository.findOne.mockResolvedValue({
      snapshotDate: '2026-08-16',
    });
    holdingRepository.find.mockResolvedValue([
      {
        quantity: '2',
        security: { externalSecurityId: 'AAPL' },
      },
    ]);

    await expect(
      service.refreshManualBrokeragePrices(accountId, userId),
    ).rejects.toThrow(ConflictException);
    expect(accountRepository.save).not.toHaveBeenCalled();
  });

  it('clears a same-day snapshot, deletes omitted rows, and records zero', async () => {
    const account = buildAccount();
    account.currentBalance = BalanceColumns.fromMoneyWithSign({
      money: { currency: 'USD', amount: 20000 },
      sign: MoneySign.POSITIVE,
    });
    accountRepository.findOne.mockResolvedValue(account);
    marketPriceService.resolveQuotes.mockResolvedValueOnce({
      quotes: new Map(),
      staleSymbols: [],
      missingSymbols: [],
    });
    const sameDaySnapshot = {
      snapshotDate: '2026-08-16',
      snapshotType: 'MARKET_REFRESH',
    };
    snapshotRepository.findOne.mockResolvedValue(sameDaySnapshot);

    const response = await service.replaceManualBrokerageHoldings(
      accountId,
      { positions: [] },
      userId,
    );

    expect(response.account.currentBalance.money.amount).toBe(0);
    expect(holdingRepository.delete).toHaveBeenCalledWith({
      userId,
      accountId,
      snapshotDate: '2026-08-16',
      provider: 'manual',
    });
    expect(holdingRepository.save).not.toHaveBeenCalled();
    expect(snapshotRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshotType: 'USER_UPDATE',
        currentBalance: expect.objectContaining({ amount: 0 }),
      }),
    );
  });

  it('surfaces a stale cached quote while retaining its nonzero valuation', async () => {
    const account = buildAccount();
    accountRepository.findOne.mockResolvedValue(account);
    marketPriceService.resolveQuotes.mockResolvedValueOnce({
      quotes,
      staleSymbols: ['AAPL'],
      missingSymbols: [],
    });

    const response = await service.replaceManualBrokerageHoldings(
      accountId,
      { positions: [{ symbol: 'AAPL', quantity: '2' }] },
      userId,
    );

    expect(response.staleSymbols).toEqual(['AAPL']);
    expect(response.account.currentBalance.money.amount).toBe(20000);
    expect(holdingRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ institutionPrice: '100' }),
      ]),
    );
  });

  it('rejects updates when the owned account is not holdings-valued', async () => {
    const account = buildAccount();
    account.valuationMode = 'balance';
    accountRepository.findOne.mockResolvedValue(account);

    await expect(
      service.replaceManualBrokerageHoldings(
        accountId,
        { positions: [] },
        userId,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(marketPriceService.resolveQuotes).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', null, NotFoundException],
    [
      'archived',
      Object.assign(buildAccount(), {
        archivedAt: new Date('2026-08-15T00:00:00Z'),
      }),
      BadRequestException,
    ],
    [
      'linked',
      Object.assign(buildAccount(), { bankLinkId: 'linked-bank-id' }),
      BadRequestException,
    ],
  ])('rejects %s account updates', async (_label, account, errorType) => {
    accountRepository.findOne.mockResolvedValue(account);

    await expect(
      service.replaceManualBrokerageHoldings(
        accountId,
        { positions: [] },
        userId,
      ),
    ).rejects.toThrow(errorType);

    expect(marketPriceService.resolveQuotes).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('batches scheduled symbols once and continues after an account failure', async () => {
    const goodAccount = buildAccount();
    const badAccount = buildAccount();
    badAccount.id = '99999999-9999-9999-9999-999999999999';
    accountRepository.find.mockResolvedValue([goodAccount, badAccount]);
    accountRepository.findOne.mockResolvedValue(goodAccount);
    investmentService.findLatestHoldingsForAccount
      .mockResolvedValueOnce({
        holdings: [{ quantity: '2', security: { externalSecurityId: 'AAPL' } }],
      })
      .mockResolvedValueOnce({
        holdings: [{ quantity: '1', security: { externalSecurityId: 'BAD' } }],
      });
    marketPriceService.resolveQuotesForUsers.mockResolvedValue(
      new Map([
        [
          userId,
          {
            quotes,
            staleSymbols: [],
            missingSymbols: ['BAD'],
          },
        ],
      ]),
    );
    snapshotRepository.findOne.mockResolvedValue({
      snapshotDate: '2026-08-16',
    });
    holdingRepository.find.mockResolvedValue([
      { quantity: '2', security: { externalSecurityId: 'AAPL' } },
    ]);

    const result = await service.refreshAllManualBrokerages();

    expect(marketPriceService.resolveQuotesForUsers).toHaveBeenCalledTimes(1);
    expect(marketPriceService.resolveQuotesForUsers).toHaveBeenCalledWith(
      new Map([[userId, ['AAPL', 'BAD']]]),
    );
    expect(result).toEqual({ refreshed: 1, skipped: 1 });
  });

  it('isolates scheduled holdings-load failures and refreshes remaining accounts', async () => {
    const failedAccount = buildAccount();
    failedAccount.id = '88888888-8888-8888-8888-888888888888';
    const goodAccount = buildAccount();
    accountRepository.find.mockResolvedValue([failedAccount, goodAccount]);
    accountRepository.findOne.mockResolvedValue(goodAccount);
    investmentService.findLatestHoldingsForAccount
      .mockRejectedValueOnce(new Error('holding load failed'))
      .mockResolvedValueOnce({
        holdings: [{ quantity: '2', security: { externalSecurityId: 'AAPL' } }],
      });
    marketPriceService.resolveQuotesForUsers.mockResolvedValue(
      new Map([[userId, { quotes, staleSymbols: [], missingSymbols: [] }]]),
    );
    snapshotRepository.findOne.mockResolvedValue({
      snapshotDate: '2026-08-16',
    });
    holdingRepository.find.mockResolvedValue([
      { quantity: '2', security: { externalSecurityId: 'AAPL' } },
    ]);

    const result = await service.refreshAllManualBrokerages();

    expect(marketPriceService.resolveQuotesForUsers).toHaveBeenCalledTimes(1);
    expect(marketPriceService.resolveQuotesForUsers).toHaveBeenCalledWith(
      new Map([[userId, ['AAPL']]]),
    );
    expect(result).toEqual({ refreshed: 1, skipped: 1 });
  });
});
