import { mockTransaction, mockTransaction2 } from './transaction.mock';

export const mockTransactionService = {
  create: jest.fn().mockResolvedValue(mockTransaction),
  findOne: jest.fn().mockResolvedValue(mockTransaction),
  findAll: jest.fn().mockResolvedValue([mockTransaction, mockTransaction2]),
  findAllPaginated: jest.fn().mockResolvedValue({
    data: [mockTransaction, mockTransaction2],
    total: 2,
  }),
  getSummary: jest.fn().mockResolvedValue({
    buckets: [
      {
        currency: 'USD',
        inflowAmount: 0,
        outflowAmount: 7500,
      },
    ],
    transactionCount: 2,
    pendingCount: 1,
    needsReviewCount: 2,
  }),
  update: jest.fn().mockResolvedValue(mockTransaction),
  updateCategory: jest.fn().mockResolvedValue(mockTransaction),
  updateCategoryReview: jest.fn().mockResolvedValue(mockTransaction),
  bulkReviewCategories: jest.fn().mockResolvedValue({
    count: 1,
    transactionIds: [mockTransaction.id],
  }),
  undoBulkReviewCategories: jest.fn().mockResolvedValue({
    count: 1,
    transactionIds: [mockTransaction.id],
  }),
  remove: jest.fn().mockResolvedValue(true),
  findByAccountId: jest
    .fn()
    .mockResolvedValue([mockTransaction, mockTransaction2]),
};
