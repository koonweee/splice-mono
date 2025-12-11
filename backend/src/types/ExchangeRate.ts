import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { TimestampsSchema } from './Timestamps';

/**
 * Exchange rate between two currencies for a specific date.
 * Stores the rate to convert from baseCurrency to targetCurrency.
 *
 * Example: { baseCurrency: 'EUR', targetCurrency: 'USD', rate: 1.08 }
 * means 1 EUR = 1.08 USD
 */
export const ExchangeRateSchema = registerSchema(
  'ExchangeRate',
  z
    .object({
      id: z.string().uuid(),
      /** The source currency (ISO 4217 code, e.g., 'EUR') */
      baseCurrency: z.string(),
      /** The target currency (ISO 4217 code, e.g., 'USD') */
      targetCurrency: z.string(),
      /** Exchange rate: 1 baseCurrency = rate targetCurrency */
      rate: z.number(),
      /** Date for which this rate applies (YYYY-MM-DD) */
      rateDate: z.string(),
    })
    .merge(TimestampsSchema),
);

export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;

/** Service arguments */

export const CreateExchangeRateDtoSchema = registerSchema(
  'CreateExchangeRateDto',
  z.object({
    /** The source currency (ISO 4217 code, e.g., 'EUR') */
    baseCurrency: z.string(),
    /** The target currency (ISO 4217 code, e.g., 'USD') */
    targetCurrency: z.string(),
    /** Exchange rate: 1 baseCurrency = rate targetCurrency */
    rate: z.number(),
    /** Date for which this rate applies (YYYY-MM-DD) */
    rateDate: z.string(),
  }),
);

export type CreateExchangeRateDto = z.infer<typeof CreateExchangeRateDtoSchema>;

export const UpdateExchangeRateDtoSchema = registerSchema(
  'UpdateExchangeRateDto',
  CreateExchangeRateDtoSchema.partial(),
);

export type UpdateExchangeRateDto = z.infer<typeof UpdateExchangeRateDtoSchema>;

/**
 * Currency pair to track (used for determining which rates to fetch)
 */
export interface CurrencyPair {
  baseCurrency: string;
  targetCurrency: string;
}

/** Source of an exchange rate value */
export type RateSource = 'DB' | 'FILLED';

/** Exchange rate with source indicator */
export interface RateWithSource {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  source: RateSource;
}

/** Response for getRatesForDateRange - rates for a single date */
export interface DateRangeRateResponse {
  date: string;
  rates: RateWithSource[];
}
