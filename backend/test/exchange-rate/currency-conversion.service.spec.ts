import { Test, TestingModule } from '@nestjs/testing';
import { CurrencyConversionService } from '../../src/exchange-rate/currency-conversion.service';
import { ExchangeRateService } from '../../src/exchange-rate/exchange-rate.service';

describe('CurrencyConversionService', () => {
  let service: CurrencyConversionService;
  let exchangeRateService: {
    getRate: jest.Mock;
    prepareForBatchLookup: jest.Mock;
  };

  beforeEach(async () => {
    exchangeRateService = {
      getRate: jest.fn(),
      prepareForBatchLookup: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CurrencyConversionService,
        {
          provide: ExchangeRateService,
          useValue: exchangeRateService,
        },
      ],
    }).compile();

    service = module.get<CurrencyConversionService>(CurrencyConversionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('convert', () => {
    it('should return amount unchanged with rate=1 for same currency', async () => {
      const mockGetRate = jest
        .fn()
        .mockReturnValue({ rate: 1, rateDate: '2024-01-15' });
      exchangeRateService.prepareForBatchLookup.mockResolvedValue(mockGetRate);

      const result = await service.convert(1000, 'USD', 'USD');

      expect(result).toEqual({
        amount: 1000,
        rate: 1,
        rateDate: '2024-01-15',
        usedFallback: false,
      });
    });

    it('should convert amount using exchange rate', async () => {
      const mockGetRate = jest
        .fn()
        .mockReturnValue({ rate: 1.08, rateDate: '2024-01-15' });
      exchangeRateService.prepareForBatchLookup.mockResolvedValue(mockGetRate);

      const result = await service.convert(1000, 'EUR', 'USD');

      expect(result).toEqual({
        amount: 1080,
        rate: 1.08,
        rateDate: '2024-01-15',
        usedFallback: false,
      });
      expect(mockGetRate).toHaveBeenCalledWith('EUR', 'USD', undefined);
    });

    it('should use date-specific rate when provided', async () => {
      const mockGetRate = jest
        .fn()
        .mockReturnValue({ rate: 1.05, rateDate: '2024-01-15' });
      exchangeRateService.prepareForBatchLookup.mockResolvedValue(mockGetRate);

      const result = await service.convert(1000, 'EUR', 'USD', '2024-01-15');

      expect(result).toEqual({
        amount: 1050,
        rate: 1.05,
        rateDate: '2024-01-15',
        usedFallback: false,
      });
      expect(mockGetRate).toHaveBeenCalledWith('EUR', 'USD', '2024-01-15');
    });

    it('should return original amount with usedFallback=true when no rate available', async () => {
      const mockGetRate = jest.fn().mockReturnValue(null);
      exchangeRateService.prepareForBatchLookup.mockResolvedValue(mockGetRate);

      const result = await service.convert(1000, 'EUR', 'USD');

      expect(result).toEqual({
        amount: 1000,
        rate: null,
        rateDate: null,
        usedFallback: true,
      });
    });
  });

  describe('convertMany', () => {
    it('should return empty array for empty input', async () => {
      const result = await service.convertMany([], 'USD');

      expect(result).toEqual([]);
      expect(exchangeRateService.prepareForBatchLookup).not.toHaveBeenCalled();
    });

    it('should convert multiple amounts using synchronous batch lookup', async () => {
      // Mock the synchronous lookup function returning BatchRateLookupResult
      const mockGetRate = jest.fn((from: string, to: string) => {
        if (from === to) return { rate: 1, rateDate: '2024-01-15' };
        if (from === 'EUR') return { rate: 1.08, rateDate: '2024-01-15' };
        if (from === 'GBP') return { rate: 1.27, rateDate: '2024-01-15' };
        return null;
      });
      exchangeRateService.prepareForBatchLookup.mockResolvedValue(mockGetRate);

      const result = await service.convertMany(
        [
          { amount: 1000, currency: 'EUR' },
          { amount: 500, currency: 'GBP' },
          { amount: 200, currency: 'USD' }, // Same as target
        ],
        'USD',
      );

      expect(result).toEqual([
        {
          amount: 1080,
          rate: 1.08,
          rateDate: '2024-01-15',
          usedFallback: false,
        },
        {
          amount: 635,
          rate: 1.27,
          rateDate: '2024-01-15',
          usedFallback: false,
        },
        { amount: 200, rate: 1, rateDate: '2024-01-15', usedFallback: false }, // Same currency
      ]);

      // prepareForBatchLookup should only be called once
      expect(exchangeRateService.prepareForBatchLookup).toHaveBeenCalledTimes(
        1,
      );

      // The sync lookup should be called for all currencies (including same currency for rateDate)
      expect(mockGetRate).toHaveBeenCalledTimes(3);
      expect(mockGetRate).toHaveBeenCalledWith('EUR', 'USD', undefined);
      expect(mockGetRate).toHaveBeenCalledWith('GBP', 'USD', undefined);
      expect(mockGetRate).toHaveBeenCalledWith('USD', 'USD', undefined);
    });

    it('should handle missing rates with fallback', async () => {
      const mockGetRate = jest.fn().mockReturnValue(null);
      exchangeRateService.prepareForBatchLookup.mockResolvedValue(mockGetRate);

      const result = await service.convertMany(
        [{ amount: 1000, currency: 'XYZ' }],
        'USD',
      );

      expect(result).toEqual([
        { amount: 1000, rate: null, rateDate: null, usedFallback: true },
      ]);
    });

    it('should pass rateDate to lookup function', async () => {
      const mockGetRate = jest
        .fn()
        .mockReturnValue({ rate: 1.05, rateDate: '2024-01-15' });
      exchangeRateService.prepareForBatchLookup.mockResolvedValue(mockGetRate);

      await service.convertMany(
        [{ amount: 1000, currency: 'EUR' }],
        'USD',
        '2024-01-15',
      );

      expect(mockGetRate).toHaveBeenCalledWith('EUR', 'USD', '2024-01-15');
    });
  });

  describe('convertAmount', () => {
    it('should return just the converted number', async () => {
      const mockGetRate = jest
        .fn()
        .mockReturnValue({ rate: 1.08, rateDate: '2024-01-15' });
      exchangeRateService.prepareForBatchLookup.mockResolvedValue(mockGetRate);

      const result = await service.convertAmount(1000, 'EUR', 'USD');

      expect(result).toBe(1080);
    });

    it('should return original amount when no rate available', async () => {
      const mockGetRate = jest.fn().mockReturnValue(null);
      exchangeRateService.prepareForBatchLookup.mockResolvedValue(mockGetRate);

      const result = await service.convertAmount(1000, 'EUR', 'USD');

      expect(result).toBe(1000);
    });

    it('should return same amount for same currency', async () => {
      const mockGetRate = jest
        .fn()
        .mockReturnValue({ rate: 1, rateDate: '2024-01-15' });
      exchangeRateService.prepareForBatchLookup.mockResolvedValue(mockGetRate);

      const result = await service.convertAmount(1000, 'USD', 'USD');

      expect(result).toBe(1000);
    });
  });

  describe('hasRate', () => {
    it('should return true for same currency without checking service', async () => {
      const result = await service.hasRate('USD', 'USD');

      expect(result).toBe(true);
      expect(exchangeRateService.getRate).not.toHaveBeenCalled();
    });

    it('should return true when rate exists', async () => {
      exchangeRateService.getRate.mockResolvedValue(1.08);

      const result = await service.hasRate('EUR', 'USD');

      expect(result).toBe(true);
    });

    it('should return false when rate does not exist', async () => {
      exchangeRateService.getRate.mockResolvedValue(null);

      const result = await service.hasRate('EUR', 'USD');

      expect(result).toBe(false);
    });

    it('should check date-specific rate when date provided', async () => {
      exchangeRateService.getRate.mockResolvedValue(1.05);

      await service.hasRate('EUR', 'USD', '2024-01-15');

      expect(exchangeRateService.getRate).toHaveBeenCalledWith(
        'EUR',
        'USD',
        '2024-01-15',
      );
    });
  });
});
