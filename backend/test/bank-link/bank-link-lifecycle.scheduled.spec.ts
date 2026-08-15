import { BankLinkLifecycleScheduledService } from '../../src/bank-link/bank-link-lifecycle.scheduled';

describe('BankLinkLifecycleScheduledService', () => {
  const lifecycleService = {
    archiveStaleEmptyBankLinks: jest.fn(),
  };
  let service: BankLinkLifecycleScheduledService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BankLinkLifecycleScheduledService(lifecycleService as never);
  });

  it('runs the bounded empty-link archival sweep', async () => {
    lifecycleService.archiveStaleEmptyBankLinks.mockResolvedValueOnce(3);

    await expect(service.archiveStaleEmptyBankLinks()).resolves.toBeUndefined();

    expect(lifecycleService.archiveStaleEmptyBankLinks).toHaveBeenCalledTimes(
      1,
    );
  });

  it('contains cleanup failures so the cron remains healthy', async () => {
    lifecycleService.archiveStaleEmptyBankLinks.mockRejectedValueOnce(
      new Error('database unavailable'),
    );

    await expect(service.archiveStaleEmptyBankLinks()).resolves.toBeUndefined();
  });
});
