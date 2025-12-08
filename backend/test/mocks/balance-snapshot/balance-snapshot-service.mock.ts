import {
  mockBalanceSnapshot,
  mockBalanceSnapshotWithConversion,
} from './balance-snapshot.mock';

export const mockBalanceSnapshotService = {
  create: jest.fn().mockResolvedValue(mockBalanceSnapshot),
  findOne: jest.fn().mockResolvedValue(mockBalanceSnapshot),
  findAll: jest.fn().mockResolvedValue([mockBalanceSnapshot]),
  findByAccountId: jest.fn().mockResolvedValue([mockBalanceSnapshot]),
  findAllWithConversion: jest
    .fn()
    .mockResolvedValue([mockBalanceSnapshotWithConversion]),
  findByAccountIdWithConversion: jest
    .fn()
    .mockResolvedValue([mockBalanceSnapshotWithConversion]),
  update: jest.fn().mockResolvedValue(mockBalanceSnapshot),
  remove: jest.fn().mockResolvedValue(true),
};
