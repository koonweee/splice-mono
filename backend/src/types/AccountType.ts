import { AccountType } from 'plaid';

/**
 * Crypto-specific account types that extend Plaid's AccountType
 */
export enum CryptoAccountType {
  CRYPTO_WALLET = 'crypto_wallet',
}

/**
 * Manual account types
 */
export enum ManualAccountType {
  MANUAL = 'manual',
}

/**
 * Extended account type that includes Plaid, Crypto, and Manual types
 */
export type ExtendedAccountType =
  | AccountType
  | CryptoAccountType
  | ManualAccountType;
