import { mockTransaction, mockTransaction2 } from './transaction.mock';

export const mockTransactionService = {
  create: jest.fn().mockResolvedValue(mockTransaction),
  findOne: jest.fn().mockResolvedValue(mockTransaction),
  findAll: jest.fn().mockResolvedValue([mockTransaction, mockTransaction2]),
  update: jest.fn().mockResolvedValue(mockTransaction),
  remove: jest.fn().mockResolvedValue(true),
  findByAccountId: jest
    .fn()
    .mockResolvedValue([mockTransaction, mockTransaction2]),
};
