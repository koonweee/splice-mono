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
    amount: 100000,
    currency,
    sign: MoneySign.POSITIVE,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { amount: 100000, currency },
      sign: MoneySign.POSITIVE,
    }),
  },
  currentBalance: {
    amount: 100000,
    currency,
    sign: MoneySign.POSITIVE,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { amount: 100000, currency },
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
      money: { amount: 100000, currency },
      sign: MoneySign.POSITIVE,
    },
    currentBalance: {
      money: { amount: 100000, currency },
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
  availableAmount: number,
  currentAmount: number,
  currency = 'USD',
) => ({
  id: `snapshot-${accountId}-${snapshotDate}`,
  accountId,
  userId: mockUserId,
  snapshotDate,
  snapshotType: BalanceSnapshotType.SYNC,
  availableBalance: {
    amount: availableAmount,
    currency,
    sign: MoneySign.POSITIVE,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { amount: availableAmount, currency },
      sign: MoneySign.POSITIVE,
    }),
  },
  currentBalance: {
    amount: currentAmount,
    currency,
    sign: MoneySign.POSITIVE,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { amount: currentAmount, currency },
      sign: MoneySign.POSITIVE,
    }),
  },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
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
  settings: { currency, timezone: 'UTC' },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
});

describe('BalanceQueryService', () => {
  let service: BalanceQueryService;
  let mockAccountRepository: {
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
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    mockAccountRepository = {
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
      findOne: jest.fn().mockResolvedValue(createMockUser('USD')),
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
      ).toBe(95000);
      expect(
        result[0].balances['acc-1'].currentBalance.balance.money.amount,
      ).toBe(100000);
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
      ).toBe(90000);
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
      ).toBe(0);
      expect(
        result[0].balances['acc-1'].currentBalance.balance.money.amount,
      ).toBe(0);
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
      ).toBe(95000);
      expect(
        result[0].balances['acc-2'].availableBalance.balance.money.amount,
      ).toBe(200000);
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
        ).toBe(100000);
      });

      it('should sum available + current for investment accounts', async () => {
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

        // effectiveBalance should be available + current for investment
        expect(
          result[0].balances['acc-1'].effectiveBalance.balance.money.amount,
        ).toBe(150000);
      });

      it('should sum available + current for brokerage accounts', async () => {
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

        // effectiveBalance should be available + current for brokerage
        expect(
          result[0].balances['acc-1'].effectiveBalance.balance.money.amount,
        ).toBe(100000);
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
        mockUserService.findOne.mockResolvedValue(createMockUser('USD'));
        mockAccountRepository.find.mockResolvedValue([accountEntity]);
        mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);
        mockCurrencyExchangeService.getRatesForDateRange.mockResolvedValue([
          {
            date: '2024-01-15',
            rates: [
              {
                baseCurrency: 'EUR',
                targetCurrency: 'USD',
                rate: 1.1,
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
          110000, // 100000 * 1.1
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
          rate: 1.1,
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
        mockUserService.findOne.mockResolvedValue(createMockUser('USD'));
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

      it('should handle exchange rate service errors gracefully', async () => {
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
        mockUserService.findOne.mockResolvedValue(createMockUser('USD'));
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

        // Should still return results without conversion
        expect(result).toHaveLength(1);
        expect(
          result[0].balances['acc-1'].availableBalance.balance,
        ).toBeDefined();
        expect(
          result[0].balances['acc-1'].availableBalance.convertedBalance,
        ).toBeUndefined();
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
        ).toBe(100000);
        // Jan 11: fill-forward from snapshot1
        expect(
          result[1].balances['acc-1'].availableBalance.balance.money.amount,
        ).toBe(100000);
        // Jan 12: exact match to snapshot2
        expect(
          result[2].balances['acc-1'].availableBalance.balance.money.amount,
        ).toBe(150000);
        // Jan 13-14: fill-forward from snapshot2
        expect(
          result[3].balances['acc-1'].availableBalance.balance.money.amount,
        ).toBe(150000);
        expect(
          result[4].balances['acc-1'].availableBalance.balance.money.amount,
        ).toBe(150000);
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
      ).toBe(95000);
    });

    it('should throw BadRequestException for manual accounts', async () => {
      const manualAccount = createMockAccountEntity(
        'acc-1',
        AccountType.Depository,
        'USD',
        null, // No bankLinkId = manual account
      );

      mockAccountRepository.find.mockResolvedValue([manualAccount]);

      await expect(
        service.getBalancesForDateRange(
          ['acc-1'],
          '2024-01-15',
          '2024-01-15',
          mockUserId,
        ),
      ).rejects.toThrow('Manual accounts are not yet supported');
    });

    it('should throw BadRequestException when mix of linked and manual accounts', async () => {
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

      mockAccountRepository.find.mockResolvedValue([
        linkedAccount,
        manualAccount,
      ]);

      await expect(
        service.getBalancesForDateRange(
          ['acc-1', 'acc-2'],
          '2024-01-15',
          '2024-01-15',
          mockUserId,
        ),
      ).rejects.toThrow('Manual accounts are not yet supported');
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

    it('should exclude manual accounts from results', async () => {
      // Only linked accounts should be fetched (query uses Not(IsNull()) on bankLinkId)
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

      mockAccountRepository.find
        .mockResolvedValueOnce([linkedAccount]) // getAllBalancesForDateRange - only linked
        .mockResolvedValueOnce([linkedAccount]); // getSnapshotBalancesForDateRange
      mockSnapshotRepository.find.mockResolvedValue([snapshotEntity]);

      const result = await service.getAllBalancesForDateRange(
        '2024-01-15',
        '2024-01-15',
        mockUserId,
      );

      expect(result).toHaveLength(1);
      // Verify the query included Not(IsNull()) on bankLinkId
      expect(mockAccountRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            bankLinkId: expect.anything(), // Not(IsNull())
          }),
        }),
      );
    });
  });
});
