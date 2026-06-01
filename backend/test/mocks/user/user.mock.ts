import type { User } from '../../../src/types/User';

/** Standard mock timestamps for testing */
export const mockTimestamps = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
};

/**
 * Mock user
 */
export const mockUser: User = {
  id: 'user-uuid-123',
  email: 'test@example.com',
  settings: {
    currency: 'USD',
    timezone: 'UTC',
    hideZeroBalanceAccounts: false,
    theme: 'splice-dark',
    neutralizationLookaroundDays: 60,
    analysisSankeyEnabled: false,
    notifications: {
      transactions: {
        newSyncedTransactions: true,
      },
      bankLinks: {
        needsAttention: true,
      },
    },
  },
  ...mockTimestamps,
};

/**
 * Second mock user
 */
export const mockUser2: User = {
  id: 'user-uuid-456',
  email: 'test2@example.com',
  settings: {
    currency: 'USD',
    timezone: 'UTC',
    hideZeroBalanceAccounts: false,
    theme: 'splice-dark',
    neutralizationLookaroundDays: 60,
    analysisSankeyEnabled: false,
    notifications: {
      transactions: {
        newSyncedTransactions: true,
      },
      bankLinks: {
        needsAttention: true,
      },
    },
  },
  ...mockTimestamps,
};

export const mockOAuthLoginResponse = {
  accessToken: 'mock-jwt-token',
  refreshToken: 'mock-refresh-token',
  user: mockUser,
};
