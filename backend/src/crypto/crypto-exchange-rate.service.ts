import { Injectable, Logger } from '@nestjs/common';
import { CoinGeckoExchangeRateProvider } from './providers/coingecko-exchange-rate.provider';
import type { ICryptoExchangeRateProvider } from './providers/exchange-rate-provider.interface';

@Injectable()
export class CryptoExchangeRateService {
  private readonly logger = new Logger(CryptoExchangeRateService.name);
  private readonly provider: ICryptoExchangeRateProvider;

  constructor(coinGeckoProvider: CoinGeckoExchangeRateProvider) {
    this.provider = coinGeckoProvider;
  }

  /**
   * Get exchange rate for a cryptocurrency to a fiat currency
   * @param cryptoCurrency - Crypto symbol (e.g., 'ETH', 'BTC')
   * @param fiatCurrency - Fiat symbol (default: 'USD')
   * @returns Exchange rate as a number (1 crypto = rate fiat)
   */
  async getRate(
    cryptoCurrency: string,
    fiatCurrency: string = 'USD',
  ): Promise<number> {
    this.logger.log(
      { cryptoCurrency, fiatCurrency, provider: this.provider.providerName },
      'Getting crypto exchange rate',
    );
    return this.provider.getRate(cryptoCurrency, fiatCurrency);
  }
}
