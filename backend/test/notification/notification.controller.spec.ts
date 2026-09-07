import { RegisterPushSubscriptionDtoSchema } from '../../src/types/Notification';
import { ZodValidationPipe } from '../../src/zod-validation/zod-validation.pipe';
import { NotificationController } from '../../src/notification/notification.controller';

const user = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'user@example.com',
};

describe('NotificationController', () => {
  const notificationService = {
    archiveAll: jest.fn(),
    getPushConfig: jest.fn(),
    getCurrentSubscriptionStatus: jest.fn(),
    registerPushSubscription: jest.fn(),
    createTestNotification: jest.fn(),
    revokeCurrentPushSubscription: jest.fn(),
    revokeAllPushSubscriptions: jest.fn(),
  };
  let controller: NotificationController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new NotificationController(notificationService as never);
  });

  it('refuses enrollment from a legacy client without the privacy-aware worker protocol', () => {
    const pipe = new ZodValidationPipe(RegisterPushSubscriptionDtoSchema);
    const legacy = {
      endpoint: 'https://push.example.test',
      keys: { p256dh: 'synthetic', auth: 'synthetic' },
    };
    expect(() => pipe.transform(legacy)).toThrow();
    expect(pipe.transform({ ...legacy, protocolVersion: 2 })).toMatchObject({
      protocolVersion: 2,
    });
  });

  it('returns push config', () => {
    notificationService.getPushConfig.mockReturnValueOnce({
      configured: true,
      vapidPublicKey: 'public-key',
    });

    expect(controller.getPushConfig()).toEqual({
      configured: true,
      vapidPublicKey: 'public-key',
    });
  });

  it('dismisses every notification owned by the current user', async () => {
    notificationService.archiveAll.mockResolvedValueOnce(undefined);

    await expect(controller.archiveAll(user)).resolves.toBeUndefined();

    expect(notificationService.archiveAll).toHaveBeenCalledWith(user.userId);
  });

  it('returns current subscription status by endpoint', async () => {
    notificationService.getCurrentSubscriptionStatus.mockResolvedValueOnce({
      configured: true,
      subscribed: true,
    });

    await expect(
      controller.getCurrentSubscriptionStatus(user, 'https://push.example.com'),
    ).resolves.toEqual({
      configured: true,
      subscribed: true,
    });

    expect(
      notificationService.getCurrentSubscriptionStatus,
    ).toHaveBeenCalledWith(user.userId, 'https://push.example.com', undefined);
  });

  it('registers current browser push subscription', async () => {
    notificationService.registerPushSubscription.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000010',
      endpoint: 'https://push.example.com',
      revokedAt: null,
    });

    await expect(
      controller.registerPushSubscription(user, {
        protocolVersion: 2,
        endpoint: 'https://push.example.com',
        keys: { p256dh: 'p256dh', auth: 'auth' },
      }),
    ).resolves.toEqual({
      id: '00000000-0000-4000-8000-000000000010',
      endpoint: 'https://push.example.com',
      revokedAt: null,
    });
  });

  it('queues a test notification for the current user', async () => {
    notificationService.createTestNotification.mockResolvedValueOnce({
      notification: {
        id: '00000000-0000-4000-8000-000000000020',
        userId: user.userId,
        type: 'system.test',
        dedupeKey: 'system.test:dedupe',
        payload: {
          occurredAt: '2026-01-01T00:00:00.000Z',
        },
        status: 'active',
        readAt: null,
        archivedAt: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      deliveryCount: 1,
      pushConfigured: true,
    });

    await expect(controller.sendTestNotification(user)).resolves.toMatchObject({
      deliveryCount: 1,
      pushConfigured: true,
      notification: {
        type: 'system.test',
      },
    });

    expect(notificationService.createTestNotification).toHaveBeenCalledWith(
      user.userId,
    );
  });

  it('revokes current and all push subscriptions', async () => {
    notificationService.revokeCurrentPushSubscription.mockResolvedValueOnce(
      true,
    );
    notificationService.revokeAllPushSubscriptions.mockResolvedValueOnce(2);

    await expect(
      controller.revokeCurrentPushSubscription(user, {
        endpoint: 'https://push.example.com',
      }),
    ).resolves.toBeUndefined();
    await expect(
      controller.revokeAllPushSubscriptions(user),
    ).resolves.toBeUndefined();

    expect(
      notificationService.revokeCurrentPushSubscription,
    ).toHaveBeenCalledWith(user.userId, 'https://push.example.com');
    expect(notificationService.revokeAllPushSubscriptions).toHaveBeenCalledWith(
      user.userId,
    );
  });
});
