import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import { AccountSubtype, AccountType } from 'plaid';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { ManualInvestmentHoldingEntity } from '../../src/manual-investment/manual-investment-holding.entity';
import { ManualInvestmentSnapshotEntity } from '../../src/manual-investment/manual-investment-snapshot.entity';
import { ManualInvestmentService } from '../../src/manual-investment/manual-investment.service';
import { SecurityInstrumentEntity } from '../../src/manual-investment/security-instrument.entity';
import { SecurityPriceDailyEntity } from '../../src/manual-investment/security-price-daily.entity';
import { StooqSecurityPriceProvider } from '../../src/manual-investment/providers/stooq-security-price.provider';
import { CurrencyExchangeService } from '../../src/currency-exchange/currency-exchange.service';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserService } from '../../src/user/user.service';

describe('ManualInvestmentService', () => {
  let service: ManualInvestmentService;

  const mockAccountRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };
  const mockSnapshotRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const mockHoldingRepository = {
    delete: jest.fn(),
    save: jest.fn(),
  };
  const mockInstrumentRepository = {
    findOne: jest.fn(),
    findByIds: jest.fn(),
    save: jest.fn(),
  };
  const mockPriceRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockBalanceSnapshotRepository = {
    delete: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };
  const mockCurrencyExchangeService = {
    getRate: jest.fn(),
  };
  const mockUserService = {
    getTimezone: jest.fn(),
  };
  const mockPriceProvider = {
    providerName: 'stooq',
    getHistoricalPrices: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockUserService.getTimezone.mockResolvedValue('UTC');
    mockCurrencyExchangeService.getRate.mockResolvedValue(1);
    mockPriceProvider.getHistoricalPrices.mockResolvedValue([]);
    mockBalanceSnapshotRepository.manager.transaction.mockImplementation(
      async (callback: (manager: {
        getRepository: (entity: unknown) => unknown;
      }) => Promise<unknown>) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === BalanceSnapshotEntity) {
              return mockBalanceSnapshotRepository;
            }
            if (entity === AccountEntity) {
              return mockAccountRepository;
            }
            throw new Error('Unexpected repository request');
          },
        }),
    );
    mockPriceRepository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ManualInvestmentService,
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: mockAccountRepository,
        },
        {
          provide: getRepositoryToken(ManualInvestmentSnapshotEntity),
          useValue: mockSnapshotRepository,
        },
        {
          provide: getRepositoryToken(ManualInvestmentHoldingEntity),
          useValue: mockHoldingRepository,
        },
        {
          provide: getRepositoryToken(SecurityInstrumentEntity),
          useValue: mockInstrumentRepository,
        },
        {
          provide: getRepositoryToken(SecurityPriceDailyEntity),
          useValue: mockPriceRepository,
        },
        {
          provide: getRepositoryToken(BalanceSnapshotEntity),
          useValue: mockBalanceSnapshotRepository,
        },
        {
          provide: CurrencyExchangeService,
          useValue: mockCurrencyExchangeService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: StooqSecurityPriceProvider,
          useValue: mockPriceProvider,
        },
      ],
    }).compile();

    service = module.get<ManualInvestmentService>(ManualInvestmentService);
  });

  function makeHoldingsAccount() {
    const account = AccountEntity.fromDto(
      {
        name: 'Brokerage',
        type: AccountType.Investment,
        subType: AccountSubtype.Brokerage,
        manualValuationMode: 'holdings',
        availableBalance: {
          money: { amount: 0, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
        currentBalance: {
          money: { amount: 0, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
      },
      'user-1',
    );
    account.id = 'account-1';
    return account;
  }

  it('rejects duplicate holdings symbols in a single snapshot payload', async () => {
    mockAccountRepository.findOne.mockResolvedValue(makeHoldingsAccount());

    await expect(
      service.replaceSnapshot('account-1', 'user-1', '2026-04-15', {
        cashBalance: {
          money: { amount: 10000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
        holdings: [
          { symbol: 'VOO', quantity: 10 },
          { symbol: ' voo ', quantity: 5 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects unsupported non-US style symbols explicitly', async () => {
    mockAccountRepository.findOne.mockResolvedValue(makeHoldingsAccount());

    await expect(
      service.replaceSnapshot('account-1', 'user-1', '2026-04-15', {
        cashBalance: {
          money: { amount: 10000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
        holdings: [{ symbol: 'BMW.DE', quantity: 1 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('writes derived holdings balance snapshots for the snapshot date and today', async () => {
    const account = makeHoldingsAccount();
    const today = dayjs().format('YYYY-MM-DD');
    const snapshotDate = dayjs(today).subtract(1, 'day').format('YYYY-MM-DD');

    mockAccountRepository.findOne.mockResolvedValue(account);
    mockSnapshotRepository.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'snapshot-1',
      accountId: account.id,
      userId: account.userId,
      snapshotDate,
      cashBalance: {
        toMoneyWithSign: () => ({
          money: { amount: 10000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        }),
      },
      holdings: [
        {
          instrumentId: 'instrument-1',
          symbol: 'VOO',
          quantity: 2,
        },
      ],
      toObject: jest.fn(),
    });
    mockSnapshotRepository.save.mockResolvedValue({
      id: 'snapshot-1',
      accountId: account.id,
      userId: account.userId,
      snapshotDate,
      cashBalance: {
        toMoneyWithSign: () => ({
          money: { amount: 10000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        }),
      },
      holdings: [],
    });
    mockSnapshotRepository.find.mockResolvedValue([
      {
        id: 'snapshot-1',
        accountId: account.id,
        userId: account.userId,
        snapshotDate,
        cashBalance: {
          toMoneyWithSign: () => ({
            money: { amount: 10000, currency: 'USD' },
            sign: MoneySign.POSITIVE,
          }),
        },
        holdings: [
          {
            instrumentId: 'instrument-1',
            symbol: 'VOO',
            quantity: 2,
          },
        ],
      },
    ]);
    mockInstrumentRepository.findOne.mockResolvedValue(null);
    mockInstrumentRepository.save.mockResolvedValue({
      id: 'instrument-1',
      symbol: 'VOO',
      providerName: 'stooq',
      providerSymbol: 'voo.us',
      exchange: 'US',
      priceCurrency: 'USD',
      displayName: null,
    });
    mockInstrumentRepository.findByIds.mockResolvedValue([
      {
        id: 'instrument-1',
        providerSymbol: 'voo.us',
        priceCurrency: 'USD',
      },
    ]);
    mockHoldingRepository.save.mockResolvedValue([]);
    mockPriceProvider.getHistoricalPrices.mockResolvedValue([
      { date: snapshotDate, closePrice: 100, priceCurrency: 'USD' },
      { date: today, closePrice: 101, priceCurrency: 'USD' },
    ]);
    mockPriceRepository.findOne.mockResolvedValue(null);
    const getMany = jest.fn().mockResolvedValue([
      {
        instrumentId: 'instrument-1',
        priceDate: snapshotDate,
        closePrice: 100,
        priceCurrency: 'USD',
      },
      {
        instrumentId: 'instrument-1',
        priceDate: today,
        closePrice: 101,
        priceCurrency: 'USD',
      },
    ]);
    mockPriceRepository.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany,
    });

    await service.replaceSnapshot('account-1', 'user-1', snapshotDate, {
      cashBalance: {
        money: { amount: 10000, currency: 'USD' },
        sign: MoneySign.POSITIVE,
      },
      holdings: [{ symbol: 'VOO', quantity: 2 }],
    });

    expect(mockBalanceSnapshotRepository.manager.transaction).toHaveBeenCalled();
    expect(mockBalanceSnapshotRepository.delete).toHaveBeenCalledWith({
      accountId: 'account-1',
      userId: 'user-1',
      snapshotDate: expect.anything(),
      snapshotType: 'HOLDINGS_DERIVED',
    });
    expect(mockBalanceSnapshotRepository.save).toHaveBeenCalledTimes(2);
    expect(mockBalanceSnapshotRepository.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        accountId: 'account-1',
        userId: 'user-1',
        snapshotDate,
        snapshotType: 'HOLDINGS_DERIVED',
        currentBalance: {
          amount: 30000,
          currency: 'USD',
          sign: 'positive',
        },
        availableBalance: {
          amount: 0,
          currency: 'USD',
          sign: 'positive',
        },
      }),
    );
    expect(mockBalanceSnapshotRepository.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        accountId: 'account-1',
        userId: 'user-1',
        snapshotDate: today,
        snapshotType: 'HOLDINGS_DERIVED',
        currentBalance: {
          amount: 30200,
          currency: 'USD',
          sign: 'positive',
        },
        availableBalance: {
          amount: 0,
          currency: 'USD',
          sign: 'positive',
        },
      }),
    );
  });

  it('does not delete existing derived snapshots when valuation fails before rebuild completes', async () => {
    const account = makeHoldingsAccount();
    const snapshotDate = '2026-04-15';
    mockAccountRepository.findOne.mockResolvedValue(account);
    mockSnapshotRepository.findOne.mockResolvedValueOnce({
      id: 'snapshot-1',
      accountId: account.id,
      userId: account.userId,
      snapshotDate,
      cashBalance: {
        toMoneyWithSign: () => ({
          money: { amount: 10000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        }),
      },
      holdings: [],
    });
    mockSnapshotRepository.save.mockResolvedValue({
      id: 'snapshot-1',
      accountId: account.id,
      userId: account.userId,
      snapshotDate,
      cashBalance: {
        toMoneyWithSign: () => ({
          money: { amount: 10000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        }),
      },
      holdings: [],
    });
    mockSnapshotRepository.find.mockResolvedValue([
      {
        id: 'snapshot-1',
        accountId: account.id,
        userId: account.userId,
        snapshotDate,
        cashBalance: {
          toMoneyWithSign: () => ({
            money: { amount: 10000, currency: 'USD' },
            sign: MoneySign.POSITIVE,
          }),
        },
        holdings: [
          {
            instrumentId: 'instrument-1',
            symbol: 'VOO',
            quantity: 2,
          },
        ],
      },
    ]);
    mockInstrumentRepository.findOne.mockResolvedValue(null);
    mockInstrumentRepository.save.mockResolvedValue({
      id: 'instrument-1',
      symbol: 'VOO',
      providerName: 'stooq',
      providerSymbol: 'voo.us',
      exchange: 'US',
      priceCurrency: 'USD',
      displayName: null,
    });
    mockInstrumentRepository.findByIds.mockResolvedValue([
      {
        id: 'instrument-1',
        providerSymbol: 'voo.us',
        priceCurrency: 'USD',
      },
    ]);
    mockHoldingRepository.save.mockResolvedValue([]);
    mockPriceProvider.getHistoricalPrices.mockRejectedValue(
      new Error('price provider unavailable'),
    );

    await expect(
      service.replaceSnapshot('account-1', 'user-1', snapshotDate, {
        cashBalance: {
          money: { amount: 10000, currency: 'USD' },
          sign: MoneySign.POSITIVE,
        },
        holdings: [{ symbol: 'VOO', quantity: 2 }],
      }),
    ).rejects.toThrow('price provider unavailable');

    expect(mockBalanceSnapshotRepository.delete).not.toHaveBeenCalled();
  });
});
