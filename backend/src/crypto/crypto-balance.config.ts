/** Injection token for CryptoBalanceConfig */
export const CRYPTO_BALANCE_CONFIG = 'CRYPTO_BALANCE_CONFIG';

/**
 * Configuration for CryptoBalanceService
 * Requires an Alchemy API key for Ethereum; Bitcoin API is hardcoded
 */
export interface CryptoBalanceConfig {
  alchemyApiKey: string;
}
