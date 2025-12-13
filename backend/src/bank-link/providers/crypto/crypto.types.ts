import { z } from 'zod';

/**
 * Supported crypto networks
 */
export const CryptoNetworkSchema = z.enum(['ethereum', 'bitcoin']);
export type CryptoNetwork = z.infer<typeof CryptoNetworkSchema>;

/**
 * Schema for validating providerUserDetails in initiateLinking
 * Used to safely parse the wallet address and network from the request
 */
export const CryptoLinkInputSchema = z.object({
  walletAddress: z.string().min(1, 'Wallet address is required'),
  network: CryptoNetworkSchema,
});
export type CryptoLinkInput = z.infer<typeof CryptoLinkInputSchema>;

/**
 * Schema for validating authentication stored in BankLink
 * Used to safely parse when fetching account balances
 */
export const CryptoAuthenticationSchema = z.object({
  address: z.string().min(1, 'Address is required'),
  network: CryptoNetworkSchema,
});
export type CryptoAuthentication = z.infer<typeof CryptoAuthenticationSchema>;

/**
 * Currency codes for each network
 */
export const NETWORK_CURRENCIES: Record<CryptoNetwork, string> = {
  ethereum: 'ETH',
  bitcoin: 'BTC',
};

/**
 * Decimal places for each network's native currency
 */
export const NETWORK_DECIMALS: Record<CryptoNetwork, number> = {
  ethereum: 18,
  bitcoin: 8,
};
