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

    it('should return empty array when no rates synced', async () => {
      service.syncDailyRates.mockResolvedValueOnce([]);

      const result = await controller.syncRates();

      expect(result).toEqual([]);
    });
  });
});
