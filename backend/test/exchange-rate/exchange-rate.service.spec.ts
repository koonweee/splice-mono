import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { ExchangeRateEntity } from '../../src/exchange-rate/exchange-rate.entity';
import { ExchangeRateService } from '../../src/exchange-rate/exchange-rate.service';
import { UserEntity } from '../../src/user/user.entity';
import { mockExchangeRateRepository } from '../mocks/exchange-rate/exchange-rate-repository.mock';
import { mockExchangeRate } from '../mocks/exchange-rate/exchange-rate.mock';

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  let repository: typeof mockExchangeRateRepository;
  let userRepository: any;
  let accountRepository: any;

  beforeEach(async () => {
    userRepository = {
      find: jest.fn(),
    };

    accountRepository = {
      find: jest.fn(),
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
      ],
    }).compile();

    service = module.get<ExchangeRateService>(ExchangeRateService);
    repository = module.get(getRepositoryToken(ExchangeRateEntity));

    // Invalidate cache before each test to ensure fresh state
    service.invalidateCache();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getRate (cached)', () => {
    it('should return 1 for same currency', async () => {
      const result = await service.getRate('USD', 'USD');

      expect(result).toBe(1);
      // Should not load cache for same currency
      expect(repository.find).not.toHaveBeenCalled();
    });

    it('should return rate from cache for date-specific lookup', async () => {
      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-15',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.find.mockResolvedValueOnce([mockEntity]);

      const result = await service.getRate('EUR', 'USD', '2024-01-15');

      expect(result).toBe(1.08);
      expect(repository.find).toHaveBeenCalledWith({
        order: { rateDate: 'DESC' },
      });
    });

    it('should return latest rate from cache when no date specified', async () => {
      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-15',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.find.mockResolvedValueOnce([mockEntity]);

      const result = await service.getRate('EUR', 'USD');

      expect(result).toBe(1.08);
    });

    it('should return inverse rate when requesting USD->EUR but EUR->USD is stored', async () => {
      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08, // 1 EUR = 1.08 USD
        rateDate: '2024-01-15',
      };
      repository.find.mockResolvedValueOnce([mockEntity]);

      // Request USD->EUR (inverse of what's stored)
      const result = await service.getRate('USD', 'EUR', '2024-01-15');

      // Should return inverted rate
      expect(result).toBeCloseTo(1 / 1.08, 5);
    });

    it('should return null when rate not found in cache', async () => {
      repository.find.mockResolvedValueOnce([]);

      const result = await service.getRate('EUR', 'USD', '2024-01-15');

      expect(result).toBeNull();
    });

    it('should use cached data on subsequent calls within TTL', async () => {
      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-15',
      };
      repository.find.mockResolvedValueOnce([mockEntity]);

      // First call loads cache
      await service.getRate('EUR', 'USD', '2024-01-15');

      // Second call should use cache
      const result = await service.getRate('EUR', 'USD', '2024-01-15');

      expect(result).toBe(1.08);
      // Repository.find should only be called once
      expect(repository.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('getLatestRate', () => {
    it('should return the latest rate from cache', async () => {
      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-15',
      };
      repository.find.mockResolvedValueOnce([mockEntity]);

      const result = await service.getLatestRate('EUR', 'USD');

      expect(result).toBe(1.08);
    });

    it('should return 1 for same currency', async () => {
      const result = await service.getLatestRate('USD', 'USD');

      expect(result).toBe(1);
      expect(repository.find).not.toHaveBeenCalled();
    });

    it('should return null when no rates exist for currency pair', async () => {
      repository.find.mockResolvedValueOnce([]);

      const result = await service.getLatestRate('EUR', 'USD');

      expect(result).toBeNull();
    });
  });

  describe('getRatesForDate', () => {
    it('should return all exchange rates for a specific date from cache', async () => {
      const mockEntities = [
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: 1.08,
          rateDate: '2024-01-15',
        },
        {
          baseCurrency: 'GBP',
          targetCurrency: 'USD',
          rate: 1.27,
          rateDate: '2024-01-15',
        },
      ];
      repository.find.mockResolvedValueOnce(mockEntities);

      const result = await service.getRatesForDate('2024-01-15');

      expect(result).toHaveLength(2);
      expect(result[0].baseCurrency).toBe('EUR');
      expect(result[1].baseCurrency).toBe('GBP');
    });

    it('should return empty array when no rates exist for date', async () => {
      repository.find.mockResolvedValueOnce([]);

      const result = await service.getRatesForDate('2024-01-15');

      expect(result).toEqual([]);
    });
  });

  describe('invalidateCache', () => {
    it('should force cache reload on next access', async () => {
      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-15',
      };
      repository.find.mockResolvedValue([mockEntity]);

      // First call loads cache
      await service.getRate('EUR', 'USD', '2024-01-15');
      expect(repository.find).toHaveBeenCalledTimes(1);

      // Invalidate cache
      service.invalidateCache();

      // Next call should reload cache
      await service.getRate('EUR', 'USD', '2024-01-15');
      expect(repository.find).toHaveBeenCalledTimes(2);
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

    it('should normalize non-USD pairs alphabetically', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', settings: { currency: 'GBP' } }, // Needs EUR->GBP for EUR account
        { id: 'user-2', settings: { currency: 'EUR' } }, // Needs GBP->EUR for GBP account
      ]);

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
              currency: 'GBP',
              amount: 20000,
              sign: 'positive',
            },
          },
        ]);

      const result = await service.getRequiredCurrencyPairs();

      // Should only have one normalized pair (alphabetically: EUR < GBP)
      expect(result).toHaveLength(1);
      expect(result).toContainEqual({
        baseCurrency: 'EUR',
        targetCurrency: 'GBP',
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

    it('should invalidate cache after sync when pairs exist', async () => {
      // Setup: user with EUR account, USD currency -> needs EUR->USD rate
      userRepository.find.mockResolvedValue([
        { id: 'user-1', settings: { currency: 'USD' } },
      ]);
      accountRepository.find.mockResolvedValue([
        {
          id: 'acc-1',
          currentBalance: { currency: 'EUR', amount: 10000, sign: 'positive' },
        },
      ]);

      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-15',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.find.mockResolvedValue([mockEntity]);
      repository.findOne.mockResolvedValue(null); // No existing rate for upsert
      repository.save.mockResolvedValue(mockEntity);

      // Pre-load cache by calling getRate
      await service.getRate('EUR', 'USD');
      const initialFindCalls = repository.find.mock.calls.length;

      // Mock the fetch to return a rate (private method, we need to mock global fetch)
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            base: 'EUR',
            date: '2024-01-15',
            rates: { USD: 1.08 },
          }),
      });

      try {
        // Sync should invalidate cache after saving rates
        await service.syncDailyRates();

        // Next getRate call should reload cache
        await service.getRate('EUR', 'USD');

        // find should be called again after invalidation
        expect(repository.find.mock.calls.length).toBeGreaterThan(
          initialFindCalls,
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
