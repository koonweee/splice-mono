import { NotificationPushProcessor } from '../../src/notification/notification-push.processor';

describe('NotificationPushProcessor', () => {
  const notificationService = {
    claimPendingPushDeliveries: jest.fn(),
    sendPushDelivery: jest.fn(),
    cleanupOldNotificationRecords: jest.fn(),
  };
  let processor: NotificationPushProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new NotificationPushProcessor(notificationService as never);
  });

  it('can pause delivery processing without taking the API offline', async () => {
    const previous = process.env.PUSH_PROCESSING_ENABLED;
    process.env.PUSH_PROCESSING_ENABLED = 'false';
    try {
      await processor.processPendingPushDeliveries();
      expect(
        notificationService.claimPendingPushDeliveries,
      ).not.toHaveBeenCalled();
      process.env.PUSH_PROCESSING_ENABLED = 'true';
      notificationService.claimPendingPushDeliveries.mockResolvedValueOnce([]);
      await processor.processPendingPushDeliveries();
      expect(
        notificationService.claimPendingPushDeliveries,
      ).toHaveBeenCalledTimes(1);
    } finally {
      if (previous === undefined) delete process.env.PUSH_PROCESSING_ENABLED;
      else process.env.PUSH_PROCESSING_ENABLED = previous;
    }
  });

  it('processes a bounded batch of claimed push deliveries', async () => {
    const deliveries = [{ id: 'delivery-1' }, { id: 'delivery-2' }];
    notificationService.claimPendingPushDeliveries.mockResolvedValueOnce(
      deliveries,
    );
    notificationService.sendPushDelivery.mockResolvedValue(undefined);

    await processor.processPendingPushDeliveries();

    expect(notificationService.claimPendingPushDeliveries).toHaveBeenCalledWith(
      25,
    );
    expect(notificationService.sendPushDelivery).toHaveBeenCalledTimes(2);
  });

  it('runs at most four sends, contains rejection, and unlocks the next tick', async () => {
    const deliveries = Array.from({ length: 9 }, (_, index) => ({
      id: String(index),
    }));
    notificationService.claimPendingPushDeliveries.mockResolvedValue(
      deliveries,
    );
    let active = 0;
    let maximum = 0;
    const releases: Array<() => void> = [];
    notificationService.sendPushDelivery.mockImplementation(
      async (delivery: { id: string }) => {
        active++;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
        if (delivery.id === '1') throw new Error('synthetic');
      },
    );
    const pending = processor.processPendingPushDeliveries();
    await Promise.resolve();
    expect(active).toBe(4);
    await processor.processPendingPushDeliveries();
    expect(
      notificationService.claimPendingPushDeliveries,
    ).toHaveBeenCalledTimes(1);
    while (releases.length) {
      releases.splice(0).forEach((resolve) => resolve());
      for (let index = 0; index < 5; index++) await Promise.resolve();
    }
    await pending;
    expect(maximum).toBe(4);
    expect(notificationService.sendPushDelivery).toHaveBeenCalledTimes(9);
    notificationService.claimPendingPushDeliveries.mockResolvedValueOnce([]);
    await processor.processPendingPushDeliveries();
    expect(
      notificationService.claimPendingPushDeliveries,
    ).toHaveBeenCalledTimes(2);
  });

  it('cleans up old push delivery rows', async () => {
    notificationService.cleanupOldNotificationRecords.mockResolvedValueOnce({
      deliveries: 3,
      notifications: 2,
    });

    await processor.cleanupOldNotificationRecords();

    expect(
      notificationService.cleanupOldNotificationRecords,
    ).toHaveBeenCalledTimes(1);
  });
});
