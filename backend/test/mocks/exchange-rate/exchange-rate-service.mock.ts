import { mockExchangeRate, mockExchangeRate2 } from './exchange-rate.mock';

/** Default mock for synchronous batch lookup function */
const mockBatchLookup = jest.fn((from: string, to: string) => {
  if (from === to) return 1;
  if (from === 'EUR' && to === 'USD') return mockExchangeRate.rate;
  if (from === 'GBP' && to === 'USD') return mockExchangeRate2.rate;
  return null;
});

export const mockExchangeRateService = {
  // Public cache-based methods
  getRate: jest.fn().mockResolvedValue(mockExchangeRate.rate),
  getLatestRate: jest.fn().mockResolvedValue(mockExchangeRate.rate),
  getRatesForDate: jest
    .fn()
    .mockResolvedValue([mockExchangeRate, mockExchangeRate2]),
  prepareForBatchLookup: jest.fn().mockResolvedValue(mockBatchLookup),
  invalidateCache: jest.fn(),
  reloadCache: jest.fn().mockResolvedValue(undefined),

  // Sync/admin methods
  syncDailyRates: jest
    .fn()
    .mockResolvedValue([mockExchangeRate, mockExchangeRate2]),
  getRequiredCurrencyPairs: jest.fn().mockResolvedValue([
    { baseCurrency: 'EUR', targetCurrency: 'USD' },
    { baseCurrency: 'GBP', targetCurrency: 'USD' },
  ]),
};
