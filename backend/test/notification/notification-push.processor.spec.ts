import { NotificationPushProcessor } from '../../src/notification/notification-push.processor';

describe('NotificationPushProcessor', () => {
  const notificationService = {
    claimPendingPushDeliveries: jest.fn(),
    sendPushDelivery: jest.fn(),
    cleanupOldPushDeliveries: jest.fn(),
  };
  let processor: NotificationPushProcessor;

  beforeEach(() => {
    jest.clearAllMocks();
    processor = new NotificationPushProcessor(notificationService as never);
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

  it('cleans up old push delivery rows', async () => {
    notificationService.cleanupOldPushDeliveries.mockResolvedValueOnce(3);

    await processor.cleanupOldPushDeliveries();

    expect(notificationService.cleanupOldPushDeliveries).toHaveBeenCalledTimes(
      1,
    );
  });
});
