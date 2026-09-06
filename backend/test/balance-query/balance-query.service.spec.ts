import { decimalRateRatio } from '../../src/common/exact-money';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountType } from 'plaid';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceQueryService } from '../../src/balance-query/balance-query.service';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { CurrencyExchangeService } from '../../src/currency-exchange/currency-exchange.service';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserService } from '../../src/user/user.service';

const mockUserId = 'user-uuid-123';

// Helper to create mock account entity
const createMockAccountEntity = (
  id: string,
  type: AccountType = AccountType.Depository,
  currency = 'USD',
  bankLinkId: string | null = 'bank-link-123',
) => ({
  id,
  userId: mockUserId,
  name: `Account ${id}`,
  type,
  subType: null,
  mask: '1234',
  externalAccountId: bankLinkId ? 'ext-123' : null,
  bankLinkId,
  bankLink: bankLinkId ? { id: bankLinkId } : null,
  availableBalance: {
    amount: '100000',
    currency,
    sign: MoneySign.POSITIVE,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { amount: '100000', currency },
      sign: MoneySign.POSITIVE,
    }),
  },
  currentBalance: {
    amount: '100000',
    currency,
    sign: MoneySign.POSITIVE,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { amount: '100000', currency },
      sign: MoneySign.POSITIVE,
    }),
  },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  toObject: jest.fn().mockReturnValue({
    id,
    userId: mockUserId,
    name: `Account ${id}`,
    type,
    subType: null,
    mask: '1234',
    externalAccountId: bankLinkId ? 'ext-123' : null,
    bankLinkId,
    bankLink: bankLinkId ? { id: bankLinkId } : null,
    availableBalance: {
      money: { amount: '100000', currency },
      sign: MoneySign.POSITIVE,
    },
    currentBalance: {
      money: { amount: '100000', currency },
      sign: MoneySign.POSITIVE,
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  }),
});

// Helper to create mock snapshot entity
const createMockSnapshotEntity = (
  accountId: string,
  snapshotDate: string,
  availableAmount: number | string,
  currentAmount: number | string,
  currency = 'USD',
  updatedAt = new Date('2024-01-01'),
) => ({
  id: `snapshot-${accountId}-${snapshotDate}`,
  accountId,
  userId: mockUserId,
  snapshotDate,
  snapshotType: BalanceSnapshotType.SYNC,
  availableBalance: {
    amount: String(availableAmount),
    currency,
    sign: MoneySign.POSITIVE,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { amount: String(availableAmount), currency },
      sign: MoneySign.POSITIVE,
    }),
  },
  currentBalance: {
    amount: String(currentAmount),
    currency,
    sign: MoneySign.POSITIVE,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { amount: String(currentAmount), currency },
      sign: MoneySign.POSITIVE,
    }),
  },
  createdAt: new Date('2024-01-01'),
  updatedAt,
  toObject: jest.fn(),
});

// Helper to create a mock query builder
const createMockQueryBuilder = (results: unknown[] = []) => ({
  distinctOn: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(results),
});

// Helper to create mock user with currency setting
const createMockUser = (currency = 'USD') => ({
  id: mockUserId,
  email: 'test@example.com',
  settings: { currency, timezone: 'UTC', hideZeroBalanceAccounts: false },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
});

