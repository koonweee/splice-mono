import { NotificationPushDeliveryEntity } from '../../src/notification/notification-push-delivery.entity';
import { NotificationEntity } from '../../src/notification/notification.entity';
import { NotificationService } from '../../src/notification/notification.service';
import { PushSubscriptionEntity } from '../../src/notification/push-subscription.entity';
import type { User } from '../../src/types/User';
import type { UserSettings } from '../../src/types/UserSettings';

const userId = '00000000-0000-4000-8000-000000000001';
const transactionId = '00000000-0000-4000-8000-000000000101';
const accountId = '00000000-0000-4000-8000-000000000201';

const enabledSettings: UserSettings = {
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
  },
};

function buildUser(settings: UserSettings): User {
  return {
    id: userId,
    email: 'user@example.com',
    settings,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function buildSubscription(id: string): PushSubscriptionEntity {
  const entity = new PushSubscriptionEntity();
  entity.id = id;
  entity.userId = userId;
  entity.endpoint = `https://push.example.com/${id}`;
  entity.p256dh = 'p256dh';
  entity.auth = 'auth';
  entity.userAgent = 'test';
  entity.revokedAt = null;
  entity.createdAt = new Date('2026-01-01T00:00:00.000Z');
  entity.updatedAt = new Date('2026-01-01T00:00:00.000Z');
  return entity;
}

describe('NotificationService', () => {
  const notificationRepository = {
    manager: {
      transaction: jest.fn(),
    },
    save: jest.fn(),
  };
  const pushSubscriptionRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const pushDeliveryRepository = {
    manager: {
      transaction: jest.fn(),
    },
    save: jest.fn(),
    delete: jest.fn(),
  };
  const userService = {
    findOne: jest.fn(),
    enableDefaultNotificationsIfUnset: jest.fn(),
  };
  const webPushAdapter = {
    isConfigured: jest.fn(),
    getPublicKey: jest.fn(),
    send: jest.fn(),
  };

  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService(
      notificationRepository as never,
      pushSubscriptionRepository as never,
      pushDeliveryRepository as never,
      userService as never,
      webPushAdapter as never,
    );
  });

  it('skips canonical notification creation when type preference is disabled', async () => {
    userService.findOne.mockResolvedValueOnce(
      buildUser({
        ...enabledSettings,
        notifications: {
          transactions: {
            newSyncedTransactions: false,
          },
        },
      }),
    );

    await expect(
      service.createNewSyncedTransactionsNotification({
        userId,
        transactionIds: [transactionId],
        accountIds: [accountId],
        count: 1,
        occurredAt: '2026-01-01T00:00:00.000Z',
      }),
    ).resolves.toBeNull();

    expect(notificationRepository.manager.transaction).not.toHaveBeenCalled();
  });

  it('creates a canonical notification without push deliveries when no subscriptions exist', async () => {
    const savedNotification = new NotificationEntity();
    savedNotification.id = '00000000-0000-4000-8000-000000000301';
    savedNotification.userId = userId;
    savedNotification.type = 'transactions.new_synced';
    savedNotification.dedupeKey = 'dedupe';
    savedNotification.payload = {
      count: 1,
      transactionIds: [transactionId],
      accountIds: [accountId],
      occurredAt: '2026-01-01T00:00:00.000Z',
    };
    savedNotification.status = 'active';
    savedNotification.readAt = null;
    savedNotification.archivedAt = null;
    savedNotification.createdAt = new Date('2026-01-01T00:00:00.000Z');
    savedNotification.updatedAt = new Date('2026-01-01T00:00:00.000Z');

    const notificationRepo = {
      save: jest.fn().mockResolvedValue(savedNotification),
    };
    const subscriptionRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    const deliveryRepo = {
      save: jest.fn(),
    };

    userService.findOne.mockResolvedValueOnce(buildUser(enabledSettings));
    webPushAdapter.isConfigured.mockReturnValue(true);
    notificationRepository.manager.transaction.mockImplementationOnce(
      async (
        callback: (manager: {
          getRepository: (entity: unknown) => unknown;
        }) => unknown,
      ) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === NotificationEntity) return notificationRepo;
            if (entity === PushSubscriptionEntity) return subscriptionRepo;
            return deliveryRepo;
          },
        }),
    );

    const result = await service.createNewSyncedTransactionsNotification({
      userId,
      transactionIds: [transactionId],
      accountIds: [accountId],
      count: 1,
      occurredAt: '2026-01-01T00:00:00.000Z',
    });

    expect(result?.id).toBe(savedNotification.id);
    expect(deliveryRepo.save).not.toHaveBeenCalled();
  });

  it('creates push delivery rows for each active subscription', async () => {
    const savedNotification = new NotificationEntity();
    savedNotification.id = '00000000-0000-4000-8000-000000000301';
    savedNotification.userId = userId;
    savedNotification.type = 'transactions.new_synced';
    savedNotification.dedupeKey = 'dedupe';
    savedNotification.payload = {
      count: 2,
      transactionIds: [transactionId],
      accountIds: [accountId],
      occurredAt: '2026-01-01T00:00:00.000Z',
    };
    savedNotification.status = 'active';
    savedNotification.readAt = null;
    savedNotification.archivedAt = null;
    savedNotification.createdAt = new Date('2026-01-01T00:00:00.000Z');
    savedNotification.updatedAt = new Date('2026-01-01T00:00:00.000Z');

    const subscriptions = [
      buildSubscription('00000000-0000-4000-8000-000000000401'),
      buildSubscription('00000000-0000-4000-8000-000000000402'),
    ];
    const notificationRepo = {
      save: jest.fn().mockResolvedValue(savedNotification),
    };
    const subscriptionRepo = {
      find: jest.fn().mockResolvedValue(subscriptions),
    };
    const deliveryRepo = {
      save: jest.fn().mockResolvedValue([]),
    };

    userService.findOne.mockResolvedValueOnce(buildUser(enabledSettings));
    webPushAdapter.isConfigured.mockReturnValue(true);
    notificationRepository.manager.transaction.mockImplementationOnce(
      async (
        callback: (manager: {
          getRepository: (entity: unknown) => unknown;
        }) => unknown,
      ) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === NotificationEntity) return notificationRepo;
            if (entity === PushSubscriptionEntity) return subscriptionRepo;
            return deliveryRepo;
          },
        }),
    );

    await service.createNewSyncedTransactionsNotification({
      userId,
      transactionIds: [transactionId],
      accountIds: [accountId],
      count: 2,
      occurredAt: '2026-01-01T00:00:00.000Z',
    });

    const deliveries = deliveryRepo.save.mock
      .calls[0][0] as NotificationPushDeliveryEntity[];
    expect(deliveries).toHaveLength(2);
    expect(deliveries.map((delivery) => delivery.subscriptionId)).toEqual(
      subscriptions.map((subscription) => subscription.id),
    );
  });

  it('treats dedupe unique conflicts as idempotent no-ops', async () => {
    userService.findOne.mockResolvedValueOnce(buildUser(enabledSettings));
    notificationRepository.manager.transaction.mockRejectedValueOnce({
      code: '23505',
    });

    await expect(
      service.createNewSyncedTransactionsNotification({
        userId,
        transactionIds: [transactionId],
        accountIds: [accountId],
        count: 1,
        occurredAt: '2026-01-01T00:00:00.000Z',
      }),
    ).resolves.toBeNull();
  });

  it('renders count-only push payloads', () => {
    const notification = new NotificationEntity();
    notification.id = '00000000-0000-4000-8000-000000000301';
    notification.type = 'transactions.new_synced';
    notification.payload = {
      count: 3,
      transactionIds: [transactionId],
      accountIds: [accountId],
      occurredAt: '2026-01-01T00:00:00.000Z',
    };

    expect(service.renderPushPayload(notification)).toEqual({
      title: 'New transactions synced',
      body: '3 new transactions were added',
      url: '/transactions?categoryId=UNCATEGORIZED',
      tag: notification.id,
    });
  });

  it('creates a test notification and queues active subscription deliveries', async () => {
    const savedNotification = new NotificationEntity();
    savedNotification.id = '00000000-0000-4000-8000-000000000302';
    savedNotification.userId = userId;
    savedNotification.type = 'system.test';
    savedNotification.dedupeKey = 'system.test:dedupe';
    savedNotification.payload = {
      occurredAt: '2026-01-01T00:00:00.000Z',
    };
    savedNotification.status = 'active';
    savedNotification.readAt = null;
    savedNotification.archivedAt = null;
    savedNotification.createdAt = new Date('2026-01-01T00:00:00.000Z');
    savedNotification.updatedAt = new Date('2026-01-01T00:00:00.000Z');

    const subscriptions = [
      buildSubscription('00000000-0000-4000-8000-000000000401'),
    ];
    const notificationRepo = {
      save: jest.fn().mockResolvedValue(savedNotification),
    };
    const subscriptionRepo = {
      find: jest.fn().mockResolvedValue(subscriptions),
    };
    const deliveryRepo = {
      save: jest.fn().mockResolvedValue([]),
    };

    webPushAdapter.isConfigured.mockReturnValue(true);
    notificationRepository.manager.transaction.mockImplementationOnce(
      async (
        callback: (manager: {
          getRepository: (entity: unknown) => unknown;
        }) => unknown,
      ) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === NotificationEntity) return notificationRepo;
            if (entity === PushSubscriptionEntity) return subscriptionRepo;
            return deliveryRepo;
          },
        }),
    );

    const result = await service.createTestNotification(userId);

    expect(result).toMatchObject({
      deliveryCount: 1,
      pushConfigured: true,
      notification: {
        id: savedNotification.id,
        type: 'system.test',
      },
    });
    expect(deliveryRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        notificationId: savedNotification.id,
        subscriptionId: subscriptions[0].id,
        status: 'pending',
      }),
    ]);
  });

  it('renders test notification push payloads', () => {
    const notification = new NotificationEntity();
    notification.id = '00000000-0000-4000-8000-000000000302';
    notification.type = 'system.test';
    notification.payload = {
      occurredAt: '2026-01-01T00:00:00.000Z',
    };

    expect(service.renderPushPayload(notification)).toEqual({
      title: 'Splice test notification',
      body: 'Push notifications are working.',
      url: '/settings?tab=notifications',
      tag: notification.id,
    });
  });

  it('revokes expired subscriptions on web push 410 responses', async () => {
    const delivery = new NotificationPushDeliveryEntity();
    delivery.id = '00000000-0000-4000-8000-000000000501';
    delivery.status = 'processing';
    delivery.attemptCount = 1;
    delivery.notification = new NotificationEntity();
    delivery.notification.id = '00000000-0000-4000-8000-000000000301';
    delivery.notification.type = 'transactions.new_synced';
    delivery.notification.payload = {
      count: 1,
      transactionIds: [transactionId],
      accountIds: [accountId],
      occurredAt: '2026-01-01T00:00:00.000Z',
    };
    delivery.subscription = buildSubscription(
      '00000000-0000-4000-8000-000000000401',
    );
    webPushAdapter.send.mockRejectedValueOnce({
      statusCode: 410,
      message: 'Gone',
    });
    pushSubscriptionRepository.save.mockResolvedValueOnce(
      delivery.subscription,
    );
    pushDeliveryRepository.save.mockResolvedValueOnce(delivery);

    await service.sendPushDelivery(delivery);

    expect(delivery.status).toBe('failed');
    expect(delivery.subscription.revokedAt).toBeInstanceOf(Date);
    expect(pushSubscriptionRepository.save).toHaveBeenCalledWith(
      delivery.subscription,
    );
  });

  it('retries transient push failures and caps attempts', async () => {
    const delivery = new NotificationPushDeliveryEntity();
    delivery.id = '00000000-0000-4000-8000-000000000501';
    delivery.status = 'processing';
    delivery.attemptCount = 1;
    delivery.notification = new NotificationEntity();
    delivery.notification.id = '00000000-0000-4000-8000-000000000301';
    delivery.notification.type = 'transactions.new_synced';
    delivery.notification.payload = {
      count: 1,
      transactionIds: [transactionId],
      accountIds: [accountId],
      occurredAt: '2026-01-01T00:00:00.000Z',
    };
    delivery.subscription = buildSubscription(
      '00000000-0000-4000-8000-000000000401',
    );
    webPushAdapter.send.mockRejectedValueOnce(new Error('temporary'));
    pushDeliveryRepository.save.mockResolvedValueOnce(delivery);

    await service.sendPushDelivery(delivery);

    expect(delivery.status).toBe('pending');
    expect(delivery.availableAt).toBeInstanceOf(Date);

    delivery.attemptCount = 3;
    webPushAdapter.send.mockRejectedValueOnce(new Error('temporary'));
    pushDeliveryRepository.save.mockResolvedValueOnce(delivery);

    await service.sendPushDelivery(delivery);

    expect(delivery.status).toBe('failed');
  });

  it('claims pending and stale processing push deliveries for processing', async () => {
    const pendingDelivery = new NotificationPushDeliveryEntity();
    pendingDelivery.id = '00000000-0000-4000-8000-000000000501';
    pendingDelivery.status = 'pending';
    pendingDelivery.attemptCount = 0;

    const staleProcessingDelivery = new NotificationPushDeliveryEntity();
    staleProcessingDelivery.id = '00000000-0000-4000-8000-000000000502';
    staleProcessingDelivery.status = 'processing';
    staleProcessingDelivery.attemptCount = 1;
    staleProcessingDelivery.processingStartedAt = new Date(
      '2026-01-01T00:00:00.000Z',
    );

    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([pendingDelivery, staleProcessingDelivery]),
    };
    const deliveryRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      save: jest
        .fn()
        .mockImplementation(
          (deliveries: NotificationPushDeliveryEntity[]) => deliveries,
        ),
      find: jest
        .fn()
        .mockResolvedValue([pendingDelivery, staleProcessingDelivery]),
    };
    pushDeliveryRepository.manager.transaction.mockImplementationOnce(
      async (
        callback: (manager: {
          getRepository: (entity: unknown) => unknown;
        }) => unknown,
      ) =>
        callback({
          getRepository: () => deliveryRepo,
        }),
    );

    const result = await service.claimPendingPushDeliveries(25);

    expect(queryBuilder.innerJoin).toHaveBeenCalledWith(
      'delivery.subscription',
      'subscription',
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(expect.any(Object));
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'subscription.revokedAt IS NULL',
    );
    expect(queryBuilder.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
      undefined,
      ['delivery'],
    );
    expect(queryBuilder.setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(deliveryRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        id: pendingDelivery.id,
        status: 'processing',
        attemptCount: 1,
      }),
      expect.objectContaining({
        id: staleProcessingDelivery.id,
        status: 'processing',
        attemptCount: 2,
      }),
    ]);
    expect(deliveryRepo.find).toHaveBeenCalledWith({
      where: { id: expect.any(Object) },
      relations: {
        notification: true,
        subscription: true,
      },
    });
    expect(result).toHaveLength(2);
    expect(result.map((delivery) => delivery.status)).toEqual([
      'processing',
      'processing',
    ]);
    expect(result.map((delivery) => delivery.attemptCount)).toEqual([1, 2]);
  });

  it('does not save or reload push deliveries when no rows are claimed', async () => {
    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const deliveryRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      save: jest.fn(),
      find: jest.fn(),
    };
    pushDeliveryRepository.manager.transaction.mockImplementationOnce(
      async (
        callback: (manager: {
          getRepository: (entity: unknown) => unknown;
        }) => unknown,
      ) =>
        callback({
          getRepository: () => deliveryRepo,
        }),
    );

    await expect(service.claimPendingPushDeliveries(25)).resolves.toEqual([]);

    expect(queryBuilder.setLock).toHaveBeenCalledWith(
      'pessimistic_write',
      undefined,
      ['delivery'],
    );
    expect(deliveryRepo.save).not.toHaveBeenCalled();
    expect(deliveryRepo.find).not.toHaveBeenCalled();
  });

  it('cleans up push delivery rows older than thirty days', async () => {
    pushDeliveryRepository.delete.mockResolvedValueOnce({ affected: 4 });

    await expect(
      service.cleanupOldPushDeliveries(new Date('2026-02-01T00:00:00.000Z')),
    ).resolves.toBe(4);

    expect(pushDeliveryRepository.delete).toHaveBeenCalledWith({
      createdAt: expect.any(Object),
    });
  });
});
