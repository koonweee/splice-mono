import {
  BalanceSnapshot,
  BalanceSnapshotType,
  CreateBalanceSnapshotDto,
} from '../../../src/types/BalanceSnapshot';
import { MoneySign } from '../../../src/types/MoneyWithSign';

/** Standard mock timestamps for testing */
export const mockTimestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

/** Mock user ID for testing */
export const mockUserId = 'user-uuid-123';

/**
 * Mock balance snapshot from a sync operation
 */
export const mockBalanceSnapshot: BalanceSnapshot = {
  id: 'snapshot-id-123',
  userId: mockUserId,
  accountId: 'account-id-123',
  snapshotDate: '2024-01-01',
  currentBalance: {
    money: { currency: 'USD', amount: 100000 }, // $1,000.00 in cents
    sign: MoneySign.POSITIVE,
  },
  availableBalance: {
    money: { currency: 'USD', amount: 95000 }, // $950.00 in cents
    sign: MoneySign.POSITIVE,
  },
  snapshotType: BalanceSnapshotType.SYNC,
  ...mockTimestamps,
};

/**
 * Mock balance snapshot from a user update
 */
export const mockBalanceSnapshot2: BalanceSnapshot = {
  id: 'snapshot-id-456',
  userId: mockUserId,
  accountId: 'account-id-123',
  snapshotDate: '2024-01-02',
  currentBalance: {
    money: { currency: 'USD', amount: 150000 }, // $1,500.00 in cents
    sign: MoneySign.POSITIVE,
  },
  availableBalance: {
    money: { currency: 'USD', amount: 145000 }, // $1,450.00 in cents
    sign: MoneySign.POSITIVE,
  },
  snapshotType: BalanceSnapshotType.USER_UPDATE,
  ...mockTimestamps,
};

/**
 * Mock DTO for creating a balance snapshot
 */
export const mockCreateBalanceSnapshotDto: CreateBalanceSnapshotDto = {
  accountId: 'account-id-123',
  snapshotDate: '2024-01-01',
  currentBalance: {
    money: { currency: 'USD', amount: 100000 },
    sign: MoneySign.POSITIVE,
  },
  availableBalance: {
    money: { currency: 'USD', amount: 95000 },
    sign: MoneySign.POSITIVE,
  },
  snapshotType: BalanceSnapshotType.SYNC,
};
