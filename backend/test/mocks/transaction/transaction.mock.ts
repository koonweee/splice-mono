import {
  CreateTransactionDto,
  Transaction,
  UpdateTransactionDto,
} from '../../../src/types/Transaction';
import { MoneySign } from '../../../src/types/MoneyWithSign';

/** Standard mock timestamps for testing */
export const mockTimestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

/** Mock user ID for testing */
export const mockUserId = 'user-uuid-123';

/** Mock account ID for testing */
export const mockAccountId = 'account-uuid-123';

/** Mock category ID for testing */
export const mockCategoryId = 'category-uuid-123';

/**
 * Mock transaction - $50.00 debit at Starbucks
 */
export const mockTransaction: Transaction = {
  id: 'transaction-uuid-123',
  userId: mockUserId,
  amount: {
    money: { currency: 'USD', amount: 5000 }, // $50.00 in cents
    sign: MoneySign.DEBIT,
  },
  accountId: mockAccountId,
  merchantName: 'Starbucks',
  pending: false,
  externalTransactionId: 'plaid-txn-123',
  logoUrl: 'https://example.com/starbucks-logo.png',
  date: '2024-01-15',
  datetime: '2024-01-15T10:30:00Z',
  authorizedDate: '2024-01-14',
  authorizedDatetime: '2024-01-14T10:30:00Z',
  categoryId: mockCategoryId,
  ...mockTimestamps,
};

/**
 * Mock pending transaction - $25.00 debit at Amazon
 */
export const mockTransaction2: Transaction = {
  id: 'transaction-uuid-456',
  userId: mockUserId,
  amount: {
    money: { currency: 'USD', amount: 2500 }, // $25.00 in cents
    sign: MoneySign.DEBIT,
  },
  accountId: mockAccountId,
  merchantName: 'Amazon',
  pending: true,
  externalTransactionId: 'plaid-txn-456',
  logoUrl: null,
  date: '2024-01-16',
  datetime: null,
  authorizedDate: '2024-01-16',
  authorizedDatetime: null,
  categoryId: null,
  ...mockTimestamps,
};

/**
 * Mock DTO for creating a transaction
 */
export const mockCreateTransactionDto: CreateTransactionDto = {
  amount: {
    money: { currency: 'USD', amount: 7500 }, // $75.00 in cents
    sign: MoneySign.DEBIT,
  },
  accountId: mockAccountId,
  merchantName: 'Target',
  pending: false,
  externalTransactionId: 'plaid-txn-789',
  logoUrl: null,
  date: '2024-01-17',
  datetime: null,
  authorizedDate: '2024-01-17',
  authorizedDatetime: null,
  categoryId: null,
};

/**
 * Mock DTO for updating a transaction
 */
export const mockUpdateTransactionDto: UpdateTransactionDto = {
  merchantName: 'Updated Merchant',
  pending: false,
};
