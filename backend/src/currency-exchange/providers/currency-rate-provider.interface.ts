/**
 * Common interface for all currency exchange rate providers.
 * Both FIAT and Crypto providers implement this interface.
 * Providers are pure API callers - no DB access.
 */
export interface ICurrencyRateProvider {
  /** Provider identifier for logging and debugging */
  readonly providerName: string;

  /** Currency type this provider handles */
  readonly currencyType: 'fiat' | 'crypto';

  /**
   * List of currency codes this provider supports as base currencies.
   * For crypto: ['ETH', 'BTC']
   * For fiat: 'all' (supports all currencies from Frankfurter API)
   */
  readonly supportedBaseCurrencies: string[] | 'all';

  /**
   * Get exchange rate for a currency pair.
   * Returns the rate: 1 baseCurrency = rate targetCurrency
   *
   * @param baseCurrency - Source currency (e.g., 'EUR', 'ETH')
   * @param targetCurrency - Target currency (e.g., 'USD')
   * @param date - Optional date for historical rate (YYYY-MM-DD). If not provided, returns latest.
   * @returns Exchange rate as a number
   * @throws Error if request fails or currency is unsupported
   */
  getRate(
    baseCurrency: string,
    targetCurrency: string,
    date?: string,
  ): Promise<number>;

  /**
   * Get historical exchange rates for a date range.
   * Returns rates for each day in the range.
   *
   * @param baseCurrency - Source currency
   * @param targetCurrencies - Array of target currencies
   * @param startDate - Start date (YYYY-MM-DD, inclusive)
   * @param endDate - End date (YYYY-MM-DD, inclusive)
   * @returns Map of date -> Map of targetCurrency -> rate
   */
  getHistoricalRates(
    baseCurrency: string,
    targetCurrencies: string[],
    startDate: string,
    endDate: string,
  ): Promise<Map<string, Map<string, number>>>;
}
