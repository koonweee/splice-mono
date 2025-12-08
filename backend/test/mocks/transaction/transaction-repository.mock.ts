import { MoneySign } from '../../../src/types/MoneyWithSign';
import {
  mockTransaction,
  mockTransaction2,
  mockCategoryId,
  mockAccountId,
} from './transaction.mock';

const mockTransactionEntity = {
  id: 'transaction-uuid-123',
  userId: 'user-uuid-123',
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
  amount: {
    amount: 5000,
    currency: 'USD',
    sign: MoneySign.NEGATIVE,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { currency: 'USD', amount: 5000 },
      sign: MoneySign.NEGATIVE,
    }),
  },
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  toObject: jest.fn().mockReturnValue(mockTransaction),
};

const mockTransactionEntity2 = {
  id: 'transaction-uuid-456',
  userId: 'user-uuid-123',
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
  amount: {
    amount: 2500,
    currency: 'USD',
    sign: MoneySign.NEGATIVE,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { currency: 'USD', amount: 2500 },
      sign: MoneySign.NEGATIVE,
    }),
  },
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  toObject: jest.fn().mockReturnValue(mockTransaction2),
};

export const mockTransactionRepository = {
  save: jest.fn().mockResolvedValue(mockTransactionEntity),
  findOne: jest.fn().mockResolvedValue(mockTransactionEntity),
  find: jest
    .fn()
    .mockResolvedValue([mockTransactionEntity, mockTransactionEntity2]),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
};
