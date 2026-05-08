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

const mockProviderMetadata = {
  providerTransactionName: null,
  originalDescription: null,
  pendingTransactionId: null,
  accountOwner: null,
  website: null,
  merchantEntityId: null,
  paymentChannel: null,
  transactionCode: null,
  personalFinanceCategoryIconUrl: null,
  personalFinanceCategoryConfidenceLevel: null,
  counterparties: null,
  location: null,
  paymentMeta: null,
};

/**
 * Mock transaction - $50.00 negative (expense) at Starbucks
 */
export const mockTransaction: Transaction = {
  id: 'transaction-uuid-123',
  userId: mockUserId,
  amount: {
    money: { currency: 'USD', amount: 5000 }, // $50.00 in cents
    sign: MoneySign.NEGATIVE,
  },
  accountId: mockAccountId,
  merchantName: 'Starbucks',
  ...mockProviderMetadata,
  pending: false,
  externalTransactionId: 'plaid-txn-123',
  logoUrl: 'https://example.com/starbucks-logo.png',
  activityDate: '2024-01-14',
  reportingDateOverride: null,
  providerDate: '2024-01-15',
  providerDatetime: '2024-01-15T10:30:00Z',
  authorizedDate: '2024-01-14',
  authorizedDatetime: '2024-01-14T10:30:00Z',
  categoryId: mockCategoryId,
  category: null,
  userCategoryId: null,
  userCategory: null,
  userCategoryUpdatedAt: null,
  effectiveCategoryId: mockCategoryId,
  effectiveCategory: null,
  categoryReviewedAt: null,
  categoryReviewMethod: null,
  categoryNeedsReview: true,
  ...mockTimestamps,
};

/**
 * Mock pending transaction - $25.00 negative (expense) at Amazon
 */
export const mockTransaction2: Transaction = {
  id: 'transaction-uuid-456',
  userId: mockUserId,
  amount: {
    money: { currency: 'USD', amount: 2500 }, // $25.00 in cents
    sign: MoneySign.NEGATIVE,
  },
  accountId: mockAccountId,
  merchantName: 'Amazon',
  ...mockProviderMetadata,
  pending: true,
  externalTransactionId: 'plaid-txn-456',
  logoUrl: null,
  activityDate: '2024-01-16',
  reportingDateOverride: null,
  providerDate: '2024-01-16',
  providerDatetime: null,
  authorizedDate: '2024-01-16',
  authorizedDatetime: null,
  categoryId: null,
  category: null,
  userCategoryId: null,
  userCategory: null,
  userCategoryUpdatedAt: null,
  effectiveCategoryId: null,
  effectiveCategory: null,
  categoryReviewedAt: null,
  categoryReviewMethod: null,
  categoryNeedsReview: true,
  ...mockTimestamps,
};

/**
 * Mock DTO for creating a transaction
 */
export const mockCreateTransactionDto: CreateTransactionDto = {
  amount: {
    money: { currency: 'USD', amount: 7500 }, // $75.00 in cents
    sign: MoneySign.NEGATIVE,
  },
  accountId: mockAccountId,
  merchantName: 'Target',
  pending: false,
  externalTransactionId: 'plaid-txn-789',
  logoUrl: null,
  providerDate: '2024-01-17',
  providerDatetime: null,
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
