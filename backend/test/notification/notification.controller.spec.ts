import { NotificationController } from '../../src/notification/notification.controller';

const user = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'user@example.com',
};

describe('NotificationController', () => {
  const notificationService = {
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
    ).toHaveBeenCalledWith(user.userId, 'https://push.example.com');
  });

  it('registers current browser push subscription', async () => {
    notificationService.registerPushSubscription.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000010',
      endpoint: 'https://push.example.com',
      revokedAt: null,
    });

    await expect(
      controller.registerPushSubscription(user, {
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
