import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { ExchangeRateEntity } from '../../src/exchange-rate/exchange-rate.entity';
import { ExchangeRateService } from '../../src/exchange-rate/exchange-rate.service';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserEntity } from '../../src/user/user.entity';
import { mockExchangeRateRepository } from '../mocks/exchange-rate/exchange-rate-repository.mock';
import {
  mockCreateExchangeRateDto,
  mockExchangeRate,
} from '../mocks/exchange-rate/exchange-rate.mock';

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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('upsert', () => {
    it('should create a new exchange rate when none exists (X->USD stays as is)', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      // EUR->USD: USD is target, so this is already normalized
      const result = await service.upsert(mockCreateExchangeRateDto);

      expect(result).toEqual(mockExchangeRate);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          baseCurrency: 'EUR', // X->USD normalized
          targetCurrency: 'USD',
          rateDate: mockCreateExchangeRateDto.rateDate,
        },
      });
      expect(repository.save).toHaveBeenCalled();
    });

    it('should normalize pair and invert rate when storing USD->X (USD should be target)', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      // USD->EUR should be normalized to EUR->USD (USD always target)
      // and the rate should be inverted
      await service.upsert({
        baseCurrency: 'USD',
        targetCurrency: 'EUR',
        rate: 0.93, // 1 USD = 0.93 EUR
        rateDate: '2024-01-15',
      });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          baseCurrency: 'EUR', // Normalized: EUR->USD
          targetCurrency: 'USD',
          rateDate: '2024-01-15',
        },
      });

      // The saved entity should have the inverted rate (1 EUR = 1/0.93 USD)
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: expect.closeTo(1 / 0.93, 5) as number,
        }),
      );
    });

    it('should normalize non-USD pairs alphabetically', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      // GBP->EUR should be normalized to EUR->GBP (alphabetically)
      await service.upsert({
        baseCurrency: 'GBP',
        targetCurrency: 'EUR',
        rate: 1.17, // 1 GBP = 1.17 EUR
        rateDate: '2024-01-15',
      });

      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          baseCurrency: 'EUR', // Alphabetically first
          targetCurrency: 'GBP',
          rateDate: '2024-01-15',
        },
      });

      // The saved entity should have the inverted rate
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          baseCurrency: 'EUR',
          targetCurrency: 'GBP',
          rate: expect.closeTo(1 / 1.17, 5) as number,
        }),
      );
    });

    it('should update existing exchange rate when one exists for same pair and date', async () => {
      const existingEntity = {
        id: 'existing-rate-id',
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.05,
        rateDate: '2024-01-15',
        toObject: jest.fn().mockReturnValue(mockExchangeRate),
      };
      repository.findOne.mockResolvedValueOnce(existingEntity);

      const result = await service.upsert(mockCreateExchangeRateDto);

      expect(result).toEqual(mockExchangeRate);
      expect(existingEntity.rate).toBe(mockCreateExchangeRateDto.rate);
      expect(repository.save).toHaveBeenCalledWith(existingEntity);
    });
  });

  describe('getRate', () => {
    it('should return exchange rate when found (already normalized)', async () => {
      const result = await service.getRate('EUR', 'USD', '2024-01-15');

      expect(result).toEqual(mockExchangeRate);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          baseCurrency: 'EUR', // Normalized
          targetCurrency: 'USD',
          rateDate: '2024-01-15',
        },
      });
    });

    it('should return inverse rate when requesting USD->EUR but EUR->USD is stored', async () => {
      const storedRate = {
        ...mockExchangeRate,
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08, // 1 EUR = 1.08 USD
      };
      const mockEntity = {
        toObject: jest.fn().mockReturnValue(storedRate),
      };
      repository.findOne.mockResolvedValueOnce(mockEntity);

      // Request USD->EUR (inverse of what's stored)
      const result = await service.getRate('USD', 'EUR', '2024-01-15');

      // Should query with normalized pair
      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rateDate: '2024-01-15',
        },
      });

      // Should return inverted rate with swapped currencies
      expect(result).not.toBeNull();
      expect(result!.baseCurrency).toBe('USD');
      expect(result!.targetCurrency).toBe('EUR');
      expect(result!.rate).toBeCloseTo(1 / 1.08, 5);
    });

    it('should return null when exchange rate not found', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.getRate('EUR', 'USD', '2024-01-15');

      expect(result).toBeNull();
    });

    it('should return null when requesting same currency', async () => {
      const result = await service.getRate('USD', 'USD', '2024-01-15');

      expect(result).toBeNull();
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('getLatestRate', () => {
    it('should return the latest exchange rate for a currency pair', async () => {
      const result = await service.getLatestRate('EUR', 'USD');

      expect(result).toEqual(mockExchangeRate);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { baseCurrency: 'EUR', targetCurrency: 'USD' },
        order: { rateDate: 'DESC' },
      });
    });

    it('should return inverse rate when requesting USD->EUR but EUR->USD is stored', async () => {
      const storedRate = {
        ...mockExchangeRate,
        baseCurrency: 'EUR',
        targetCurrency: 'USD',
        rate: 1.08,
      };
      const mockEntity = {
        toObject: jest.fn().mockReturnValue(storedRate),
      };
      repository.findOne.mockResolvedValueOnce(mockEntity);

      const result = await service.getLatestRate('USD', 'EUR');

      expect(repository.findOne).toHaveBeenCalledWith({
        where: { baseCurrency: 'EUR', targetCurrency: 'USD' },
        order: { rateDate: 'DESC' },
      });

      expect(result).not.toBeNull();
      expect(result!.baseCurrency).toBe('USD');
      expect(result!.targetCurrency).toBe('EUR');
      expect(result!.rate).toBeCloseTo(1 / 1.08, 5);
    });

    it('should return null when no rates exist for currency pair', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.getLatestRate('EUR', 'USD');

      expect(result).toBeNull();
    });

    it('should return null when requesting same currency', async () => {
      const result = await service.getLatestRate('USD', 'USD');

      expect(result).toBeNull();
      expect(repository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('getRatesForDate', () => {
    it('should return all exchange rates for a specific date', async () => {
      const result = await service.getRatesForDate('2024-01-15');

      expect(result).toEqual([mockExchangeRate]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { rateDate: '2024-01-15' },
      });
    });

    it('should return empty array when no rates exist for date', async () => {
      repository.find.mockResolvedValueOnce([]);

      const result = await service.getRatesForDate('2024-01-15');

      expect(result).toEqual([]);
    });
  });

  describe('getRequiredCurrencyPairs', () => {
    it('should return unique normalized currency pairs', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', currency: 'USD' },
        { id: 'user-2', currency: 'GBP' },
      ]);

      // User 1 has EUR and GBP accounts, but user currency is USD
      // User 2 has EUR account, but user currency is GBP
      accountRepository.find
        .mockResolvedValueOnce([
          {
            id: 'acc-1',
            currentBalance: { currency: 'EUR', amount: 10000, sign: 'credit' },
          },
          {
            id: 'acc-2',
            currentBalance: { currency: 'GBP', amount: 20000, sign: 'credit' },
          },
          {
            id: 'acc-3',
            currentBalance: { currency: 'USD', amount: 30000, sign: 'credit' },
          }, // Same as user, should skip
        ])
        .mockResolvedValueOnce([
          {
            id: 'acc-4',
            currentBalance: { currency: 'EUR', amount: 40000, sign: 'credit' },
          },
          {
            id: 'acc-5',
            currentBalance: { currency: 'GBP', amount: 50000, sign: 'credit' },
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
        { id: 'user-1', currency: 'USD' },
      ]);
      accountRepository.find.mockResolvedValue([]);

      const result = await service.getRequiredCurrencyPairs();

      expect(result).toEqual([]);
    });

    it('should skip accounts with same currency as user', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', currency: 'USD' },
      ]);
      accountRepository.find.mockResolvedValue([
        {
          id: 'acc-1',
          currentBalance: { currency: 'USD', amount: 10000, sign: 'credit' },
        },
      ]);

      const result = await service.getRequiredCurrencyPairs();

      expect(result).toEqual([]);
    });

    it('should deduplicate currency pairs across users', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', currency: 'USD' },
        { id: 'user-2', currency: 'USD' },
      ]);

      // Both users have EUR accounts with USD as their currency
      accountRepository.find
        .mockResolvedValueOnce([
          {
            id: 'acc-1',
            currentBalance: { currency: 'EUR', amount: 10000, sign: 'credit' },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'acc-2',
            currentBalance: { currency: 'EUR', amount: 20000, sign: 'credit' },
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
        { id: 'user-1', currency: 'USD' }, // Needs SGD->USD for SGD account
        { id: 'user-2', currency: 'SGD' }, // Needs USD->SGD for USD account
      ]);

      accountRepository.find
        .mockResolvedValueOnce([
          {
            id: 'acc-1',
            currentBalance: { currency: 'SGD', amount: 10000, sign: 'credit' },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'acc-2',
            currentBalance: { currency: 'USD', amount: 20000, sign: 'credit' },
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
        { id: 'user-1', currency: 'GBP' }, // Needs EUR->GBP for EUR account
        { id: 'user-2', currency: 'EUR' }, // Needs GBP->EUR for GBP account
      ]);

      accountRepository.find
        .mockResolvedValueOnce([
          {
            id: 'acc-1',
            currentBalance: { currency: 'EUR', amount: 10000, sign: 'credit' },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'acc-2',
            currentBalance: { currency: 'GBP', amount: 20000, sign: 'credit' },
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
    it('should sync rates for all required currency pairs', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', currency: 'USD' },
      ]);
      accountRepository.find.mockResolvedValue([
        {
          id: 'acc-1',
          currentBalance: { currency: 'EUR', amount: 10000, sign: 'credit' },
        },
      ]);
      repository.findOne.mockResolvedValue(null); // No existing rate

      // Mock fetchExchangeRates (batch) to return rates
      const fetchSpy = jest
        .spyOn(service, 'fetchExchangeRates')
        .mockResolvedValue(new Map([['USD', 1.08]]));

      const result = await service.syncDailyRates();

      expect(fetchSpy).toHaveBeenCalledWith('EUR', ['USD']);
      expect(repository.save).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should skip pairs when fetch returns empty map', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', currency: 'USD' },
      ]);
      accountRepository.find.mockResolvedValue([
        {
          id: 'acc-1',
          currentBalance: { currency: 'EUR', amount: 10000, sign: 'credit' },
        },
      ]);

      // Mock fetchExchangeRates to return empty map (API error)
      const fetchSpy = jest
        .spyOn(service, 'fetchExchangeRates')
        .mockResolvedValue(new Map());

      const result = await service.syncDailyRates();

      expect(fetchSpy).toHaveBeenCalledWith('EUR', ['USD']);
      expect(result).toHaveLength(0);
    });

    it('should handle errors gracefully and continue with other base currencies', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', currency: 'USD' },
      ]);
      accountRepository.find.mockResolvedValue([
        {
          id: 'acc-1',
          currentBalance: { currency: 'EUR', amount: 10000, sign: 'credit' },
        },
        {
          id: 'acc-2',
          currentBalance: { currency: 'GBP', amount: 20000, sign: 'credit' },
        },
      ]);
      repository.findOne.mockResolvedValue(null);

      // First call throws, second succeeds
      const fetchSpy = jest
        .spyOn(service, 'fetchExchangeRates')
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce(new Map([['USD', 1.27]]));

      const result = await service.syncDailyRates();

      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
    });

    it('should batch multiple target currencies per base in single API call', async () => {
      userRepository.find.mockResolvedValue([
        { id: 'user-1', currency: 'USD' },
        { id: 'user-2', currency: 'GBP' },
      ]);
      // User 1 has EUR account (needs EUR->USD)
      // User 2 has EUR account (needs EUR->GBP)
      // Both should be batched into one call with base=EUR
      accountRepository.find
        .mockResolvedValueOnce([
          {
            id: 'acc-1',
            currentBalance: { currency: 'EUR', amount: 10000, sign: 'credit' },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 'acc-2',
            currentBalance: { currency: 'EUR', amount: 20000, sign: 'credit' },
          },
        ]);
      repository.findOne.mockResolvedValue(null);

      const fetchSpy = jest
        .spyOn(service, 'fetchExchangeRates')
        .mockResolvedValue(
          new Map([
            ['GBP', 0.86],
            ['USD', 1.08],
          ]),
        );

      const result = await service.syncDailyRates();

      // Should only make one API call with both targets
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledWith(
        'EUR',
        expect.arrayContaining(['GBP', 'USD']),
      );
      expect(result).toHaveLength(2);
    });
  });
});
