import { WebhookEventCleanupScheduledService } from '../../src/webhook-event/webhook-event-cleanup.scheduled';
import { WebhookEventCleanupService } from '../../src/webhook-event/webhook-event-cleanup.service';

describe('WebhookEventCleanupScheduledService', () => {
  it('stops after a partial cleanup batch', async () => {
    const cleanupService = {
      cleanupExpiredPending: jest
        .fn()
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(4),
    } as unknown as WebhookEventCleanupService;
    const service = new WebhookEventCleanupScheduledService(cleanupService);

    await service.handleCleanup();

    expect(cleanupService.cleanupExpiredPending).toHaveBeenCalledTimes(2);
  });

  it('caps each scheduled run at ten batches', async () => {
    const cleanupService = {
      cleanupExpiredPending: jest.fn().mockResolvedValue(100),
    } as unknown as WebhookEventCleanupService;
    const service = new WebhookEventCleanupScheduledService(cleanupService);

    await service.handleCleanup();

    expect(cleanupService.cleanupExpiredPending).toHaveBeenCalledTimes(10);
  });
});
