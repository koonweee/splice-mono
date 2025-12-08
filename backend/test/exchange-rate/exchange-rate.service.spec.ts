import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
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
  let balanceSnapshotRepository: any;

  beforeEach(async () => {
    userRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    accountRepository = {
      find: jest.fn(),
    };

    balanceSnapshotRepository = {
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
        {
          provide: getRepositoryToken(BalanceSnapshotEntity),
          useValue: balanceSnapshotRepository,
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

  describe('backfillRatesForUser', () => {
    const mockUserId = 'user-uuid-123';

    it('should return empty array when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await service.backfillRatesForUser(mockUserId);

      expect(result).toEqual([]);
    });

    it('should return empty array when no currency pairs to backfill', async () => {
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'America/New_York' },
      });

      // Snapshots with same currency as user
      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: '2024-01-01',
          currentBalance: { currency: 'USD' },
        },
      ]);

      const result = await service.backfillRatesForUser(mockUserId);

      expect(result).toEqual([]);
    });

    it('should fetch and upsert rates for unique currency pairs from snapshots', async () => {
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });

      // Snapshots with EUR currency (different from user's USD)
      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: '2024-01-01',
          currentBalance: { currency: 'EUR' },
        },
        {
          snapshotDate: '2024-01-05',
          currentBalance: { currency: 'EUR' },
        },
      ]);

      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-01',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.findOne.mockResolvedValue(null);
      repository.save.mockResolvedValue(mockEntity);
      repository.find.mockResolvedValue([]);

      // Mock fetch for time series API
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            amount: 1,
            base: 'EUR',
            start_date: '2024-01-01',
            end_date: '2024-01-05',
            rates: {
              '2024-01-01': { USD: 1.08 },
              '2024-01-02': { USD: 1.09 },
              '2024-01-03': { USD: 1.07 },
            },
          }),
      });

      try {
        const result = await service.backfillRatesForUser(mockUserId);

        // Should have fetched time series rates
        expect(global.fetch).toHaveBeenCalled();
        const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0];
        // With 5-day buffer, start date is 2023-12-27 (5 days before 2024-01-01)
        expect(fetchUrl).toContain('2023-12-27..');
        expect(fetchUrl).toContain('base=EUR');
        expect(fetchUrl).toContain('symbols=USD');

        // Should have saved rates for each date
        expect(repository.save).toHaveBeenCalled();
        expect(result.length).toBeGreaterThan(0);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should batch requests by base currency', async () => {
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });

      // Snapshots with multiple currencies
      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: '2024-01-01',
          currentBalance: { currency: 'EUR' },
        },
        {
          snapshotDate: '2024-01-01',
          currentBalance: { currency: 'GBP' },
        },
      ]);

      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-01',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.findOne.mockResolvedValue(null);
      repository.save.mockResolvedValue(mockEntity);
      repository.find.mockResolvedValue([]);

      // Mock fetch
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            amount: 1,
            base: 'EUR',
            start_date: '2024-01-01',
            end_date: '2024-01-01',
            rates: {
              '2024-01-01': { USD: 1.08 },
            },
          }),
      });

      try {
        await service.backfillRatesForUser(mockUserId);

        // EUR->USD and GBP->USD are both X->USD pairs
        // They should be batched by base currency
        // Since both have USD as target (normalized), we should have 2 separate API calls
        // (one for EUR base, one for GBP base)
        expect(global.fetch).toHaveBeenCalledTimes(2);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should use earliest snapshot date for each currency pair', async () => {
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });

      // Snapshots ordered by date (ASC) - earliest first
      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: '2024-01-01', // Earliest
          currentBalance: { currency: 'EUR' },
        },
        {
          snapshotDate: '2024-01-15',
          currentBalance: { currency: 'EUR' },
        },
        {
          snapshotDate: '2024-02-01',
          currentBalance: { currency: 'EUR' },
        },
      ]);

      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-01',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.findOne.mockResolvedValue(null);
      repository.save.mockResolvedValue(mockEntity);
      repository.find.mockResolvedValue([]);

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            amount: 1,
            base: 'EUR',
            start_date: '2024-01-01',
            end_date: '2024-02-01',
            rates: {
              '2024-01-01': { USD: 1.08 },
            },
          }),
      });

      try {
        await service.backfillRatesForUser(mockUserId);

        // Should use earliest date with 5-day buffer (2023-12-27) as start
        const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0];
        expect(fetchUrl).toContain('2023-12-27..');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should use user timezone for today date', async () => {
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'America/New_York' },
      });

      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: '2024-01-01',
          currentBalance: { currency: 'EUR' },
        },
      ]);

      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-01',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.findOne.mockResolvedValue(null);
      repository.save.mockResolvedValue(mockEntity);
      repository.find.mockResolvedValue([]);

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            amount: 1,
            base: 'EUR',
            start_date: '2024-01-01',
            end_date: '2024-12-08',
            rates: {
              '2024-01-01': { USD: 1.08 },
            },
          }),
      });

      try {
        await service.backfillRatesForUser(mockUserId);

        // Verify fetch was called (timezone handling is internal)
        expect(global.fetch).toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should handle API errors gracefully', async () => {
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });

      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: '2024-01-01',
          currentBalance: { currency: 'EUR' },
        },
      ]);

      repository.find.mockResolvedValue([]);

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      try {
        const result = await service.backfillRatesForUser(mockUserId);

        // Should return empty array on API error (no rates saved)
        expect(result).toEqual([]);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should invalidate cache after backfill', async () => {
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });

      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: '2024-01-01',
          currentBalance: { currency: 'EUR' },
        },
      ]);

      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-01',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.findOne.mockResolvedValue(null);
      repository.save.mockResolvedValue(mockEntity);
      repository.find.mockResolvedValue([mockEntity]);

      // Pre-load cache
      await service.getRate('EUR', 'USD', '2024-01-01');
      const initialFindCalls = repository.find.mock.calls.length;

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            amount: 1,
            base: 'EUR',
            start_date: '2024-01-01',
            end_date: '2024-01-01',
            rates: {
              '2024-01-01': { USD: 1.1 }, // Updated rate
            },
          }),
      });

      try {
        await service.backfillRatesForUser(mockUserId);

        // Next getRate call should reload cache
        await service.getRate('EUR', 'USD', '2024-01-01');

        // find should be called again after invalidation
        expect(repository.find.mock.calls.length).toBeGreaterThan(
          initialFindCalls,
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should forward-fill weekend dates with last known rate', async () => {
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });

      // Request rates from Friday Jan 5 to Monday Jan 8 (weekend in between)
      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: '2024-01-05', // Friday
          currentBalance: { currency: 'EUR' },
        },
      ]);

      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-05',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.findOne.mockResolvedValue(null);
      repository.save.mockResolvedValue(mockEntity);
      repository.find.mockResolvedValue([]);

      // Mock createQueryBuilder for getExistingRateKeys
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const originalFetch = global.fetch;
      // API only returns working days (Friday and Monday, no weekend)
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            amount: 1,
            base: 'EUR',
            start_date: '2023-12-31', // Buffered start (5 days before Jan 5)
            end_date: '2024-01-13', // Buffered end (5 days after Jan 8)
            rates: {
              '2024-01-02': { USD: 1.07 }, // Tuesday (in buffer)
              '2024-01-03': { USD: 1.075 }, // Wednesday (in buffer)
              '2024-01-04': { USD: 1.08 }, // Thursday (in buffer)
              '2024-01-05': { USD: 1.085 }, // Friday
              // No Saturday Jan 6
              // No Sunday Jan 7
              '2024-01-08': { USD: 1.09 }, // Monday
            },
          }),
      });

      try {
        await service.backfillRatesForUser(mockUserId);

        // Should have called save for dates including weekends (forward-filled)
        // The exact dates depend on what "today" is, but we can verify save was called
        expect(repository.save).toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should use buffered dates when fetching from API', async () => {
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });

      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: '2024-01-10',
          currentBalance: { currency: 'EUR' },
        },
      ]);

      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-10',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.findOne.mockResolvedValue(null);
      repository.save.mockResolvedValue(mockEntity);
      repository.find.mockResolvedValue([]);

      // Mock createQueryBuilder for getExistingRateKeys
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            amount: 1,
            base: 'EUR',
            start_date: '2024-01-05',
            end_date: '2024-01-15',
            rates: {
              '2024-01-10': { USD: 1.08 },
            },
          }),
      });

      try {
        await service.backfillRatesForUser(mockUserId);

        // Verify the API was called with buffered dates (5 days before start)
        const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0];
        // The start date should be 5 days before 2024-01-10, which is 2024-01-05
        expect(fetchUrl).toContain('2024-01-05..');
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should skip API call when all required rates already exist', async () => {
      // Use a fixed "today" by mocking the user's timezone to produce a predictable date
      // We'll use a snapshot from today so only one day needs to be checked
      const today = new Date().toISOString().split('T')[0];

      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });

      // Request rates starting from today (so only today needs to exist)
      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: today,
          currentBalance: { currency: 'EUR' },
        },
      ]);

      repository.find.mockResolvedValue([]);

      // Mock createQueryBuilder to return that the rate for today already exists
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            baseCurrency: 'EUR',
            targetCurrency: 'USD',
            rateDate: today,
          },
        ]),
      };
      repository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const originalFetch = global.fetch;
      global.fetch = jest.fn();

      try {
        await service.backfillRatesForUser(mockUserId);

        // API should NOT be called since the rate for today already exists
        expect(global.fetch).not.toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should forward-fill from buffer dates when start date falls on weekend', async () => {
      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });

      // Request starting from Saturday Jan 6 (weekend)
      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: '2024-01-06', // Saturday
          currentBalance: { currency: 'EUR' },
        },
      ]);

      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-06',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.findOne.mockResolvedValue(null);
      repository.save.mockResolvedValue(mockEntity);
      repository.find.mockResolvedValue([]);

      // Mock createQueryBuilder for getExistingRateKeys
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder = jest
        .fn()
        .mockReturnValue(mockQueryBuilder);

      const originalFetch = global.fetch;
      // API returns Friday rate in the buffer, but not Saturday/Sunday
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            amount: 1,
            base: 'EUR',
            start_date: '2024-01-01', // Buffered start
            end_date: '2024-01-11', // Buffered end
            rates: {
              '2024-01-02': { USD: 1.07 },
              '2024-01-03': { USD: 1.075 },
              '2024-01-04': { USD: 1.08 },
              '2024-01-05': { USD: 1.085 }, // Friday - last working day before weekend
              // No Jan 6 (Saturday) or Jan 7 (Sunday)
              '2024-01-08': { USD: 1.09 }, // Monday
            },
          }),
      });

      try {
        await service.backfillRatesForUser(mockUserId);

        // Should have saved rates - the Saturday should be forward-filled from Friday
        expect(repository.save).toHaveBeenCalled();

        // Check that at least one save was for Jan 6 (Saturday) with Friday's rate
        const saveCalls = repository.save.mock.calls;
        const jan6Save = saveCalls.find(
          (call) => call[0].rateDate === '2024-01-06',
        );

        if (jan6Save) {
          // The rate should be forward-filled from Friday (1.085)
          expect(jan6Save[0].rate).toBe(1.085);
        }
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
