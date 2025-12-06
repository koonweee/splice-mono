/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { BankLinkScheduledService } from '../../src/bank-link/bank-link.scheduled';
import { BankLinkService } from '../../src/bank-link/bank-link.service';
import { mockBankLinkService } from '../mocks/bank-link/bank-link-service.mock';

describe('BankLinkScheduledService', () => {
  let scheduledService: BankLinkScheduledService;
  let bankLinkService: BankLinkService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankLinkScheduledService,
        {
          provide: BankLinkService,
          useValue: mockBankLinkService,
        },
      ],
    }).compile();

    scheduledService = module.get<BankLinkScheduledService>(
      BankLinkScheduledService,
    );
    bankLinkService = module.get<BankLinkService>(BankLinkService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleSyncAllAccounts', () => {
    it('should call syncAllAccountsSystem on the bank link service', async () => {
      await scheduledService.handleSyncAllAccounts();

      expect(bankLinkService.syncAllAccountsSystem).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Sync failed');
      jest
        .spyOn(bankLinkService, 'syncAllAccountsSystem')
        .mockRejectedValueOnce(error);

      // Should not throw
      await expect(
        scheduledService.handleSyncAllAccounts(),
      ).resolves.not.toThrow();
    });

    it('should complete successfully when accounts are synced', async () => {
      const mockAccounts = [
        { id: '1', name: 'Account 1' },
        { id: '2', name: 'Account 2' },
      ];
      jest
        .spyOn(bankLinkService, 'syncAllAccountsSystem')
        .mockResolvedValueOnce(mockAccounts as any);

      await scheduledService.handleSyncAllAccounts();

      expect(bankLinkService.syncAllAccountsSystem).toHaveBeenCalledTimes(1);
    });
  });
});
