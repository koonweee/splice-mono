/**
 * Interface for cryptocurrency exchange rate providers
 * Implementations fetch exchange rates from external APIs
 */
export interface ICryptoExchangeRateProvider {
  /** Provider identifier for logging and debugging */
  readonly providerName: string;

  /**
   * Get exchange rate for a cryptocurrency to a fiat currency
   * @param cryptoCurrency - Crypto symbol (e.g., 'ETH', 'BTC')
   * @param fiatCurrency - Fiat symbol (e.g., 'USD')
   * @returns Exchange rate as a number (1 crypto = rate fiat)
   * @throws Error if the request fails or currency is unsupported
   */
  getRate(cryptoCurrency: string, fiatCurrency: string): Promise<number>;
}
