import { AccountType } from 'plaid';

/**
 * Crypto-specific account types that extend Plaid's AccountType
 */
export enum CryptoAccountType {
  CRYPTO_WALLET = 'crypto_wallet',
}

/**
 * Extended account type that includes Plaid and crypto types
 */
export type ExtendedAccountType = AccountType | CryptoAccountType;
