import { Injectable, Logger } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';

/** Result of a currency conversion */
export interface ConversionResult {
  /** The converted amount */
  amount: number;
  /** The exchange rate used, or null if no rate was available */
  rate: number | null;
  /** Whether a fallback was used (no rate available) */
  usedFallback: boolean;
}

/** Input item for batch conversions */
export interface ConversionInput {
  amount: number;
  currency: string;
}

@Injectable()
export class CurrencyConversionService {
  private readonly logger = new Logger(CurrencyConversionService.name);

  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  /**
   * Convert an amount from one currency to another.
   *
   * @param amount - The amount to convert (in source currency)
   * @param fromCurrency - Source currency code (e.g., 'EUR')
   * @param toCurrency - Target currency code (e.g., 'USD')
   * @param rateDate - Optional specific date for historical conversion (YYYY-MM-DD)
   * @returns Conversion result with amount, rate used, and fallback indicator
   */
  async convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    rateDate?: string,
  ): Promise<ConversionResult> {
    // Same currency - no conversion needed
    if (fromCurrency === toCurrency) {
      return {
        amount,
        rate: 1,
        usedFallback: false,
      };
    }

    const rate = await this.exchangeRateService.getRate(
      fromCurrency,
      toCurrency,
      rateDate,
    );

    if (rate === null) {
      this.logger.warn(
        `No exchange rate found for ${fromCurrency}→${toCurrency}${rateDate ? ` on ${rateDate}` : ''}, using original amount`,
      );
      return {
        amount,
        rate: null,
        usedFallback: true,
      };
    }

    return {
      amount: amount * rate,
      rate,
      usedFallback: false,
    };
  }

  /**
   * Convert multiple amounts to a target currency in batch.
   * More efficient than calling convert() multiple times as it
   * loads the cache once and does synchronous lookups.
   *
   * @param items - Array of amounts with their source currencies
   * @param toCurrency - Target currency code to convert all amounts to
   * @param rateDate - Optional specific date for historical conversion
   * @returns Array of conversion results in the same order as input
   */
  async convertMany(
    items: ConversionInput[],
    toCurrency: string,
    rateDate?: string,
  ): Promise<ConversionResult[]> {
    if (items.length === 0) {
      return [];
    }

    // Load cache once and get synchronous lookup function
    const getRate = await this.exchangeRateService.prepareForBatchLookup();

    return items.map((item) => {
      const { amount, currency: fromCurrency } = item;

      // Same currency - no conversion needed
      if (fromCurrency === toCurrency) {
        return {
          amount,
          rate: 1,
          usedFallback: false,
        };
      }

      const rate = getRate(fromCurrency, toCurrency, rateDate);

      if (rate === null) {
        this.logger.warn(
          `No exchange rate found for ${fromCurrency}→${toCurrency}${rateDate ? ` on ${rateDate}` : ''}, using original amount`,
        );
        return {
          amount,
          rate: null,
          usedFallback: true,
        };
      }

      return {
        amount: amount * rate,
        rate,
        usedFallback: false,
      };
    });
  }

  /**
   * Convert an amount and return just the converted value.
   * Simpler API when you don't need the rate or fallback info.
   *
   * @param amount - The amount to convert
   * @param fromCurrency - Source currency code
   * @param toCurrency - Target currency code
   * @param rateDate - Optional specific date for historical conversion
   * @returns The converted amount (or original if no rate available)
   */
  async convertAmount(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    rateDate?: string,
  ): Promise<number> {
    const result = await this.convert(
      amount,
      fromCurrency,
      toCurrency,
      rateDate,
    );
    return result.amount;
  }

  /**
   * Check if a conversion rate is available for a currency pair.
   *
   * @param fromCurrency - Source currency code
   * @param toCurrency - Target currency code
   * @param rateDate - Optional specific date
   * @returns true if a rate exists, false otherwise
   */
  async hasRate(
    fromCurrency: string,
    toCurrency: string,
    rateDate?: string,
  ): Promise<boolean> {
    if (fromCurrency === toCurrency) return true;
    const rate = await this.exchangeRateService.getRate(
      fromCurrency,
      toCurrency,
      rateDate,
    );
    return rate !== null;
  }
}