describe('BalanceQueryService', () => {
  let service: BalanceQueryService;
  let mockAccountRepository: {
    manager: { transaction: jest.Mock; withRepository: jest.Mock };
    find: jest.Mock;
  };
  let mockSnapshotRepository: {
    find: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockCurrencyExchangeService: {
    getRatesForDateRange: jest.Mock;
  };
  let mockUserService: {
    findSettings: jest.Mock;
  };

  beforeEach(async () => {
    const manager = {
      transaction: jest.fn(async (_isolation, callback) => callback(manager)),
      withRepository: jest.fn((repository) => repository),
    };
    mockAccountRepository = {
      manager,
      find: jest.fn(),
    };
    mockSnapshotRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(createMockQueryBuilder([])),
    };
    mockCurrencyExchangeService = {
      getRatesForDateRange: jest.fn(),
    };
    mockUserService = {
      findSettings: jest.fn().mockResolvedValue(createMockUser('USD')),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceQueryService,
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: mockAccountRepository,
        },
        {
          provide: getRepositoryToken(BalanceSnapshotEntity),
          useValue: mockSnapshotRepository,
        },
        {
          provide: CurrencyExchangeService,
          useValue: mockCurrencyExchangeService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    service = module.get<BalanceQueryService>(BalanceQueryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSnapshotBalancesForDateRange', () => {
    it('should return balances for a single account with exact snapshot match', async () => {
      const accountEntity = createMockAccountEntity('acc-1');
      const snapshotEntity = createMockSnapshotEntity(
        'acc-1',
        '2024-01-15',
        95000,
        100000,
      );

      mockAccountRepository.find.mockResolvedValue([accountEntity]);
      mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);

      const result = await service.getSnapshotBalancesForDateRange(
        ['acc-1'],
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result).toHaveLength(1);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[0].balances['acc-1']).toBeDefined();
      expect(
        result[0].balances['acc-1'].availableBalance.balance.money.amount,
      ).toBe('95000');
      expect(
        result[0].balances['acc-1'].currentBalance.balance.money.amount,
      ).toBe('100000');
    });

    it('should return balances for multiple dates in range', async () => {
      const accountEntity = createMockAccountEntity('acc-1');
      const snapshotEntity = createMockSnapshotEntity(
        'acc-1',
        '2024-01-15',
        95000,
        100000,
      );

      mockAccountRepository.find.mockResolvedValue([accountEntity]);
      mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);

      const result = await service.getSnapshotBalancesForDateRange(
        ['acc-1'],
        '2024-01-15',
        '2024-01-17',
        mockUserId,
      );

      expect(result).toHaveLength(3);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[1].date).toBe('2024-01-16');
      expect(result[2].date).toBe('2024-01-17');
    });

    it('should use most recent snapshot before date when no exact match', async () => {
      const accountEntity = createMockAccountEntity('acc-1');
      // Snapshot on Jan 10, but querying Jan 15
      const snapshotEntity = createMockSnapshotEntity(
        'acc-1',
        '2024-01-10',
        90000,
        95000,
      );

      mockAccountRepository.find.mockResolvedValue([accountEntity]);
      mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);

      const result = await service.getSnapshotBalancesForDateRange(
        ['acc-1'],
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result).toHaveLength(1);
      // Should use the Jan 10 snapshot for Jan 15
      expect(
        result[0].balances['acc-1'].availableBalance.balance.money.amount,
      ).toBe('90000');
    });

    it('should include latestSyncedAt for forward-filled account balances', async () => {
      const accountEntity = createMockAccountEntity('acc-1');
      const latestSyncedAt = new Date('2024-01-10T12:00:00.000Z');
      const snapshotEntity = createMockSnapshotEntity(
        'acc-1',
        '2024-01-10',
        90000,
        95000,
        'USD',
        latestSyncedAt,
      );

      mockAccountRepository.find.mockResolvedValue([accountEntity]);
      mockSnapshotRepository.find.mockResolvedValue([]);
      const latestSyncQueryBuilder = createMockQueryBuilder([snapshotEntity]);
      const priorSnapshotQueryBuilder = createMockQueryBuilder([
        snapshotEntity,
      ]);
      mockSnapshotRepository.createQueryBuilder
        .mockReturnValueOnce(priorSnapshotQueryBuilder)
        .mockReturnValueOnce(latestSyncQueryBuilder);

      const result = await service.getSnapshotBalancesForDateRange(
        ['acc-1'],
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result[0].balances['acc-1'].syncedAt).toBeUndefined();
      expect(result[0].balances['acc-1'].latestSyncedAt).toBe(latestSyncedAt);
      expect(latestSyncQueryBuilder.distinctOn).toHaveBeenCalledWith([
        'snapshot.accountId',
      ]);
      expect(latestSyncQueryBuilder.addOrderBy).toHaveBeenCalledWith(
        'snapshot.updatedAt',
        'DESC',
      );
    });

    it('should return zero balances when no snapshots exist', async () => {
      const accountEntity = createMockAccountEntity('acc-1');

      mockAccountRepository.find.mockResolvedValue([accountEntity]);
      mockSnapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSnapshotBalancesForDateRange(
        ['acc-1'],
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result).toHaveLength(1);
      expect(
        result[0].balances['acc-1'].availableBalance.balance.money.amount,
      ).toBe('0');
      expect(
        result[0].balances['acc-1'].currentBalance.balance.money.amount,
      ).toBe('0');
    });

    it('should handle multiple accounts', async () => {
      const accountEntity1 = createMockAccountEntity('acc-1');
      const accountEntity2 = createMockAccountEntity('acc-2');
      const snapshotEntity1 = createMockSnapshotEntity(
        'acc-1',
        '2024-01-15',
        95000,
        100000,
      );
      const snapshotEntity2 = createMockSnapshotEntity(
        'acc-2',
        '2024-01-15',
        200000,
        210000,
      );

      mockAccountRepository.find.mockResolvedValue([
        accountEntity1,
        accountEntity2,
      ]);
      mockSnapshotRepository.find.mockResolvedValue([
        snapshotEntity1,
        snapshotEntity2,
      ]);

      const result = await service.getSnapshotBalancesForDateRange(
        ['acc-1', 'acc-2'],
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result).toHaveLength(1);
      expect(result[0].balances['acc-1']).toBeDefined();
      expect(result[0].balances['acc-2']).toBeDefined();
      expect(
        result[0].balances['acc-1'].availableBalance.balance.money.amount,
      ).toBe('95000');
      expect(
        result[0].balances['acc-2'].availableBalance.balance.money.amount,
      ).toBe('200000');
    });

    it('should skip accounts not found or not owned', async () => {
      const accountEntity = createMockAccountEntity('acc-1');

      // Only acc-1 found, acc-2 not in result (not owned by user)
      mockAccountRepository.find.mockResolvedValue([accountEntity]);
      mockSnapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSnapshotBalancesForDateRange(
        ['acc-1', 'acc-2'],
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result).toHaveLength(1);
      expect(result[0].balances['acc-1']).toBeDefined();
      expect(result[0].balances['acc-2']).toBeUndefined();
    });

    it('should return empty array when no accounts found', async () => {
      mockAccountRepository.find.mockResolvedValue([]);
      mockSnapshotRepository.find.mockResolvedValue([]);

      const result = await service.getSnapshotBalancesForDateRange(
        ['acc-1'],
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result).toEqual([]);
    });

    describe('effectiveBalance calculation', () => {
      it('should use availableBalance for depository accounts', async () => {
        const accountEntity = createMockAccountEntity(
          'acc-1',
          AccountType.Depository,
        );
        const snapshotEntity = createMockSnapshotEntity(
          'acc-1',
          '2024-01-15',
          95000, // available
          100000, // current
        );

        mockAccountRepository.find.mockResolvedValue([accountEntity]);
        mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);

        const result = await service.getSnapshotBalancesForDateRange(
          ['acc-1'],
          '2024-01-15',
          '2024-01-15',
          mockUserId,
        );

        // effectiveBalance should equal currentBalance for depository
        expect(
          result[0].balances['acc-1'].effectiveBalance.balance.money.amount,
        ).toBe('100000');
      });

      it('should use currentBalance for investment accounts', async () => {
        const accountEntity = createMockAccountEntity(
          'acc-1',
          AccountType.Investment,
        );
        const snapshotEntity = createMockSnapshotEntity(
          'acc-1',
          '2024-01-15',
          50000, // available
          100000, // current
        );

        mockAccountRepository.find.mockResolvedValue([accountEntity]);
        mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);

        const result = await service.getSnapshotBalancesForDateRange(
          ['acc-1'],
          '2024-01-15',
          '2024-01-15',
          mockUserId,
        );

        // effectiveBalance should equal currentBalance for investment
        expect(
          result[0].balances['acc-1'].effectiveBalance.balance.money.amount,
        ).toBe('100000');
      });

      it('should use currentBalance for brokerage accounts', async () => {
        const accountEntity = createMockAccountEntity(
          'acc-1',
          AccountType.Brokerage,
        );
        const snapshotEntity = createMockSnapshotEntity(
          'acc-1',
          '2024-01-15',
          30000, // available
          70000, // current
        );

        mockAccountRepository.find.mockResolvedValue([accountEntity]);
        mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);

        const result = await service.getSnapshotBalancesForDateRange(
          ['acc-1'],
          '2024-01-15',
          '2024-01-15',
          mockUserId,
        );

        // effectiveBalance should equal currentBalance for brokerage
        expect(
          result[0].balances['acc-1'].effectiveBalance.balance.money.amount,
        ).toBe('70000');
      });
    });

    describe('currency conversion', () => {
      it('should convert balances when user currency differs from account currency', async () => {
        const accountEntity = createMockAccountEntity(
          'acc-1',
          AccountType.Depository,
          'EUR',
        );
        const snapshotEntity = createMockSnapshotEntity(
          'acc-1',
          '2024-01-15',
          100000,
          100000,
          'EUR',
        );

        // User's preferred currency is USD
        mockUserService.findSettings.mockResolvedValue(createMockUser('USD'));
        mockAccountRepository.find.mockResolvedValue([accountEntity]);
        mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);
        mockCurrencyExchangeService.getRatesForDateRange.mockResolvedValue([
          {
            date: '2024-01-15',
            rates: [
              {
                baseCurrency: 'EUR',
                targetCurrency: 'USD',
                rate: '1.1',
                ratio: decimalRateRatio('1.1'),
                source: 'DB',
              },
            ],
          },
        ]);

        const result = await service.getSnapshotBalancesForDateRange(
          ['acc-1'],
          '2024-01-15',
          '2024-01-15',
          mockUserId,
        );

        expect(
          result[0].balances['acc-1'].availableBalance.convertedBalance,
        ).toBeDefined();
        expect(
          result[0].balances['acc-1'].availableBalance.convertedBalance?.money
            .amount,
        ).toBe(
          '110000', // 100000 * 1.1
        );
        expect(
          result[0].balances['acc-1'].availableBalance.convertedBalance?.money
            .currency,
        ).toBe('USD');
        expect(
          result[0].balances['acc-1'].availableBalance.exchangeRate,
        ).toEqual({
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: '1.1',
          ratio: decimalRateRatio('1.1'),
          source: 'DB',
        });
      });

      it('should not convert when account currency matches user currency', async () => {
        const accountEntity = createMockAccountEntity(
          'acc-1',
          AccountType.Depository,
          'USD',
        );
        const snapshotEntity = createMockSnapshotEntity(
          'acc-1',
          '2024-01-15',
          100000,
          100000,
          'USD',
        );

        // User's preferred currency is USD (same as account)
        mockUserService.findSettings.mockResolvedValue(createMockUser('USD'));
        mockAccountRepository.find.mockResolvedValue([accountEntity]);
        mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);

        const result = await service.getSnapshotBalancesForDateRange(
          ['acc-1'],
          '2024-01-15',
          '2024-01-15',
          mockUserId,
        );

        // Should not have conversion since currency already matches
        expect(
          result[0].balances['acc-1'].availableBalance.convertedBalance,
        ).toBeUndefined();
        expect(
          result[0].balances['acc-1'].availableBalance.exchangeRate,
        ).toBeUndefined();
        // Exchange rate service should not be called for same-currency
        expect(
          mockCurrencyExchangeService.getRatesForDateRange,
        ).not.toHaveBeenCalled();
      });

      it('uses a prior snapshot currency after a manual account currency change', async () => {
        const accountEntity = createMockAccountEntity(
          'acc-1',
          AccountType.Depository,
          'USD',
          null,
        );
        const priorSnapshot = createMockSnapshotEntity(
          'acc-1',
          '2024-01-14',
          100000,
          100000,
          'EUR',
        );

        mockUserService.findSettings.mockResolvedValue(createMockUser('USD'));
        mockAccountRepository.find.mockResolvedValue([accountEntity]);
        mockSnapshotRepository.find.mockResolvedValue([]);
        mockSnapshotRepository.createQueryBuilder
          .mockReturnValueOnce(createMockQueryBuilder([priorSnapshot]))
          .mockReturnValueOnce(createMockQueryBuilder([priorSnapshot]));
        mockCurrencyExchangeService.getRatesForDateRange.mockResolvedValue([
          {
            date: '2024-01-15',
            rates: [
              {
                baseCurrency: 'EUR',
                targetCurrency: 'USD',
                rate: '1.1',
                ratio: decimalRateRatio('1.1'),
                source: 'DB',
              },
            ],
          },
        ]);

        const result = await service.getSnapshotBalancesForDateRange(
          ['acc-1'],
          '2024-01-15',
          '2024-01-15',
          mockUserId,
        );

        expect(
          mockCurrencyExchangeService.getRatesForDateRange,
        ).toHaveBeenCalledWith(
          [{ baseCurrency: 'EUR', targetCurrency: 'USD' }],
          '2024-01-15',
          '2024-01-15',
          mockAccountRepository.manager,
        );
        expect(
          result[0].balances['acc-1'].effectiveBalance.convertedBalance,
        ).toEqual({
          money: { amount: '110000', currency: 'USD' },
          sign: MoneySign.POSITIVE,
        });
      });

      it('ignores a prior currency shadowed by an exact start-date snapshot', async () => {
        const usdAccount = createMockAccountEntity(
          'acc-usd',
          AccountType.Depository,
          'USD',
        );
        const gbpAccount = createMockAccountEntity(
          'acc-gbp',
          AccountType.Depository,
          'GBP',
        );
        const unusedPriorEurSnapshot = createMockSnapshotEntity(
          'acc-usd',
          '2024-01-14',
          100000,
          100000,
          'EUR',
        );
        const exactStartUsdSnapshot = createMockSnapshotEntity(
          'acc-usd',
          '2024-01-15',
          100000,
          100000,
          'USD',
        );
        const exactStartGbpSnapshot = createMockSnapshotEntity(
          'acc-gbp',
          '2024-01-15',
          100000,
          100000,
          'GBP',
        );

        mockUserService.findSettings.mockResolvedValue(createMockUser('USD'));
        mockAccountRepository.find.mockResolvedValue([usdAccount, gbpAccount]);
        mockSnapshotRepository.find.mockResolvedValue([
          exactStartUsdSnapshot,
          exactStartGbpSnapshot,
        ]);
        mockSnapshotRepository.createQueryBuilder
          .mockReturnValueOnce(
            createMockQueryBuilder([
              exactStartUsdSnapshot,
              exactStartGbpSnapshot,
            ]),
          )
          .mockReturnValueOnce(
            createMockQueryBuilder([unusedPriorEurSnapshot]),
          );
        mockCurrencyExchangeService.getRatesForDateRange.mockResolvedValue([
          {
            date: '2024-01-15',
            rates: [
              {
                baseCurrency: 'GBP',
                targetCurrency: 'USD',
                rate: '1.25',
                ratio: decimalRateRatio('1.25'),
                source: 'DB',
              },
            ],
          },
        ]);

        const result = await service.getSnapshotBalancesForDateRange(
          ['acc-usd', 'acc-gbp'],
          '2024-01-15',
          '2024-01-15',
          mockUserId,
        );

        expect(
          mockCurrencyExchangeService.getRatesForDateRange,
        ).toHaveBeenCalledWith(
          [{ baseCurrency: 'GBP', targetCurrency: 'USD' }],
          '2024-01-15',
          '2024-01-15',
          mockAccountRepository.manager,
        );
        expect(
          result[0].balances['acc-usd'].effectiveBalance.convertedBalance,
        ).toBeUndefined();
        expect(
          result[0].balances['acc-gbp'].effectiveBalance.convertedBalance,
        ).toEqual({
          money: { amount: '125000', currency: 'USD' },
          sign: MoneySign.POSITIVE,
        });
      });

      it('fails the whole multi-account query when one required pair is missing', async () => {
        const eurAccount = createMockAccountEntity(
          'acc-eur',
          AccountType.Depository,
          'EUR',
        );
        const gbpAccount = createMockAccountEntity(
          'acc-gbp',
          AccountType.Depository,
          'GBP',
        );
        const eurSnapshot = createMockSnapshotEntity(
          'acc-eur',
          '2024-01-15',
          100000,
          100000,
          'EUR',
        );
        const gbpSnapshot = createMockSnapshotEntity(
          'acc-gbp',
          '2024-01-15',
          100000,
          100000,
          'GBP',
        );

        mockUserService.findSettings.mockResolvedValue(createMockUser('USD'));
        mockAccountRepository.find
          .mockResolvedValueOnce([eurAccount, gbpAccount])
          .mockResolvedValueOnce([eurAccount, gbpAccount]);
        mockSnapshotRepository.find.mockResolvedValue([
          eurSnapshot,
          gbpSnapshot,
        ]);
        mockCurrencyExchangeService.getRatesForDateRange.mockResolvedValue([
          {
            date: '2024-01-15',
            rates: [
              {
                baseCurrency: 'EUR',
                targetCurrency: 'USD',
                rate: '1.1',
                ratio: decimalRateRatio('1.1'),
                source: 'DB',
              },
            ],
          },
        ]);

        await expect(
          service.getAllBalancesForDateRange(
            '2024-01-15',
            '2024-01-15',
            mockUserId,
          ),
        ).rejects.toThrow(
          'Required exchange rate is unavailable for GBP to USD on 2024-01-15',
        );
        expect(
          mockCurrencyExchangeService.getRatesForDateRange,
        ).toHaveBeenCalledWith(
          [
            { baseCurrency: 'EUR', targetCurrency: 'USD' },
            { baseCurrency: 'GBP', targetCurrency: 'USD' },
          ],
          '2024-01-15',
          '2024-01-15',
          mockAccountRepository.manager,
        );
      });

      it('should fail closed when a required exchange rate cannot be loaded', async () => {
        const accountEntity = createMockAccountEntity(
          'acc-1',
          AccountType.Depository,
          'EUR',
        );
        const snapshotEntity = createMockSnapshotEntity(
          'acc-1',
          '2024-01-15',
          100000,
          100000,
          'EUR',
        );

        // User's preferred currency is USD
        mockUserService.findSettings.mockResolvedValue(createMockUser('USD'));
        mockAccountRepository.find.mockResolvedValue([accountEntity]);
        mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);
        mockCurrencyExchangeService.getRatesForDateRange.mockRejectedValue(
          new Error('Rate not found'),
        );

        await expect(
          service.getSnapshotBalancesForDateRange(
            ['acc-1'],
            '2024-01-15',
            '2024-01-15',
            mockUserId,
          ),
        ).rejects.toThrow(
          'Required exchange rate is unavailable for EUR to USD on 2024-01-15',
        );
      });

      it('converts an exact zero without requiring an exchange rate', async () => {
        const accountEntity = createMockAccountEntity(
          'acc-1',
          AccountType.Depository,
          'EUR',
        );
        const snapshotEntity = createMockSnapshotEntity(
          'acc-1',
          '2024-01-15',
          0,
          0,
          'EUR',
        );

        mockUserService.findSettings.mockResolvedValue(createMockUser('USD'));
        mockAccountRepository.find.mockResolvedValue([accountEntity]);
        mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);
        mockCurrencyExchangeService.getRatesForDateRange.mockRejectedValue(
          new Error('Rate not found'),
        );

        const result = await service.getSnapshotBalancesForDateRange(
          ['acc-1'],
          '2024-01-15',
          '2024-01-15',
          mockUserId,
        );

        expect(
          result[0].balances['acc-1'].effectiveBalance.convertedBalance,
        ).toEqual({
          money: { amount: '0', currency: 'USD' },
          sign: MoneySign.POSITIVE,
        });
        expect(
          mockCurrencyExchangeService.getRatesForDateRange,
        ).not.toHaveBeenCalled();
      });

      it('should correctly handle conversion between currencies with different decimals (ETH to SGD)', async () => {
        const accountEntity = createMockAccountEntity(
          'acc-1',
          AccountType.Depository,
          'ETH',
        );
        // 1 ETH = 10^18 wei
        const ethAmount = '1000000000000000000';
        const snapshotEntity = createMockSnapshotEntity(
          'acc-1',
          '2024-01-15',
          ethAmount,
          ethAmount,
          'ETH',
        );

        // User's preferred currency is SGD (2 decimals)
        mockUserService.findSettings.mockResolvedValue(createMockUser('SGD'));
        mockAccountRepository.find.mockResolvedValue([accountEntity]);
        mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);

        // Exchange rate: 1 ETH = 3000 SGD
        mockCurrencyExchangeService.getRatesForDateRange.mockResolvedValue([
          {
            date: '2024-01-15',
            rates: [
              {
                baseCurrency: 'ETH',
                targetCurrency: 'SGD',
                rate: '3000',
                ratio: decimalRateRatio('3000'),
                source: 'DB',
              },
            ],
          },
        ]);

        const result = await service.getSnapshotBalancesForDateRange(
          ['acc-1'],
          '2024-01-15',
          '2024-01-15',
          mockUserId,
        );

        expect(
          result[0].balances['acc-1'].availableBalance.convertedBalance,
        ).toBeDefined();

        // Calculation:
        // 1.0 ETH (from 10^18 wei) * 3000 Rate = 3000.0 SGD
        // 3000.0 SGD in cents (2 decimals) = 300000
        expect(
          result[0].balances['acc-1'].availableBalance.convertedBalance?.money
            .amount,
        ).toBe('300000');

        expect(
          result[0].balances['acc-1'].availableBalance.convertedBalance?.money
            .currency,
        ).toBe('SGD');
      });
    });

    describe('snapshot fill-forward logic', () => {
      it('should use most recent snapshot for subsequent dates', async () => {
        const accountEntity = createMockAccountEntity('acc-1');
        // Snapshot on Jan 10 with balance 100k
        const snapshot1 = createMockSnapshotEntity(
          'acc-1',
          '2024-01-10',
          100000,
          100000,
        );
        // Snapshot on Jan 12 with balance 150k
        const snapshot2 = createMockSnapshotEntity(
          'acc-1',
          '2024-01-12',
          150000,
          150000,
        );

        mockAccountRepository.find.mockResolvedValue([accountEntity]);
        mockSnapshotRepository.find.mockResolvedValue([snapshot1, snapshot2]);

        const result = await service.getSnapshotBalancesForDateRange(
          ['acc-1'],
          '2024-01-10',
          '2024-01-14',
          mockUserId,
        );

        expect(result).toHaveLength(5);
        // Jan 10: exact match to snapshot1
        expect(
          result[0].balances['acc-1'].availableBalance.balance.money.amount,
        ).toBe('100000');
        // Jan 11: fill-forward from snapshot1
        expect(
          result[1].balances['acc-1'].availableBalance.balance.money.amount,
        ).toBe('100000');
        // Jan 12: exact match to snapshot2
        expect(
          result[2].balances['acc-1'].availableBalance.balance.money.amount,
        ).toBe('150000');
        // Jan 13-14: fill-forward from snapshot2
        expect(
          result[3].balances['acc-1'].availableBalance.balance.money.amount,
        ).toBe('150000');
        expect(
          result[4].balances['acc-1'].availableBalance.balance.money.amount,
        ).toBe('150000');
      });
    });
  });

  describe('getBalancesForDateRange', () => {
    it('should route linked accounts to getSnapshotBalancesForDateRange', async () => {
      const linkedAccount = createMockAccountEntity(
        'acc-1',
        AccountType.Depository,
        'USD',
        'bank-link-123',
      );
      const snapshotEntity = createMockSnapshotEntity(
        'acc-1',
        '2024-01-15',
        95000,
        100000,
      );

      mockAccountRepository.find.mockResolvedValue([linkedAccount]);
      mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);

      const result = await service.getBalancesForDateRange(
        ['acc-1'],
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result).toHaveLength(1);
      expect(result[0].balances['acc-1']).toBeDefined();
      expect(
        result[0].balances['acc-1'].availableBalance.balance.money.amount,
      ).toBe('95000');
    });
  });

  describe('getAllBalancesForDateRange', () => {
    it('should fetch all linked accounts and return balances', async () => {
      const linkedAccount1 = createMockAccountEntity(
        'acc-1',
        AccountType.Depository,
        'USD',
        'bank-link-123',
      );
      const linkedAccount2 = createMockAccountEntity(
        'acc-2',
        AccountType.Depository,
        'USD',
        'bank-link-456',
      );
      const snapshotEntity1 = createMockSnapshotEntity(
        'acc-1',
        '2024-01-15',
        95000,
        100000,
      );
      const snapshotEntity2 = createMockSnapshotEntity(
        'acc-2',
        '2024-01-15',
        200000,
        210000,
      );

      // First call: getAllBalancesForDateRange fetches linked accounts
      // Second call: getSnapshotBalancesForDateRange fetches by IDs
      mockAccountRepository.find
        .mockResolvedValueOnce([linkedAccount1, linkedAccount2]) // getAllBalancesForDateRange
        .mockResolvedValueOnce([linkedAccount1, linkedAccount2]); // getSnapshotBalancesForDateRange
      mockSnapshotRepository.find.mockResolvedValue([
        snapshotEntity1,
        snapshotEntity2,
      ]);

      const result = await service.getAllBalancesForDateRange(
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result).toHaveLength(1);
      expect(result[0].balances['acc-1']).toBeDefined();
      expect(result[0].balances['acc-2']).toBeDefined();
    });

    it('should return empty array when no linked accounts exist', async () => {
      mockAccountRepository.find.mockResolvedValue([]);

      const result = await service.getAllBalancesForDateRange(
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result).toEqual([]);
    });

    it('should include all accounts including manual ones', async () => {
      const linkedAccount = createMockAccountEntity(
        'acc-1',
        AccountType.Depository,
        'USD',
        'bank-link-123',
      );
      const manualAccount = createMockAccountEntity(
        'acc-2',
        AccountType.Depository,
        'USD',
        null,
      );
      const snapshotEntity = createMockSnapshotEntity(
        'acc-1',
        '2024-01-15',
        95000,
        100000,
      );

      mockAccountRepository.find
        .mockResolvedValueOnce([linkedAccount, manualAccount]) // getAllBalancesForDateRange
        .mockResolvedValueOnce([linkedAccount, manualAccount]); // getSnapshotBalancesForDateRange
      mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);

      const result = await service.getAllBalancesForDateRange(
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result).toHaveLength(1);
      // Verify the query fetches all accounts (no bankLinkId filter)
      expect(mockAccountRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId },
        }),
      );
    });
  });
});
