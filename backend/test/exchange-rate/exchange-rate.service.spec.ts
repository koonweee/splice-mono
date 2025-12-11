import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { ExchangeRateBackfillHelper } from '../../src/exchange-rate/exchange-rate-backfill.helper';
import { ExchangeRateEntity } from '../../src/exchange-rate/exchange-rate.entity';
import { ExchangeRateService } from '../../src/exchange-rate/exchange-rate.service';
import { UserEntity } from '../../src/user/user.entity';
import { mockExchangeRateRepository } from '../mocks/exchange-rate/exchange-rate-repository.mock';

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  let repository: typeof mockExchangeRateRepository;
  let userRepository: any;
  let accountRepository: any;
  let backfillHelper: any;

  beforeEach(async () => {
    userRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    accountRepository = {
      find: jest.fn(),
    };

    backfillHelper = {
      getExistingRateKeys: jest.fn().mockResolvedValue(new Set()),
      fetchExchangeRates: jest.fn().mockResolvedValue(new Map()),
      upsertRate: jest.fn(),
    };

    // Reset repository mocks
    mockExchangeRateRepository.find.mockReset();
    mockExchangeRateRepository.findOne.mockReset();
    mockExchangeRateRepository.save.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRateService,
        {
          provide: getRepositoryToken(ExchangeRateEntity),
          useValue: mockExchangeRateRepository,
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: accountRepository,
        },
        {
          provide: ExchangeRateBackfillHelper,
          useValue: backfillHelper,
        },
      ],
    }).compile();

    service = module.get<ExchangeRateService>(ExchangeRateService);
    repository = module.get(getRepositoryToken(ExchangeRateEntity));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getRatesForDateRange', () => {
    it('should return empty array for empty pairs', async () => {
      const result = await service.getRatesForDateRange(
        [],
        '2024-01-01',
        '2024-01-03',
      );

      expect(result).toEqual([]);
      expect(repository.find).not.toHaveBeenCalled();
    });

    it('should return rates from DB with source DB', async () => {
      const mockEntities = [
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: 1.08,
          rateDate: '2024-01-01',
        },
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: 1.09,
          rateDate: '2024-01-02',
        },
      ];
      repository.find.mockResolvedValueOnce(mockEntities);

      const result = await service.getRatesForDateRange(
        [{ baseCurrency: 'EUR', targetCurrency: 'USD' }],
        '2024-01-01',
        '2024-01-02',
      );

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2024-01-01');
      expect(result[0].rates[0].source).toBe('DB');
      expect(result[0].rates[0].rate).toBe(1.08);
      expect(result[1].date).toBe('2024-01-02');
      expect(result[1].rates[0].source).toBe('DB');
      expect(result[1].rates[0].rate).toBe(1.09);
    });

    it('should fill missing dates with FILLED source', async () => {
      // Only have rate for day 1 and 3, missing day 2
      const mockEntities = [
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: 1.08,
          rateDate: '2024-01-01',
        },
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: 1.1,
          rateDate: '2024-01-03',
        },
      ];
      repository.find.mockResolvedValueOnce(mockEntities);

      const result = await service.getRatesForDateRange(
        [{ baseCurrency: 'EUR', targetCurrency: 'USD' }],
        '2024-01-01',
        '2024-01-03',
      );

      expect(result).toHaveLength(3);
      expect(result[0].rates[0].source).toBe('DB');
      expect(result[1].date).toBe('2024-01-02');
      expect(result[1].rates[0].source).toBe('FILLED');
      expect(result[1].rates[0].rate).toBe(1.08); // Forward-filled from Jan 1
      expect(result[2].rates[0].source).toBe('DB');
    });

    it('should throw error when no rate exists for a pair', async () => {
      // No rates for EUR->USD in DB
      repository.find.mockResolvedValueOnce([]);

      await expect(
        service.getRatesForDateRange(
          [{ baseCurrency: 'EUR', targetCurrency: 'USD' }],
          '2024-01-01',
          '2024-01-01',
        ),
      ).rejects.toThrow('No exchange rate found for pair EUR→USD');
    });

    it('should handle inverse rate lookup (USD->EUR when EUR->USD stored)', async () => {
      const mockEntities = [
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: 1.08, // 1 EUR = 1.08 USD
          rateDate: '2024-01-01',
        },
      ];
      repository.find.mockResolvedValueOnce(mockEntities);

      // Request USD->EUR (inverse of what's stored)
      const result = await service.getRatesForDateRange(
        [{ baseCurrency: 'USD', targetCurrency: 'EUR' }],
        '2024-01-01',
        '2024-01-01',
      );

      expect(result).toHaveLength(1);
      expect(result[0].rates[0].baseCurrency).toBe('USD');
      expect(result[0].rates[0].targetCurrency).toBe('EUR');
      expect(result[0].rates[0].rate).toBeCloseTo(1 / 1.08, 5);
    });

    it('should handle multiple currency pairs', async () => {
      const mockEntities = [
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: 1.08,
          rateDate: '2024-01-01',
        },
        {
          baseCurrency: 'GBP',
          targetCurrency: 'USD',
          rate: 1.27,
          rateDate: '2024-01-01',
        },
      ];
      repository.find.mockResolvedValueOnce(mockEntities);

      const result = await service.getRatesForDateRange(
        [
          { baseCurrency: 'EUR', targetCurrency: 'USD' },
          { baseCurrency: 'GBP', targetCurrency: 'USD' },
        ],
        '2024-01-01',
        '2024-01-01',
      );

      expect(result).toHaveLength(1);
      expect(result[0].rates).toHaveLength(2);
      expect(result[0].rates[0].baseCurrency).toBe('EUR');
      expect(result[0].rates[1].baseCurrency).toBe('GBP');
    });

    it('should fill from next known rate when no prior rate exists', async () => {
      // Only have rate for day 2, not day 1
      const mockEntities = [
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: 1.1,
          rateDate: '2024-01-02',
        },
      ];
      repository.find.mockResolvedValueOnce(mockEntities);

      const result = await service.getRatesForDateRange(
        [{ baseCurrency: 'EUR', targetCurrency: 'USD' }],
        '2024-01-01',
        '2024-01-02',
      );

      expect(result[0].date).toBe('2024-01-01');
      expect(result[0].rates[0].source).toBe('FILLED');
      expect(result[0].rates[0].rate).toBe(1.1); // Back-filled from Jan 2
      expect(result[1].rates[0].source).toBe('DB');
    });
  });

  describe('getRequiredCurrencyPairs', () => {
    it('should return unique normalized currency pairs', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', settings: { currency: 'USD' } },
        { id: 'user-2', settings: { currency: 'GBP' } },
      ]);

      // User 1 has EUR and GBP accounts, but user currency is USD
      // User 2 has EUR account, but user currency is GBP
      accountRepository.find
        .mockResolvedValueOnce([
          {
            id: 'acc-1',
            currentBalance: {
              currency: 'EUR',
              amount: 10000,
              sign: 'positive',
            },
          },
          {
            id: 'acc-2',
            currentBalance: {
              currency: 'GBP',
              amount: 20000,
              sign: 'positive',
            },
          },
          {
            id: 'acc-3',
            currentBalance: {
              currency: 'USD',
              amount: 30000,
              sign: 'positive',
            },
          }, // Same as user, should skip
        ])
        .mockResolvedValueOnce([
          {
            id: 'acc-4',
            currentBalance: {
              currency: 'EUR',
              amount: 40000,
              sign: 'positive',
            },
          },
          {
            id: 'acc-5',
            currentBalance: {
              currency: 'GBP',
              amount: 50000,
              sign: 'positive',
            },
          }, // Same as user, should skip
        ]);

      const result = await service.getRequiredCurrencyPairs();

      // All pairs should be normalized (alphabetically sorted)
      expect(result).toHaveLength(3);
      expect(result).toContainEqual({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
      });
      expect(result).toContainEqual({
        baseCurrency: 'GBP',
        targetCurrency: 'USD',
      });
      expect(result).toContainEqual({
        baseCurrency: 'EUR',
        targetCurrency: 'GBP',
      });
    });

    it('should return empty array when no users have accounts', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', settings: { currency: 'USD' } },
      ]);
      accountRepository.find.mockResolvedValue([]);

      const result = await service.getRequiredCurrencyPairs();

      expect(result).toEqual([]);
    });

    it('should skip accounts with same currency as user', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', settings: { currency: 'USD' } },
      ]);
      accountRepository.find.mockResolvedValue([
        {
          id: 'acc-1',
          currentBalance: { currency: 'USD', amount: 10000, sign: 'positive' },
        },
      ]);

      const result = await service.getRequiredCurrencyPairs();

      expect(result).toEqual([]);
    });

    it('should deduplicate currency pairs across users', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', settings: { currency: 'USD' } },
        { id: 'user-2', settings: { currency: 'USD' } },
      ]);

      // Both users have EUR accounts with USD as their currency
      accountRepository.find
        .mockResolvedValueOnce([
          {
            id: 'acc-1',
            currentBalance: {
              currency: 'EUR',
              amount: 10000,
              sign: 'positive',
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'acc-2',
            currentBalance: {
              currency: 'EUR',
              amount: 20000,
              sign: 'positive',
            },
          },
        ]);

      const result = await service.getRequiredCurrencyPairs();

      // Should only have one EUR->USD pair, not two
      expect(result).toHaveLength(1);
      expect(result).toContainEqual({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
      });
    });

    it('should deduplicate inverse pairs (USD->SGD and SGD->USD become SGD->USD)', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', settings: { currency: 'USD' } }, // Needs SGD->USD for SGD account
        { id: 'user-2', settings: { currency: 'SGD' } }, // Needs USD->SGD for USD account
      ]);

      accountRepository.find
        .mockResolvedValueOnce([
          {
            id: 'acc-1',
            currentBalance: {
              currency: 'SGD',
              amount: 10000,
              sign: 'positive',
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'acc-2',
            currentBalance: {
              currency: 'USD',
              amount: 20000,
              sign: 'positive',
            },
          },
        ]);

      const result = await service.getRequiredCurrencyPairs();

      // Should only have one normalized pair (USD is always target when involved)
      expect(result).toHaveLength(1);
      expect(result).toContainEqual({
        baseCurrency: 'SGD',
        targetCurrency: 'USD',
      });
    });
  });

  describe('syncDailyRates', () => {
    it('should return empty array when no currency pairs to sync', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', settings: { currency: 'USD' } },
      ]);
      accountRepository.find.mockResolvedValue([
        {
          id: 'acc-1',
          currentBalance: { currency: 'USD', amount: 10000, sign: 'positive' },
        },
      ]);

      const result = await service.syncDailyRates();

      expect(result).toEqual([]);
    });

    it('should skip sync when rates already exist for today', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', settings: { currency: 'USD' } },
      ]);
      accountRepository.find.mockResolvedValue([
        {
          id: 'acc-1',
          currentBalance: { currency: 'EUR', amount: 10000, sign: 'positive' },
        },
      ]);

      const today = new Date().toISOString().split('T')[0];
      backfillHelper.getExistingRateKeys.mockResolvedValue(
        new Set([`USD:${today}`]),
      );

      const result = await service.syncDailyRates();

      expect(result).toEqual([]);
      expect(backfillHelper.fetchExchangeRates).not.toHaveBeenCalled();
    });

    it('should fetch and upsert rates for missing pairs', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', settings: { currency: 'USD' } },
      ]);
      accountRepository.find.mockResolvedValue([
        {
          id: 'acc-1',
          currentBalance: { currency: 'EUR', amount: 10000, sign: 'positive' },
        },
      ]);

      const mockRate = {
        id: 'rate-1',
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: new Date().toISOString().split('T')[0],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      backfillHelper.getExistingRateKeys.mockResolvedValue(new Set());
      backfillHelper.fetchExchangeRates.mockResolvedValue(
        new Map([['USD', 1.08]]),
      );
      backfillHelper.upsertRate.mockResolvedValue(mockRate);

      const result = await service.syncDailyRates();

      expect(result).toHaveLength(1);
      expect(backfillHelper.fetchExchangeRates).toHaveBeenCalledWith('EUR', [
        'USD',
      ]);
      expect(backfillHelper.upsertRate).toHaveBeenCalled();
    });
  });
});
