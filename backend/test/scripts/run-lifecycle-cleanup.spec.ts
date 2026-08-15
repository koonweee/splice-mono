import {
  BANK_LINK_ARCHIVE_GUARDS_ENV,
  LIFECYCLE_CLEANUP_CONFIRMATION,
  readLifecycleCleanupGuards,
  runLifecycleCleanup,
} from '../../src/scripts/run-lifecycle-cleanup';

describe('lifecycle cleanup one-shot', () => {
  it('refuses without disabled schedules and exact confirmation', () => {
    expect(() => readLifecycleCleanupGuards({})).toThrow(
      'DISABLE_SCHEDULES=true',
    );
    expect(() =>
      readLifecycleCleanupGuards({ DISABLE_SCHEDULES: 'true' }),
    ).toThrow('confirmation');
  });

  it('parses exact guarded bank-link tuples without exposing them in results', () => {
    const guards = readLifecycleCleanupGuards({
      DISABLE_SCHEDULES: 'true',
      CONFIRM_LIFECYCLE_CLEANUP: LIFECYCLE_CLEANUP_CONFIRMATION,
      [BANK_LINK_ARCHIVE_GUARDS_ENV]: JSON.stringify([
        {
          bankLinkId: 'link-id',
          userId: 'user-id',
          expectedStatus: 'ERROR',
          expectedUpdatedAt: '2026-08-15T12:34:56.789Z',
        },
      ]),
    });

    expect(guards).toEqual([
      {
        bankLinkId: 'link-id',
        userId: 'user-id',
        expectedStatus: 'ERROR',
        expectedUpdatedAt: new Date('2026-08-15T12:34:56.789Z'),
      },
    ]);
  });

  it('rejects duplicate or inexact bank-link guards', () => {
    const baseEnvironment = {
      DISABLE_SCHEDULES: 'true',
      CONFIRM_LIFECYCLE_CLEANUP: LIFECYCLE_CLEANUP_CONFIRMATION,
    };
    expect(() =>
      readLifecycleCleanupGuards({
        ...baseEnvironment,
        [BANK_LINK_ARCHIVE_GUARDS_ENV]: JSON.stringify([
          {
            bankLinkId: 'link-id',
            userId: 'user-id',
            expectedStatus: 'OK',
            expectedUpdatedAt: '2026-08-15',
          },
        ]),
      }),
    ).toThrow('exact ISO updatedAt');
    expect(() =>
      readLifecycleCleanupGuards({
        ...baseEnvironment,
        [BANK_LINK_ARCHIVE_GUARDS_ENV]: JSON.stringify([
          {
            bankLinkId: 'link-id',
            userId: 'user-id',
            expectedStatus: 'OK',
            expectedUpdatedAt: '2026-08-15T12:34:56.789Z',
          },
          {
            bankLinkId: 'link-id',
            userId: 'user-id',
            expectedStatus: 'ERROR',
            expectedUpdatedAt: '2026-08-15T12:34:56.789Z',
          },
        ]),
      }),
    ).toThrow('duplicates an id');
  });

  it('runs bounded cleanups and reports only aggregate counts', async () => {
    const webhookCleanup = {
      cleanupExpiredPending: jest
        .fn()
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(2),
    };
    const refreshTokenCleanup = {
      cleanupInactiveTokens: jest
        .fn()
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(25),
    };
    const recommendationCleanup = {
      expireOldPendingSuggestions: jest.fn().mockResolvedValueOnce(10),
    };
    const notificationCleanup = {
      cleanupOldNotificationRecords: jest.fn().mockResolvedValueOnce({
        deliveries: 7,
        notifications: 3,
      }),
    };
    const bankLinkLifecycle = {
      archiveStaleEmptyBankLinks: jest.fn().mockResolvedValueOnce(3),
      archiveEmptyBankLink: jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false),
    };
    const now = new Date('2026-08-15T18:00:00.000Z');

    await expect(
      runLifecycleCleanup(
        {
          webhookCleanup,
          refreshTokenCleanup,
          recommendationCleanup,
          notificationCleanup,
          bankLinkLifecycle,
        },
        [
          {
            bankLinkId: 'link-1',
            userId: 'user-1',
            expectedStatus: 'ERROR',
            expectedUpdatedAt: now,
          },
          {
            bankLinkId: 'link-2',
            userId: 'user-2',
            expectedStatus: 'OK',
            expectedUpdatedAt: now,
          },
        ],
        now,
      ),
    ).resolves.toEqual({
      bankLinks: {
        automaticArchivedCount: 3,
        exactGuardRequestedCount: 2,
        exactGuardArchivedCount: 1,
        exactGuardAlreadyArchivedCount: 1,
      },
      webhookContexts: {
        affectedCount: 102,
        batchCount: 2,
        batchLimitReached: false,
      },
      refreshTokens: {
        affectedCount: 125,
        batchCount: 2,
        batchLimitReached: false,
      },
      suggestions: {
        affectedCount: 10,
        batchCount: 1,
        batchLimitReached: false,
      },
      notifications: {
        deliveryDeletedCount: 7,
        notificationDeletedCount: 3,
        batchCount: 1,
        batchLimitReached: false,
      },
    });
    expect(bankLinkLifecycle.archiveEmptyBankLink).toHaveBeenCalledTimes(2);
    expect(webhookCleanup.cleanupExpiredPending).toHaveBeenCalledTimes(2);
    expect(refreshTokenCleanup.cleanupInactiveTokens).toHaveBeenCalledTimes(2);
  });

  it('stops a full cleanup at ten batches and marks the limit', async () => {
    const webhookCleanup = {
      cleanupExpiredPending: jest.fn().mockResolvedValue(100),
    };
    const dependencies = {
      webhookCleanup,
      refreshTokenCleanup: {
        cleanupInactiveTokens: jest.fn().mockResolvedValue(0),
      },
      recommendationCleanup: {
        expireOldPendingSuggestions: jest.fn().mockResolvedValue(0),
      },
      notificationCleanup: {
        cleanupOldNotificationRecords: jest.fn().mockResolvedValue({
          deliveries: 0,
          notifications: 0,
        }),
      },
      bankLinkLifecycle: {
        archiveStaleEmptyBankLinks: jest.fn().mockResolvedValue(0),
        archiveEmptyBankLink: jest.fn(),
      },
    };

    const result = await runLifecycleCleanup(dependencies, []);

    expect(result.webhookContexts).toEqual({
      affectedCount: 1000,
      batchCount: 10,
      batchLimitReached: true,
    });
    expect(webhookCleanup.cleanupExpiredPending).toHaveBeenCalledTimes(10);
  });
});
