import { Injectable, Logger } from '@nestjs/common';
import type { ICurrencyRateProvider } from './currency-rate-provider.interface';

/**
 * FIAT currency exchange rate provider using Frankfurter API.
 * https://frankfurter.dev - Free, open-source currency data API.
 * No API keys or rate limits required.
 */
@Injectable()
export class FiatExchangeRateProvider implements ICurrencyRateProvider {
  readonly providerName = 'frankfurter';
  readonly currencyType = 'fiat' as const;
  readonly supportedBaseCurrencies = 'all' as const;

  private readonly logger = new Logger(FiatExchangeRateProvider.name);
  private readonly baseUrl = 'https://api.frankfurter.dev/v1';

  /**
   * Fetch JSON from Frankfurter API with error handling.
   */
  private async fetchFromFrankfurter<T>(
    url: string,
    description: string,
  ): Promise<T | null> {
    try {
      this.logger.log({ description }, 'Fetching from Frankfurter');

      const response = await fetch(url);

      if (!response.ok) {
        this.logger.error(
          {
            status: response.status,
            statusText: response.statusText,
          },
          'Frankfurter API error',
        );
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to fetch from Frankfurter',
      );
      return null;
    }
  }

  /**
   * Get exchange rate for a currency pair.
   * @param baseCurrency - Source currency (e.g., 'EUR')
   * @param targetCurrency - Target currency (e.g., 'USD')
   * @param date - Optional date for historical rate (YYYY-MM-DD)
   * @returns Exchange rate as a number
   */
  async getRate(
    baseCurrency: string,
    targetCurrency: string,
    date?: string,
  ): Promise<number> {
    const endpoint = date ?? 'latest';
    const url = `${this.baseUrl}/${endpoint}?base=${baseCurrency}&symbols=${targetCurrency}`;

    const data = await this.fetchFromFrankfurter<{
      base: string;
      date: string;
      rates: Record<string, number>;
    }>(url, `${baseCurrency}→${targetCurrency}${date ? ` (${date})` : ''}`);

    if (!data) {
      throw new Error(
        `Failed to fetch rate for ${baseCurrency}→${targetCurrency}`,
      );
    }

    const rate = data.rates[targetCurrency];
    if (rate === undefined) {
      throw new Error(
        `No rate found for ${baseCurrency}→${targetCurrency} in response`,
      );
    }

    return rate;
  }

  /**
   * Fetch latest exchange rates for multiple target currencies in a single API call.
   */
  async getLatestRates(
    baseCurrency: string,
    targetCurrencies: string[],
  ): Promise<Map<string, number>> {
    const symbols = targetCurrencies.join(',');
    const url = `${this.baseUrl}/latest?base=${baseCurrency}&symbols=${symbols}`;

    const data = await this.fetchFromFrankfurter<{
      base: string;
      date: string;
      rates: Record<string, number>;
    }>(url, `${baseCurrency}→[${symbols}]`);

    if (!data) {
      return new Map();
    }

    const rates = new Map<string, number>();
    Object.entries(data.rates).forEach(([currency, rate]) => {
      rates.set(currency, rate);
    });

    this.logger.log(
      {
        baseCurrency,
        rateCount: rates.size,
        date: data.date,
      },
      'Fetched rates',
    );

    return rates;
  }

  /**
   * Get historical exchange rates for a date range.
   * Returns rates for each day in the range (weekends/holidays have no rates).
   *
   * @param baseCurrency - Source currency
   * @param targetCurrencies - Array of target currencies
   * @param startDate - Start date (YYYY-MM-DD)
   * @param endDate - End date (YYYY-MM-DD)
   * @returns Map of date -> Map of targetCurrency -> rate
   */
  async getHistoricalRates(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: string,
    endDate: string,
  ): Promise<Map<string, Map<string, number>>> {
    const symbols = targetCurrencies.join(',');
    const url = `${this.baseUrl}/${startDate}..${endDate}?base=${baseCurrency}&symbols=${symbols}`;

    const data = await this.fetchFromFrankfurter<{
      amount: number;
      base: string;
      start_date: string;
      end_date: string;
      rates: Record<string, Record<string, number>>;
    }>(url, `${baseCurrency}→[${symbols}] (${startDate} to ${endDate})`);

    if (!data) {
      return new Map();
    }

    // Parse the time series response
    const rates = new Map<string, Map<string, number>>();
    Object.entries(data.rates).forEach(([date, currencyRates]) => {
      const dateRates = new Map<string, number>();
      Object.entries(currencyRates).forEach(([currency, rate]) => {
        dateRates.set(currency, rate);
      });
      rates.set(date, dateRates);
    });

    this.logger.log(
      {
        baseCurrency,
        targetCurrencies: symbols,
        dateCount: rates.size,
      },
      'Fetched time series rates',
    );

    return rates;
  }
}
