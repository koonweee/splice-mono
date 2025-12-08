import { AccountType } from 'plaid';
import {
  Account,
  AccountWithConvertedBalance,
  CreateAccountDto,
} from '../../../src/types/Account';
import { MoneySign } from '../../../src/types/MoneyWithSign';

/** Standard mock timestamps for testing */
export const mockTimestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

/** Mock user ID for testing */
export const mockUserId = 'user-uuid-123';

/**
 * Mock account with $1,000.00 balance (stored as cents)
 */
export const mockAccount: Account = {
  id: 'test-id-123',
  userId: mockUserId,
  name: 'Test Checking Account',
  availableBalance: {
    money: { currency: 'USD', amount: 100000 }, // $1,000.00 in cents
    sign: MoneySign.POSITIVE,
  },
  currentBalance: {
    money: { currency: 'USD', amount: 100000 }, // $1,000.00 in cents
    sign: MoneySign.POSITIVE,
  },
  type: AccountType.Depository,
  subType: null,
  externalAccountId: null,
  bankLinkId: null,
  ...mockTimestamps,
};

/**
 * Mock account with $5,000.00 balance (stored as cents)
 */
export const mockAccount2: Account = {
  id: 'test-id-456',
  userId: mockUserId,
  name: 'Test Savings Account',
  availableBalance: {
    money: { currency: 'USD', amount: 500000 }, // $5,000.00 in cents
    sign: MoneySign.POSITIVE,
  },
  currentBalance: {
    money: { currency: 'USD', amount: 500000 }, // $5,000.00 in cents
    sign: MoneySign.POSITIVE,
  },
  type: AccountType.Depository,
  subType: null,
  externalAccountId: 'plaid-acc-456',
  bankLinkId: 'bank-link-123',
  ...mockTimestamps,
};

/**
 * Mock account with converted balances (same as mockAccount but with conversion fields)
 */
export const mockAccountWithConversion: AccountWithConvertedBalance = {
  ...mockAccount,
  convertedCurrentBalance: {
    balance: {
      money: { currency: 'USD', amount: 100000 },
      sign: MoneySign.POSITIVE,
    },
    rate: 1,
    rateDate: '2024-01-15',
  },
  convertedAvailableBalance: {
    balance: {
      money: { currency: 'USD', amount: 100000 },
      sign: MoneySign.POSITIVE,
    },
    rate: 1,
    rateDate: '2024-01-15',
  },
};

/**
 * Mock account 2 with converted balances
 */
export const mockAccountWithConversion2: AccountWithConvertedBalance = {
  ...mockAccount2,
  convertedCurrentBalance: {
    balance: {
      money: { currency: 'USD', amount: 500000 },
      sign: MoneySign.POSITIVE,
    },
    rate: 1,
    rateDate: '2024-01-15',
  },
  convertedAvailableBalance: {
    balance: {
      money: { currency: 'USD', amount: 500000 },
      sign: MoneySign.POSITIVE,
    },
    rate: 1,
    rateDate: '2024-01-15',
  },
};

/**
 * Mock DTO for creating account with $500.00 balance (stored as cents)
 */
export const mockCreateAccountDto: CreateAccountDto = {
  name: 'New Test Account',
  availableBalance: {
    money: { currency: 'USD', amount: 50000 }, // $500.00 in cents
    sign: MoneySign.POSITIVE,
  },
  currentBalance: {
    money: { currency: 'USD', amount: 50000 }, // $500.00 in cents
    sign: MoneySign.POSITIVE,
  },
  type: AccountType.Depository,
  subType: null,
};
