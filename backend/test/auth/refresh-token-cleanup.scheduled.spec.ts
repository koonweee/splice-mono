import { RefreshTokenCleanupScheduledService } from '../../src/auth/refresh-token-cleanup.scheduled';
import { RefreshTokenCleanupService } from '../../src/auth/refresh-token-cleanup.service';

describe('RefreshTokenCleanupScheduledService', () => {
  it('stops after a partial cleanup batch', async () => {
    const cleanupService = {
      cleanupInactiveTokens: jest
        .fn()
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(4),
    } as unknown as RefreshTokenCleanupService;
    const service = new RefreshTokenCleanupScheduledService(cleanupService);

    await service.handleCleanup();

    expect(cleanupService.cleanupInactiveTokens).toHaveBeenCalledTimes(2);
  });

  it('caps each scheduled run at ten batches', async () => {
    const cleanupService = {
      cleanupInactiveTokens: jest.fn().mockResolvedValue(100),
    } as unknown as RefreshTokenCleanupService;
    const service = new RefreshTokenCleanupScheduledService(cleanupService);

    await service.handleCleanup();

    expect(cleanupService.cleanupInactiveTokens).toHaveBeenCalledTimes(10);
  });
});
