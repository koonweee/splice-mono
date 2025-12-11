import { mockExchangeRate, mockExchangeRate2 } from './exchange-rate.mock';

export const mockExchangeRateService = {
  // Query methods
  getRatesForDateRange: jest.fn().mockResolvedValue([
    {
      date: '2024-01-15',
      rates: [
        {
          baseCurrency: 'EUR',
          targetCurrency: 'USD',
          rate: mockExchangeRate.rate,
          source: 'DB',
        },
        {
          baseCurrency: 'GBP',
          targetCurrency: 'USD',
          rate: mockExchangeRate2.rate,
          source: 'DB',
        },
      ],
    },
  ]),

  // Sync/admin methods
  syncDailyRates: jest
    .fn()
    .mockResolvedValue([mockExchangeRate, mockExchangeRate2]),
  getRequiredCurrencyPairs: jest.fn().mockResolvedValue([
    { baseCurrency: 'EUR', targetCurrency: 'USD' },
    { baseCurrency: 'GBP', targetCurrency: 'USD' },
  ]),
};
