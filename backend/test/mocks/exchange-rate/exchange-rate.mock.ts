import type {
  CreateExchangeRateDto,
  ExchangeRate,
} from '../../../src/types/ExchangeRate';

/** Standard mock timestamps for testing */
export const mockTimestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

/**
 * Mock exchange rate: EUR to USD
 */
export const mockExchangeRate: ExchangeRate = {
  id: 'rate-uuid-123',
  baseCurrency: 'EUR',
  targetCurrency: 'USD',
  rate: 1.08,
  rateDate: '2024-01-15',
  ...mockTimestamps,
};

/**
 * Mock exchange rate: GBP to USD
 */
export const mockExchangeRate2: ExchangeRate = {
  id: 'rate-uuid-456',
  baseCurrency: 'GBP',
  targetCurrency: 'USD',
  rate: 1.27,
  rateDate: '2024-01-15',
  ...mockTimestamps,
};

/**
 * Mock exchange rate: EUR to USD on different date
 */
export const mockExchangeRateOlderDate: ExchangeRate = {
  id: 'rate-uuid-789',
  baseCurrency: 'EUR',
  targetCurrency: 'USD',
  rate: 1.05,
  rateDate: '2024-01-10',
  ...mockTimestamps,
};

/**
 * Mock DTO for creating an exchange rate
 */
export const mockCreateExchangeRateDto: CreateExchangeRateDto = {
  baseCurrency: 'EUR',
  targetCurrency: 'USD',
  rate: 1.08,
  rateDate: '2024-01-15',
};
