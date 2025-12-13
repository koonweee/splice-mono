/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
import { BankLinkScheduledService } from '../../src/bank-link/bank-link.scheduled';
import { BankLinkService } from '../../src/bank-link/bank-link.service';
import { mockBankLinkService } from '../mocks/bank-link/bank-link-service.mock';

describe('BankLinkScheduledService', () => {
  let scheduledService: BankLinkScheduledService;
  let bankLinkService: typeof mockBankLinkService;
  let mockBankLinkRepository: {
    find: jest.Mock;
  };

  beforeEach(async () => {
    mockBankLinkRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankLinkScheduledService,
        {
          provide: BankLinkService,
          useValue: mockBankLinkService,
        },
        {
          provide: getRepositoryToken(BankLinkEntity),
          useValue: mockBankLinkRepository,
        },
      ],
    }).compile();

    scheduledService = module.get<BankLinkScheduledService>(
      BankLinkScheduledService,
    );
    bankLinkService = module.get(BankLinkService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleDailySync', () => {
    it('should sync accounts for daily providers (excludes plaid and crypto)', async () => {
      const mockBankLinks = [
        { id: 'link-1', userId: 'user-1', providerName: 'simplefin' },
        { id: 'link-2', userId: 'user-2', providerName: 'simplefin' },
      ];
      mockBankLinkRepository.find.mockResolvedValueOnce(mockBankLinks);
      bankLinkService.syncAccounts.mockResolvedValue([]);

      await scheduledService.handleDailySync();

      expect(mockBankLinkRepository.find).toHaveBeenCalledWith({
        where: { providerName: expect.objectContaining({ _type: 'not' }) },
      });
      expect(bankLinkService.syncAccounts).toHaveBeenCalledTimes(2);
      expect(bankLinkService.syncAccounts).toHaveBeenCalledWith(
        'link-1',
        'user-1',
      );
      expect(bankLinkService.syncAccounts).toHaveBeenCalledWith(
        'link-2',
        'user-2',
      );
    });

    it('should handle errors gracefully', async () => {
      mockBankLinkRepository.find.mockRejectedValueOnce(
        new Error('Database error'),
      );

      // Should not throw
      await expect(scheduledService.handleDailySync()).resolves.not.toThrow();
    });

    it('should continue processing when one bank link fails', async () => {
      const mockBankLinks = [
        { id: 'link-1', userId: 'user-1', providerName: 'simplefin' },
        { id: 'link-2', userId: 'user-2', providerName: 'simplefin' },
      ];
      mockBankLinkRepository.find.mockResolvedValueOnce(mockBankLinks);
      bankLinkService.syncAccounts
        .mockRejectedValueOnce(new Error('Sync failed'))
        .mockResolvedValueOnce([]);

      await scheduledService.handleDailySync();

      // Both should have been attempted
      expect(bankLinkService.syncAccounts).toHaveBeenCalledTimes(2);
    });

    it('should complete successfully with no bank links', async () => {
      mockBankLinkRepository.find.mockResolvedValueOnce([]);

      await scheduledService.handleDailySync();

      expect(bankLinkService.syncAccounts).not.toHaveBeenCalled();
    });
  });

  describe('handleFrequentSync', () => {
    it('should sync accounts for frequent providers (crypto)', async () => {
      const mockBankLinks = [
        { id: 'link-1', userId: 'user-1', providerName: 'crypto' },
        { id: 'link-2', userId: 'user-2', providerName: 'crypto' },
      ];
      mockBankLinkRepository.find.mockResolvedValueOnce(mockBankLinks);
      bankLinkService.syncAccounts.mockResolvedValue([]);

      await scheduledService.handleFrequentSync();

      expect(mockBankLinkRepository.find).toHaveBeenCalledWith({
        where: { providerName: expect.objectContaining({ _type: 'in' }) },
      });
      expect(bankLinkService.syncAccounts).toHaveBeenCalledTimes(2);
      expect(bankLinkService.syncAccounts).toHaveBeenCalledWith(
        'link-1',
        'user-1',
      );
      expect(bankLinkService.syncAccounts).toHaveBeenCalledWith(
        'link-2',
        'user-2',
      );
    });

    it('should handle errors gracefully', async () => {
      mockBankLinkRepository.find.mockRejectedValueOnce(
        new Error('Database error'),
      );

      // Should not throw
      await expect(scheduledService.handleFrequentSync()).resolves.not.toThrow();
    });

    it('should complete successfully with no bank links', async () => {
      mockBankLinkRepository.find.mockResolvedValueOnce([]);

      await scheduledService.handleFrequentSync();

      expect(bankLinkService.syncAccounts).not.toHaveBeenCalled();
    });
  });
});
