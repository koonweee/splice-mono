import { mockExchangeRate, mockExchangeRate2 } from './exchange-rate.mock';

export const mockExchangeRateService = {
  upsert: jest.fn().mockResolvedValue(mockExchangeRate),
  getRate: jest.fn().mockResolvedValue(mockExchangeRate),
  getLatestRate: jest.fn().mockResolvedValue(mockExchangeRate),
  getRatesForDate: jest
    .fn()
    .mockResolvedValue([mockExchangeRate, mockExchangeRate2]),
  getRequiredCurrencyPairs: jest.fn().mockResolvedValue([
    { baseCurrency: 'EUR', targetCurrency: 'USD' },
    { baseCurrency: 'GBP', targetCurrency: 'USD' },
  ]),
  fetchExchangeRate: jest.fn().mockResolvedValue(1.08),
  syncDailyRates: jest
    .fn()
    .mockResolvedValue([mockExchangeRate, mockExchangeRate2]),
};
