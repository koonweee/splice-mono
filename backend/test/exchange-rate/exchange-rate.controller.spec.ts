import { Test, TestingModule } from '@nestjs/testing';
import { ExchangeRateController } from '../../src/exchange-rate/exchange-rate.controller';
import { ExchangeRateService } from '../../src/exchange-rate/exchange-rate.service';
import { mockExchangeRateService } from '../mocks/exchange-rate/exchange-rate-service.mock';
import {
  mockExchangeRate,
  mockExchangeRate2,
} from '../mocks/exchange-rate/exchange-rate.mock';

describe('ExchangeRateController', () => {
  let controller: ExchangeRateController;
  let service: typeof mockExchangeRateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExchangeRateController],
      providers: [
        {
          provide: ExchangeRateService,
          useValue: mockExchangeRateService,
        },
      ],
    }).compile();

    controller = module.get<ExchangeRateController>(ExchangeRateController);
    service = module.get(ExchangeRateService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncRates', () => {
    it('should trigger sync and return synced rates', async () => {
      const result = await controller.syncRates();

      expect(result).toEqual([mockExchangeRate, mockExchangeRate2]);
      expect(service.syncDailyRates).toHaveBeenCalled();
    });
  });

  describe('getLatestRate', () => {
    it('should return the latest exchange rate for a currency pair', async () => {
      const result = await controller.getLatestRate('EUR', 'USD');

      expect(result).toEqual(mockExchangeRate);
      expect(service.getLatestRate).toHaveBeenCalledWith('EUR', 'USD');
    });

    it('should return null when no rate exists', async () => {
      service.getLatestRate.mockResolvedValueOnce(null);

      const result = await controller.getLatestRate('EUR', 'USD');

      expect(result).toBeNull();
    });
  });

  describe('getRate', () => {
    it('should return the exchange rate for a specific date', async () => {
      const result = await controller.getRate('EUR', 'USD', '2024-01-15');

      expect(result).toEqual(mockExchangeRate);
      expect(service.getRate).toHaveBeenCalledWith('EUR', 'USD', '2024-01-15');
    });

    it('should return null when no rate exists for date', async () => {
      service.getRate.mockResolvedValueOnce(null);

      const result = await controller.getRate('EUR', 'USD', '2024-01-15');

      expect(result).toBeNull();
    });
  });

  describe('getRatesForDate', () => {
    it('should return all exchange rates for a specific date', async () => {
      const result = await controller.getRatesForDate('2024-01-15');

      expect(result).toEqual([mockExchangeRate, mockExchangeRate2]);
      expect(service.getRatesForDate).toHaveBeenCalledWith('2024-01-15');
    });

    it('should return empty array when no rates exist for date', async () => {
      service.getRatesForDate.mockResolvedValueOnce([]);

      const result = await controller.getRatesForDate('2024-01-15');

      expect(result).toEqual([]);
    });
  });
});
