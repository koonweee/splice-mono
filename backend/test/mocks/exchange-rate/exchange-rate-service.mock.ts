import { mockExchangeRate, mockExchangeRate2 } from './exchange-rate.mock';

/** Default mock for synchronous batch lookup function - returns BatchRateLookupResult */
const mockBatchLookup = jest.fn(
  (from: string, to: string, rateDate?: string) => {
    const effectiveDate = rateDate ?? '2024-01-15';
    if (from === to) return { rate: 1, rateDate: effectiveDate };
    if (from === 'EUR' && to === 'USD')
      return { rate: mockExchangeRate.rate, rateDate: effectiveDate };
    if (from === 'GBP' && to === 'USD')
      return { rate: mockExchangeRate2.rate, rateDate: effectiveDate };
    return null;
  },
);

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

  // Backfill methods
  backfillRatesForUser: jest
    .fn()
    .mockResolvedValue([mockExchangeRate, mockExchangeRate2]),
};
