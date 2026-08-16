import { Test, TestingModule } from '@nestjs/testing';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { CurrencyExchangeService } from '../../src/currency-exchange/currency-exchange.service';
import { UserService } from '../../src/user/user.service';

const mockUserId = 'user-uuid-123';

describe('CurrencyConversionService', () => {
  let service: CurrencyConversionService;
  let mockCurrencyExchangeService: {
    getRatesForDateRange: jest.Mock;
  };
  let mockUserService: {
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    mockCurrencyExchangeService = {
      getRatesForDateRange: jest.fn(),
    };
    mockUserService = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyConversionService,
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

    service = module.get<CurrencyConversionService>(CurrencyConversionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPreferredCurrency', () => {
    it('should return user currency setting', async () => {
      mockUserService.findOne.mockResolvedValue({
        id: mockUserId,
        settings: {
          currency: 'GBP',
          timezone: 'UTC',
          hideZeroBalanceAccounts: false,
        },
      });

      const result = await service.getPreferredCurrency(mockUserId);
      expect(result).toBe('GBP');
      expect(mockUserService.findOne).toHaveBeenCalledWith(mockUserId);
    });

    it('should default to USD when user has no currency setting', async () => {
      mockUserService.findOne.mockResolvedValue({
        id: mockUserId,
        settings: { timezone: 'UTC' },
      });

      const result = await service.getPreferredCurrency(mockUserId);
      expect(result).toBe('USD');
    });

    it('should default to USD when user is not found', async () => {
      mockUserService.findOne.mockResolvedValue(null);

      const result = await service.getPreferredCurrency(mockUserId);
      expect(result).toBe('USD');
    });
  });

  describe('getRateMap', () => {
    it('should return empty map for empty source currencies', async () => {
      const result = await service.getRateMap([], 'USD', '2024-01-31');
      expect(result.size).toBe(0);
      expect(
        mockCurrencyExchangeService.getRatesForDateRange,
      ).not.toHaveBeenCalled();
    });

    it('should delegate to currencyExchangeService and build rate map', async () => {
      mockCurrencyExchangeService.getRatesForDateRange.mockResolvedValue([
        {
          date: '2024-01-31',
          rates: [
            {
              baseCurrency: 'EUR',
              targetCurrency: 'USD',
              rate: 1.1,
              source: 'DB',
            },
            {
              baseCurrency: 'GBP',
              targetCurrency: 'USD',
              rate: 1.27,
              source: 'DB',
            },
          ],
        },
      ]);

      const result = await service.getRateMap(
        ['EUR', 'GBP'],
        'USD',
        '2024-01-31',
      );

      expect(result.get('EUR')).toBe(1.1);
      expect(result.get('GBP')).toBe(1.27);
      expect(
        mockCurrencyExchangeService.getRatesForDateRange,
      ).toHaveBeenCalledWith(
        [
          { baseCurrency: 'EUR', targetCurrency: 'USD' },
          { baseCurrency: 'GBP', targetCurrency: 'USD' },
        ],
        '2024-01-31',
        '2024-01-31',
      );
    });

    it('should fail closed when a requested rate is missing', async () => {
      mockCurrencyExchangeService.getRatesForDateRange.mockResolvedValue([]);

      await expect(
        service.getRateMap(['EUR'], 'USD', '2024-01-31'),
      ).rejects.toThrow(
        'Required exchange rate is unavailable for EUR to USD on 2024-01-31',
      );
    });
  });

  describe('convertAmount', () => {
    it('should convert USD cents to EUR cents', () => {
      // 1000 USD cents ($10.00) at rate 0.91 = 910 EUR cents (€9.10)
      const result = service.convertAmount(1000, 'USD', 'EUR', 0.91);
      expect(result).toBe(910);
    });

    it('should convert EUR cents to USD cents', () => {
      // 100000 EUR cents (€1000.00) at rate 1.1 = 110000 USD cents ($1100.00)
      const result = service.convertAmount(100000, 'EUR', 'USD', 1.1);
      expect(result).toBe(110000);
    });

    it('should handle zero-decimal currencies (JPY)', () => {
      // 1000 JPY (¥1000) to USD at rate 0.0067 = 670 USD cents ($6.70)
      const result = service.convertAmount(1000, 'JPY', 'USD', 0.0067);
      expect(result).toBe(670);
    });

    it('should handle conversion from standard to zero-decimal currency', () => {
      // 1000 USD cents ($10.00) to JPY at rate 149.5 = 1495 JPY (¥1495)
      const result = service.convertAmount(1000, 'USD', 'JPY', 149.5);
      expect(result).toBe(1495);
    });

    it('should round to nearest integer', () => {
      // 333 USD cents ($3.33) at rate 0.91 = 303.03 → 303 EUR cents
      const result = service.convertAmount(333, 'USD', 'EUR', 0.91);
      expect(result).toBe(303);
    });

    it('should handle same currency conversion (rate = 1)', () => {
      const result = service.convertAmount(5000, 'USD', 'USD', 1);
      expect(result).toBe(5000);
    });
  });
});
