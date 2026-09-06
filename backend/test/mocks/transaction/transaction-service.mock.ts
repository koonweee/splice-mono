import { mockTransaction, mockTransaction2 } from './transaction.mock';

export const mockTransactionService = {
  create: jest.fn().mockResolvedValue(mockTransaction),
  createManual: jest.fn().mockResolvedValue({
    ...mockTransaction,
    source: 'manual',
    externalTransactionId: null,
    providerDatetime: null,
    authorizedDate: null,
    authorizedDatetime: null,
  }),
  findOne: jest.fn().mockResolvedValue(mockTransaction),
  findAll: jest.fn().mockResolvedValue([mockTransaction, mockTransaction2]),
  findPage: jest.fn().mockResolvedValue({
    data: [mockTransaction, mockTransaction2],
    total: 2,
    nextCursor: null,
    hasMore: false,
  }),
  findAllPaginated: jest.fn().mockResolvedValue({
    data: [mockTransaction, mockTransaction2],
    total: 2,
  }),
  update: jest.fn().mockResolvedValue(mockTransaction),
  updateReportingDate: jest.fn().mockResolvedValue(mockTransaction),
  updateManual: jest.fn().mockResolvedValue({
    ...mockTransaction,
    source: 'manual',
    externalTransactionId: null,
    providerDatetime: null,
    authorizedDate: null,
    authorizedDatetime: null,
  }),
  updateCategory: jest.fn().mockResolvedValue(mockTransaction),
  bulkUpdateCategories: jest.fn().mockResolvedValue({
    count: 1,
    transactionIds: [mockTransaction.id],
    undo: 'undo-token',
  }),
  undoBulkUpdateCategories: jest.fn().mockResolvedValue({
    count: 1,
    transactionIds: [mockTransaction.id],
    undo: '',
  }),
  remove: jest.fn().mockResolvedValue(true),
  removeManual: jest.fn().mockResolvedValue(true),
  findByAccountId: jest
    .fn()
    .mockResolvedValue([mockTransaction, mockTransaction2]),
};
