import { mockTransaction, mockTransaction2 } from './transaction.mock';

export const mockPaginatedTransactions = {
  data: [mockTransaction, mockTransaction2],
  total: 2,
  page: 1,
  limit: 50,
  hasMore: false,
};

export const mockTransactionService = {
  create: jest.fn().mockResolvedValue(mockTransaction),
  findOne: jest.fn().mockResolvedValue(mockTransaction),
  findAll: jest.fn().mockResolvedValue([mockTransaction, mockTransaction2]),
  findFiltered: jest.fn().mockResolvedValue(mockPaginatedTransactions),
  update: jest.fn().mockResolvedValue(mockTransaction),
  remove: jest.fn().mockResolvedValue(true),
};
