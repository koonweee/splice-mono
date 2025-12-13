/** Injection token for CryptoBalanceConfig */
export const CRYPTO_BALANCE_CONFIG = 'CRYPTO_BALANCE_CONFIG';

/**
 * Configuration for CryptoBalanceService
 * Only Ethereum RPC URLs are configurable; Bitcoin API is hardcoded
 */
export interface CryptoBalanceConfig {
  ethereumRpcUrls: string[];
}

/**
 * Default configuration with public Ethereum RPC endpoints
 * These are free, rate-limited endpoints suitable for low-volume usage
 */
export const DEFAULT_CRYPTO_BALANCE_CONFIG: CryptoBalanceConfig = {
  ethereumRpcUrls: [
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://cloudflare-eth.com',
  ],
};
