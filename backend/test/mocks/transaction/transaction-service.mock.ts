import { mockTransaction, mockTransaction2 } from './transaction.mock';

export const mockTransactionService = {
  create: jest.fn().mockResolvedValue(mockTransaction),
  findOne: jest.fn().mockResolvedValue(mockTransaction),
  findAll: jest.fn().mockResolvedValue([mockTransaction, mockTransaction2]),
  findAllPaginated: jest.fn().mockResolvedValue({
    data: [mockTransaction, mockTransaction2],
    total: 2,
  }),
  update: jest.fn().mockResolvedValue(mockTransaction),
  remove: jest.fn().mockResolvedValue(true),
  findByAccountId: jest
    .fn()
    .mockResolvedValue([mockTransaction, mockTransaction2]),
};
