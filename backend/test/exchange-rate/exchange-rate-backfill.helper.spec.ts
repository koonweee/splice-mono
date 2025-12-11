import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import {
  ExchangeRateBackfillHelper,
  normalizeCurrencyPair,
} from '../../src/exchange-rate/exchange-rate-backfill.helper';
import { ExchangeRateEntity } from '../../src/exchange-rate/exchange-rate.entity';
import { UserEntity } from '../../src/user/user.entity';
import { mockExchangeRateRepository } from '../mocks/exchange-rate/exchange-rate-repository.mock';
import { mockExchangeRate } from '../mocks/exchange-rate/exchange-rate.mock';

describe('ExchangeRateBackfillHelper', () => {
  let helper: ExchangeRateBackfillHelper;
  let repository: typeof mockExchangeRateRepository;
  let userRepository: any;
  let balanceSnapshotRepository: any;

  beforeEach(async () => {
    userRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    balanceSnapshotRepository = {
      find: jest.fn(),
    };

    // Reset repository mocks
    mockExchangeRateRepository.find.mockReset();
    mockExchangeRateRepository.findOne.mockReset();
    mockExchangeRateRepository.save.mockReset();
    mockExchangeRateRepository.createQueryBuilder.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExchangeRateBackfillHelper,
        {
          provide: getRepositoryToken(ExchangeRateEntity),
          useValue: mockExchangeRateRepository,
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: userRepository,
        },
        {
          provide: getRepositoryToken(BalanceSnapshotEntity),
          useValue: balanceSnapshotRepository,
        },
      ],
    }).compile();

    helper = module.get<ExchangeRateBackfillHelper>(ExchangeRateBackfillHelper);
    repository = module.get(getRepositoryToken(ExchangeRateEntity));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('normalizeCurrencyPair', () => {
    it('should make USD the target when USD is base', () => {
      const result = normalizeCurrencyPair('USD', 'EUR');

      expect(result).toEqual({ base: 'EUR', target: 'USD', inverted: true });
    });

    it('should keep USD as target when already target', () => {
      const result = normalizeCurrencyPair('EUR', 'USD');

      expect(result).toEqual({ base: 'EUR', target: 'USD', inverted: false });
    });

    it('should sort non-USD pairs alphabetically', () => {
      const result = normalizeCurrencyPair('GBP', 'EUR');

      expect(result).toEqual({ base: 'EUR', target: 'GBP', inverted: true });
    });

    it('should not invert already alphabetical non-USD pairs', () => {
      const result = normalizeCurrencyPair('EUR', 'GBP');

      expect(result).toEqual({ base: 'EUR', target: 'GBP', inverted: false });
    });
  });

  describe('backfillRatesForUser', () => {
    const mockUserId = 'user-uuid-123';

    it('should return empty array when user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      const result = await helper.backfillRatesForUser(mockUserId);

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

      const result = await helper.backfillRatesForUser(mockUserId);

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

      // Mock createQueryBuilder for getExistingRateKeys
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

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
        const result = await helper.backfillRatesForUser(mockUserId);

        // Should have fetched time series rates
        expect(global.fetch).toHaveBeenCalled();
        const fetchUrl = (global.fetch as jest.Mock).mock.calls[0][0];
        expect(fetchUrl).toContain('base=EUR');
        expect(fetchUrl).toContain('symbols=USD');

        // Should have saved rates
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

      // Mock createQueryBuilder for getExistingRateKeys
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

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
        await helper.backfillRatesForUser(mockUserId);

        // EUR->USD and GBP->USD are both X->USD pairs
        // They should be batched by base currency (2 separate API calls)
        expect(global.fetch).toHaveBeenCalledTimes(2);
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

      // Mock createQueryBuilder for getExistingRateKeys
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      try {
        const result = await helper.backfillRatesForUser(mockUserId);

        // Should return empty array on API error (no rates saved)
        expect(result).toEqual([]);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should skip API call when all required rates already exist', async () => {
      const today = new Date().toISOString().split('T')[0];

      userRepository.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { currency: 'USD', timezone: 'UTC' },
      });

      // Request rates starting from today
      balanceSnapshotRepository.find.mockResolvedValue([
        {
          snapshotDate: today,
          currentBalance: { currency: 'EUR' },
        },
      ]);

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
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const originalFetch = global.fetch;
      global.fetch = jest.fn();

      try {
        await helper.backfillRatesForUser(mockUserId);

        // API should NOT be called since all rates already exist
        expect(global.fetch).not.toHaveBeenCalled();
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('upsertRate', () => {
    it('should create new rate when none exists', async () => {
      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-01',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.findOne.mockResolvedValue(null);
      repository.save.mockResolvedValue(mockEntity);

      const result = await helper.upsertRate({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-01',
      });

      expect(repository.save).toHaveBeenCalled();
      expect(result).toEqual(mockExchangeRate);
    });

    it('should update existing rate', async () => {
      const existingEntity = {
        id: 'existing-id',
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.05,
        rateDate: '2024-01-01',
        toObject: jest.fn().mockReturnValue({ ...mockExchangeRate, rate: 1.08 }),
      };
      repository.findOne.mockResolvedValue(existingEntity);
      repository.save.mockResolvedValue(existingEntity);

      await helper.upsertRate({
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
        rateDate: '2024-01-01',
      });

      expect(existingEntity.rate).toBe(1.08);
      expect(repository.save).toHaveBeenCalledWith(existingEntity);
    });

    it('should normalize and invert rate when needed', async () => {
      const mockEntity = {
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1 / 1.08, // Inverted
        rateDate: '2024-01-01',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.findOne.mockResolvedValue(null);
      repository.save.mockResolvedValue(mockEntity);

      // Pass USD->EUR which should be normalized to EUR->USD with inverted rate
      await helper.upsertRate({
        baseCurrency: 'USD',
        targetCurrency: 'EUR',
        rate: 1.08, // 1 USD = 1.08 EUR
        rateDate: '2024-01-01',
      });

      // Should save with normalized pair and inverted rate
      const savedEntity = repository.save.mock.calls[0][0];
      expect(savedEntity.baseCurrency).toBe('EUR');
      expect(savedEntity.targetCurrency).toBe('USD');
      expect(savedEntity.rate).toBeCloseTo(1 / 1.08, 5);
    });
  });

  describe('getExistingRateKeys', () => {
    it('should return set of existing rate keys', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { baseCurrency: 'EUR', targetCurrency: 'USD', rateDate: '2024-01-01' },
          { baseCurrency: 'EUR', targetCurrency: 'USD', rateDate: '2024-01-02' },
        ]),
      };
      repository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await helper.getExistingRateKeys(
        'EUR',
        ['USD'],
        '2024-01-01',
        '2024-01-03',
      );

      expect(result.has('USD:2024-01-01')).toBe(true);
      expect(result.has('USD:2024-01-02')).toBe(true);
      expect(result.has('USD:2024-01-03')).toBe(false);
    });
  });

  describe('fetchExchangeRates', () => {
    it('should fetch and return rates as Map', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            base: 'EUR',
            date: '2024-01-15',
            rates: { USD: 1.08, GBP: 0.86 },
          }),
      });

      try {
        const result = await helper.fetchExchangeRates('EUR', ['USD', 'GBP']);

        expect(result.get('USD')).toBe(1.08);
        expect(result.get('GBP')).toBe(0.86);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('should return empty Map on API error', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      try {
        const result = await helper.fetchExchangeRates('EUR', ['USD']);

        expect(result.size).toBe(0);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('fetchTimeSeriesRatesBatched', () => {
    it('should fetch and return rates grouped by date', async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            amount: 1,
            base: 'EUR',
            start_date: '2024-01-01',
            end_date: '2024-01-03',
            rates: {
              '2024-01-01': { USD: 1.08 },
              '2024-01-02': { USD: 1.09 },
              '2024-01-03': { USD: 1.07 },
            },
          }),
      });

      try {
        const result = await helper.fetchTimeSeriesRatesBatched(
          'EUR',
          ['USD'],
          '2024-01-01',
          '2024-01-03',
        );

        expect(result.size).toBe(3);
        expect(result.get('2024-01-01')?.get('USD')).toBe(1.08);
        expect(result.get('2024-01-02')?.get('USD')).toBe(1.09);
        expect(result.get('2024-01-03')?.get('USD')).toBe(1.07);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
