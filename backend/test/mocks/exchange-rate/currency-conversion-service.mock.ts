import type { ConversionResult } from '../../../src/exchange-rate/currency-conversion.service';

/**
 * Default conversion result for testing (1:1 conversion, no fallback)
 */
export const mockConversionResult: ConversionResult = {
  amount: 100000,
  rate: 1,
  usedFallback: false,
};

/**
 * Conversion result when no rate is available
 */
export const mockFallbackConversionResult: ConversionResult = {
  amount: 100000,
  rate: null,
  usedFallback: true,
};

/**
 * Mock CurrencyConversionService
 *
 * By default returns 1:1 conversion (same amount, rate=1, usedFallback=false)
 */
export const mockCurrencyConversionService = {
  convert: jest.fn().mockResolvedValue(mockConversionResult),
  convertMany: jest
    .fn()
    .mockImplementation((items: { amount: number; currency: string }[]) => {
      // Return 1:1 conversion for each item
      return Promise.resolve(
        items.map((item) => ({
          amount: item.amount,
          rate: 1,
          usedFallback: false,
        })),
      );
    }),
  convertAmount: jest
    .fn()
    .mockImplementation((amount: number) => Promise.resolve(amount)),
  hasRate: jest.fn().mockResolvedValue(true),
};
