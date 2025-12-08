import { AccountType } from 'plaid';
import { AccountWithConvertedBalance } from '../../../src/types/Account';
import {
  BalanceSnapshotType,
  BalanceSnapshotWithConvertedBalance,
} from '../../../src/types/BalanceSnapshot';
import {
  MoneySign,
  SerializedMoneyWithSign,
} from '../../../src/types/MoneyWithSign';

/** Mock user ID for testing */
export const mockUserId = 'user-uuid-123';

/** Standard mock timestamps for testing */
const mockTimestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

/**
 * Create a mock AccountWithConvertedBalance with the given properties
 */
export function createMockAccountWithConversion(
  overrides: Partial<{
    id: string;
    userId: string;
    name: string;
    type: AccountType;
    subType: string | null;
    currentBalanceAmount: number;
    currentBalanceSign: MoneySign;
    availableBalanceAmount: number;
    availableBalanceSign: MoneySign;
    currency: string;
  }> = {},
): AccountWithConvertedBalance {
  const amount = overrides.currentBalanceAmount ?? 100000;
  const sign = overrides.currentBalanceSign ?? MoneySign.POSITIVE;
  const currency = overrides.currency ?? 'USD';
  const availableAmount = overrides.availableBalanceAmount ?? amount;
  const availableSign = overrides.availableBalanceSign ?? sign;

  const currentBalance: SerializedMoneyWithSign = {
    money: { currency, amount },
    sign,
  };

  const availableBalance: SerializedMoneyWithSign = {
    money: { currency, amount: availableAmount },
    sign: availableSign,
  };

  return {
    id: overrides.id ?? 'account-1',
    userId: overrides.userId ?? mockUserId,
    name: overrides.name ?? 'Test Account',
    mask: null,
    type: overrides.type ?? AccountType.Depository,
    subType: overrides.subType ?? null,
    externalAccountId: null,
    bankLinkId: null,
    currentBalance,
    availableBalance,
    // Converted balances are the same as original for USD accounts
    convertedCurrentBalance: currentBalance,
    convertedAvailableBalance: availableBalance,
    ...mockTimestamps,
  };
}

/**
 * Create a mock BalanceSnapshotWithConvertedBalance with the given properties
 */
export function createMockSnapshotWithConversion(
  overrides: Partial<{
    id: string;
    userId: string;
    accountId: string;
    snapshotDate: string;
    currentBalanceAmount: number;
    currentBalanceSign: MoneySign;
    availableBalanceAmount: number;
    availableBalanceSign: MoneySign;
    currency: string;
    snapshotType: BalanceSnapshotType;
  }> = {},
): BalanceSnapshotWithConvertedBalance {
  const amount = overrides.currentBalanceAmount ?? 100000;
  const sign = overrides.currentBalanceSign ?? MoneySign.POSITIVE;
  const currency = overrides.currency ?? 'USD';
  const availableAmount = overrides.availableBalanceAmount ?? amount;
  const availableSign = overrides.availableBalanceSign ?? sign;

  const currentBalance: SerializedMoneyWithSign = {
    money: { currency, amount },
    sign,
  };

  const availableBalance: SerializedMoneyWithSign = {
    money: { currency, amount: availableAmount },
    sign: availableSign,
  };

  return {
    id: overrides.id ?? 'snapshot-1',
    userId: overrides.userId ?? mockUserId,
    accountId: overrides.accountId ?? 'account-1',
    snapshotDate: overrides.snapshotDate ?? '2024-01-01',
    snapshotType: overrides.snapshotType ?? BalanceSnapshotType.SYNC,
    currentBalance,
    availableBalance,
    // Converted balances are the same as original for USD accounts
    convertedCurrentBalance: currentBalance,
    convertedAvailableBalance: availableBalance,
    ...mockTimestamps,
  };
}

/** Mock checking account (asset) with $1,000 balance */
export const mockCheckingAccount = createMockAccountWithConversion({
  id: 'checking-1',
  name: 'Checking Account',
  type: AccountType.Depository,
  currentBalanceAmount: 100000, // $1,000
});

/** Mock savings account (asset) with $5,000 balance */
export const mockSavingsAccount = createMockAccountWithConversion({
  id: 'savings-1',
  name: 'Savings Account',
  type: AccountType.Depository,
  currentBalanceAmount: 500000, // $5,000
});

/** Mock credit card account (liability) with $500 balance */
export const mockCreditCardAccount = createMockAccountWithConversion({
  id: 'credit-1',
  name: 'Credit Card',
  type: AccountType.Credit,
  currentBalanceAmount: 50000, // $500
});

/** Mock investment account (asset) with $10,000 balance */
export const mockInvestmentAccount = createMockAccountWithConversion({
  id: 'investment-1',
  name: 'Investment Account',
  type: AccountType.Investment,
  currentBalanceAmount: 1000000, // $10,000
});
