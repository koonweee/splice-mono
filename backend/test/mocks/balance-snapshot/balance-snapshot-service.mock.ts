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
  findSnapshotsForDateWithConversion: jest.fn().mockResolvedValue(new Map()),
  findByAccountIdAndDate: jest.fn().mockResolvedValue(mockBalanceSnapshot),
  findMostRecentBeforeDate: jest.fn().mockResolvedValue(mockBalanceSnapshot),
  upsert: jest.fn().mockResolvedValue(mockBalanceSnapshot),
  update: jest.fn().mockResolvedValue(mockBalanceSnapshot),
  remove: jest.fn().mockResolvedValue(true),
};
