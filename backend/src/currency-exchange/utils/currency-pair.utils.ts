/** Supported cryptocurrency codes */
export const CRYPTO_CURRENCIES = ['ETH', 'BTC'] as const;
export type CryptoCurrency = (typeof CRYPTO_CURRENCIES)[number];

/**
 * Check if a currency code is a cryptocurrency.
 */
export function isCryptoCurrency(currency: string): boolean {
  return CRYPTO_CURRENCIES.includes(currency.toUpperCase() as CryptoCurrency);
}

/**
 * Normalize a currency pair to a canonical form.
 * This ensures we only store one direction for each pair.
 *
 * Normalization rules (in order of priority):
 * 1. If USD is involved, always make USD the target (X → USD)
 *    This matches most exchange rate APIs which use USD as the base
 * 2. Otherwise, sort alphabetically (e.g., EUR → GBP, not GBP → EUR)
 *
 * @returns Object with normalized base/target and whether the pair was inverted
 */
export function normalizeCurrencyPair(
  baseCurrency: string,
  targetCurrency: string,
): { base: string; target: string; inverted: boolean } {
  // If USD is involved, always make it the target
  if (baseCurrency === 'USD') {
    // USD → X becomes X → USD (inverted)
    return { base: targetCurrency, target: 'USD', inverted: true };
  }
  if (targetCurrency === 'USD') {
    // X → USD stays as is
    return { base: baseCurrency, target: 'USD', inverted: false };
  }

  // For non-USD pairs, sort alphabetically
  if (baseCurrency <= targetCurrency) {
    return { base: baseCurrency, target: targetCurrency, inverted: false };
  }
  return { base: targetCurrency, target: baseCurrency, inverted: true };
}
