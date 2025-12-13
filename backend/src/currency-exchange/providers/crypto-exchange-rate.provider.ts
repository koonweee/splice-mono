import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import type { ICurrencyRateProvider } from './currency-rate-provider.interface';

/** Map crypto symbols to CoinGecko coin IDs */
const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
};

/** Response shape from CoinGecko simple/price endpoint */
type CoinGeckoSimplePriceResponse = Record<string, Record<string, number>>;

/** Response shape from CoinGecko /coins/{id}/history endpoint */
interface CoinGeckoHistoryResponse {
  market_data?: {
    current_price?: Record<string, number>;
  };
}

/** Response shape from CoinGecko market_chart/range endpoint */
interface CoinGeckoMarketChartResponse {
  prices: [number, number][]; // [timestamp_ms, price][]
}

/**
 * Cryptocurrency exchange rate provider using CoinGecko API.
 * https://www.coingecko.com/api - Free tier available, no API key required.
 */
@Injectable()
export class CryptoExchangeRateProvider implements ICurrencyRateProvider {
  readonly providerName = 'coingecko';
  readonly currencyType = 'crypto' as const;
  readonly supportedBaseCurrencies = ['ETH', 'BTC'];

  private readonly logger = new Logger(CryptoExchangeRateProvider.name);
  private readonly baseUrl = 'https://api.coingecko.com/api/v3';

  /**
   * Get exchange rate for a crypto/fiat pair.
   * Uses /simple/price for current rate, /coins/{id}/history for historical.
   *
   * @param baseCurrency - Crypto symbol (ETH or BTC)
   * @param targetCurrency - Fiat symbol (e.g., USD)
   * @param date - Optional date (YYYY-MM-DD) for historical rate
   * @returns Exchange rate as a number
   */
  async getRate(
    baseCurrency: string,
    targetCurrency: string,
    date?: string,
  ): Promise<number> {
    const coinId = COINGECKO_IDS[baseCurrency.toUpperCase()];
    if (!coinId) {
      throw new Error(`Unsupported cryptocurrency: ${baseCurrency}`);
    }

    const fiatLower = targetCurrency.toLowerCase();

    // Use historical endpoint if date provided
    if (date) {
      return this.getHistoricalRate(coinId, fiatLower, date, baseCurrency);
    }

    // Otherwise use simple/price for current rate
    return this.getCurrentRate(coinId, fiatLower, baseCurrency, targetCurrency);
  }

  /**
   * Fetch current rate from CoinGecko simple/price endpoint.
   */
  private async getCurrentRate(
    coinId: string,
    fiatLower: string,
    baseCurrency: string,
    targetCurrency: string,
  ): Promise<number> {
    const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=${fiatLower}`;

    this.logger.log(
      { baseCurrency, targetCurrency },
      'Fetching current rate from CoinGecko',
    );

    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as CoinGeckoSimplePriceResponse;
      const rate = data[coinId]?.[fiatLower];

      if (rate === undefined) {
        throw new Error(`No rate found for ${baseCurrency}/${targetCurrency}`);
      }

      this.logger.log(
        { baseCurrency, targetCurrency, rate },
        'Fetched current rate',
      );

      return rate;
    } catch (error) {
      this.logger.error(
        {
          baseCurrency,
          targetCurrency,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to fetch current rate from CoinGecko',
      );
      throw error;
    }
  }

  /**
   * Fetch historical rate from CoinGecko /coins/{id}/history endpoint.
   * Note: CoinGecko expects date in dd-mm-yyyy format.
   */
  private async getHistoricalRate(
    coinId: string,
    fiatLower: string,
    date: string,
    baseCurrency: string,
  ): Promise<number> {
    // Convert YYYY-MM-DD to dd-mm-yyyy for CoinGecko
    const geckoDate = dayjs(date).format('DD-MM-YYYY');
    const url = `${this.baseUrl}/coins/${coinId}/history?date=${geckoDate}`;

    this.logger.log(
      { baseCurrency, fiatLower, date },
      'Fetching historical rate from CoinGecko',
    );

    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as CoinGeckoHistoryResponse;
      const rate = data.market_data?.current_price?.[fiatLower];

      if (rate === undefined) {
        throw new Error(
          `No historical rate found for ${baseCurrency}/${fiatLower} on ${date}`,
        );
      }

      this.logger.log(
        { baseCurrency, fiatLower, date, rate },
        'Fetched historical rate',
      );

      return rate;
    } catch (error) {
      this.logger.error(
        {
          baseCurrency,
          fiatLower,
          date,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to fetch historical rate from CoinGecko',
      );
      throw error;
    }
  }

  /**
   * Get historical exchange rates for a date range.
   * Uses CoinGecko's market_chart/range endpoint.
   *
   * Note: CoinGecko free tier returns daily data for ranges > 90 days.
   * For shorter ranges, it may return hourly data which we aggregate to daily.
   *
   * @param baseCurrency - Crypto symbol (ETH or BTC)
   * @param targetCurrencies - Array of fiat currencies
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
    const coinId = COINGECKO_IDS[baseCurrency.toUpperCase()];
    if (!coinId) {
      throw new Error(`Unsupported cryptocurrency: ${baseCurrency}`);
    }

    const result = new Map<string, Map<string, number>>();

    // CoinGecko only supports one vs_currency per request for market_chart
    for (const targetCurrency of targetCurrencies) {
      const fiatLower = targetCurrency.toLowerCase();

      // Convert dates to Unix timestamps
      const fromTs = dayjs(startDate).startOf('day').unix();
      const toTs = dayjs(endDate).endOf('day').unix();

      const url = `${this.baseUrl}/coins/${coinId}/market_chart/range?vs_currency=${fiatLower}&from=${fromTs}&to=${toTs}`;

      this.logger.log(
        { baseCurrency, targetCurrency, startDate, endDate },
        'Fetching historical rates from CoinGecko',
      );

      try {
        const response = await fetch(url);

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(
            { status: response.status, errorText },
            'CoinGecko API error',
          );
          continue;
        }

        const data = (await response.json()) as CoinGeckoMarketChartResponse;

        // Group prices by date and take the last price of each day
        const dailyPrices = new Map<string, number>();
        data.prices.forEach(([timestampMs, price]) => {
          const date = dayjs(timestampMs).format('YYYY-MM-DD');
          dailyPrices.set(date, price); // Later entries overwrite earlier (take last price of day)
        });

        // Add to result map
        dailyPrices.forEach((price, date) => {
          if (!result.has(date)) {
            result.set(date, new Map());
          }
          result.get(date)!.set(targetCurrency, price);
        });

        this.logger.log(
          {
            baseCurrency,
            targetCurrency,
            dateCount: dailyPrices.size,
          },
          'Fetched historical rates',
        );
      } catch (error) {
        this.logger.error(
          {
            baseCurrency,
            targetCurrency,
            error: error instanceof Error ? error.message : String(error),
          },
          'Failed to fetch historical rates from CoinGecko',
        );
      }
    }

    return result;
  }
}
