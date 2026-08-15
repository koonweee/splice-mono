import {
  BANK_LINK_ARCHIVE_GUARDS_ENV,
  LIFECYCLE_CLEANUP_CONFIRMATION,
  readLifecycleCleanupGuards,
  runLifecycleCleanup,
} from '../../src/scripts/run-lifecycle-cleanup';
import { RefreshTokenCleanupService } from '../../src/auth/refresh-token-cleanup.service';
import { WebhookEventCleanupService } from '../../src/webhook-event/webhook-event-cleanup.service';

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
      archiveStaleEmptyBankLinks: jest
        .fn()
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(0),
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
        automaticBatchCount: 2,
        automaticBatchLimitReached: false,
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

  it('continues through TypeORM DELETE tuples until a partial batch', async () => {
    const returnedRows = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `${prefix}-${index}`,
      }));
    const webhookRepository = {
      query: jest
        .fn()
        .mockResolvedValueOnce([returnedRows('webhook-a', 100), 100])
        .mockResolvedValueOnce([returnedRows('webhook-b', 100), 100])
        .mockResolvedValueOnce([returnedRows('webhook-c', 4), 4]),
    };
    const refreshTokenRepository = {
      query: jest
        .fn()
        .mockResolvedValueOnce([returnedRows('token-a', 100), 100])
        .mockResolvedValueOnce([returnedRows('token-b', 100), 100])
        .mockResolvedValueOnce([returnedRows('token-c', 25), 25]),
    };

    const result = await runLifecycleCleanup(
      {
        webhookCleanup: new WebhookEventCleanupService(
          webhookRepository as never,
        ),
        refreshTokenCleanup: new RefreshTokenCleanupService(
          refreshTokenRepository as never,
        ),
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
      },
      [],
      new Date('2026-08-15T18:00:00.000Z'),
    );

    expect(result.webhookContexts).toEqual({
      affectedCount: 204,
      batchCount: 3,
      batchLimitReached: false,
    });
    expect(result.refreshTokens).toEqual({
      affectedCount: 225,
      batchCount: 3,
      batchLimitReached: false,
    });
    expect(webhookRepository.query).toHaveBeenCalledTimes(3);
    expect(refreshTokenRepository.query).toHaveBeenCalledTimes(3);
  });
});
