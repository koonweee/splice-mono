import { mockBalanceSnapshot } from './balance-snapshot.mock';

export const mockBalanceSnapshotService = {
  create: jest.fn().mockResolvedValue(mockBalanceSnapshot),
  findOne: jest.fn().mockResolvedValue(mockBalanceSnapshot),
  findAll: jest.fn().mockResolvedValue([mockBalanceSnapshot]),
  findByAccountId: jest.fn().mockResolvedValue([mockBalanceSnapshot]),
  update: jest.fn().mockResolvedValue(mockBalanceSnapshot),
  remove: jest.fn().mockResolvedValue(true),
};
