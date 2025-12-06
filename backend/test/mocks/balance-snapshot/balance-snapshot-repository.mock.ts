import { BalanceSnapshotType } from '../../../src/types/BalanceSnapshot';
import { MoneySign } from '../../../src/types/MoneyWithSign';
import { mockBalanceSnapshot } from './balance-snapshot.mock';

const mockBalanceSnapshotEntity = {
  id: 'snapshot-id-123',
  accountId: 'account-id-123',
  snapshotDate: '2024-01-01',
  currentBalance: {
    amount: 100000,
    currency: 'USD',
    sign: MoneySign.CREDIT,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { currency: 'USD', amount: 100000 },
      sign: MoneySign.CREDIT,
    }),
  },
  availableBalance: {
    amount: 95000,
    currency: 'USD',
    sign: MoneySign.CREDIT,
    toMoneyWithSign: jest.fn().mockReturnValue({
      money: { currency: 'USD', amount: 95000 },
      sign: MoneySign.CREDIT,
    }),
  },
  snapshotType: BalanceSnapshotType.SYNC,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  toObject: jest.fn().mockReturnValue(mockBalanceSnapshot),
};

export const mockBalanceSnapshotRepository = {
  save: jest.fn().mockResolvedValue(mockBalanceSnapshotEntity),
  findOne: jest.fn().mockResolvedValue(mockBalanceSnapshotEntity),
  find: jest.fn().mockResolvedValue([mockBalanceSnapshotEntity]),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
};
