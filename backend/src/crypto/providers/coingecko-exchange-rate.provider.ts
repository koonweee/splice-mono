import { Injectable, Logger } from '@nestjs/common';
import type { ICryptoExchangeRateProvider } from './exchange-rate-provider.interface';

/** Map crypto symbols to CoinGecko coin IDs */
const COINGECKO_IDS: Record<string, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
};

/** Response shape from CoinGecko simple/price endpoint */
type CoinGeckoResponse = Record<string, Record<string, number>>;

@Injectable()
export class CoinGeckoExchangeRateProvider
  implements ICryptoExchangeRateProvider
{
  readonly providerName = 'coingecko';
  private readonly logger = new Logger(CoinGeckoExchangeRateProvider.name);
  private readonly baseUrl = 'https://api.coingecko.com/api/v3';

  /**
   * Fetch exchange rate from CoinGecko free API
   * @param cryptoCurrency - Crypto symbol (ETH or BTC)
   * @param fiatCurrency - Fiat symbol (e.g., USD)
   * @returns Exchange rate as a number
   * @throws Error if currency is unsupported or API request fails
   */
  async getRate(cryptoCurrency: string, fiatCurrency: string): Promise<number> {
    const coinId = COINGECKO_IDS[cryptoCurrency.toUpperCase()];
    if (!coinId) {
      throw new Error(`Unsupported cryptocurrency: ${cryptoCurrency}`);
    }

    const fiatLower = fiatCurrency.toLowerCase();
    const url = `${this.baseUrl}/simple/price?ids=${coinId}&vs_currencies=${fiatLower}`;

    this.logger.log(
      { cryptoCurrency, fiatCurrency },
      'Fetching exchange rate from CoinGecko',
    );

    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as CoinGeckoResponse;
      const rate = data[coinId]?.[fiatLower];

      if (rate === undefined) {
        throw new Error(`No rate found for ${cryptoCurrency}/${fiatCurrency}`);
      }

      this.logger.log(
        { cryptoCurrency, fiatCurrency, rate },
        'Fetched exchange rate',
      );

      return rate;
    } catch (error) {
      this.logger.error(
        {
          cryptoCurrency,
          fiatCurrency,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to fetch exchange rate from CoinGecko',
      );
      throw error;
    }
  }
}
