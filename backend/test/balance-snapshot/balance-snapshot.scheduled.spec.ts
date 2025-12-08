/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountEntity } from '../../src/account/account.entity';
import { BalanceSnapshotScheduledService } from '../../src/balance-snapshot/balance-snapshot.scheduled';
import { BalanceSnapshotService } from '../../src/balance-snapshot/balance-snapshot.service';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { UserService } from '../../src/user/user.service';
import { mockBalanceSnapshot } from '../mocks/balance-snapshot/balance-snapshot.mock';

describe('BalanceSnapshotScheduledService', () => {
  let scheduledService: BalanceSnapshotScheduledService;
  let balanceSnapshotService: BalanceSnapshotService;
  let userService: UserService;
  let accountRepository: any;

  const mockAccountEntity1 = {
    id: 'account-1',
    userId: 'user-1',
  };

  const mockAccountEntity2 = {
    id: 'account-2',
    userId: 'user-2',
  };

  const mockBalanceSnapshotService = {
    findByAccountIdAndDate: jest.fn(),
    findMostRecentBeforeDate: jest.fn(),
    upsert: jest.fn(),
  };

  const mockUserService = {
    getTimezone: jest.fn().mockResolvedValue('America/Los_Angeles'),
  };

  const mockAccountRepository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceSnapshotScheduledService,
        {
          provide: BalanceSnapshotService,
          useValue: mockBalanceSnapshotService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: mockAccountRepository,
        },
      ],
    }).compile();

    scheduledService = module.get<BalanceSnapshotScheduledService>(
      BalanceSnapshotScheduledService,
    );
    balanceSnapshotService = module.get<BalanceSnapshotService>(
      BalanceSnapshotService,
    );
    userService = module.get<UserService>(UserService);
    accountRepository = module.get(getRepositoryToken(AccountEntity));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleForwardFillSnapshots', () => {
    it('should call forwardFillMissingSnapshots and log results', async () => {
      mockAccountRepository.find.mockResolvedValue([]);

      await scheduledService.handleForwardFillSnapshots();

      expect(accountRepository.find).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Database error');
      mockAccountRepository.find.mockRejectedValueOnce(error);

      // Should not throw
      await expect(
        scheduledService.handleForwardFillSnapshots(),
      ).resolves.not.toThrow();
    });
  });

  describe('forwardFillMissingSnapshots', () => {
    it('should return zero counts when no accounts exist', async () => {
      mockAccountRepository.find.mockResolvedValue([]);

      const result = await scheduledService.forwardFillMissingSnapshots();

      expect(result).toEqual({ created: 0, skipped: 0 });
      expect(accountRepository.find).toHaveBeenCalled();
    });

    it('should skip accounts that already have snapshots for yesterday', async () => {
      mockAccountRepository.find.mockResolvedValue([mockAccountEntity1]);
      mockBalanceSnapshotService.findByAccountIdAndDate.mockResolvedValue(
        mockBalanceSnapshot,
      );

      const result = await scheduledService.forwardFillMissingSnapshots();

      expect(result.created).toBe(0);
      expect(balanceSnapshotService.findByAccountIdAndDate).toHaveBeenCalled();
      expect(balanceSnapshotService.upsert).not.toHaveBeenCalled();
    });

    it('should skip accounts with no previous snapshot', async () => {
      mockAccountRepository.find.mockResolvedValue([mockAccountEntity1]);
      mockBalanceSnapshotService.findByAccountIdAndDate.mockResolvedValue(null);
      mockBalanceSnapshotService.findMostRecentBeforeDate.mockResolvedValue(
        null,
      );

      const result = await scheduledService.forwardFillMissingSnapshots();

      expect(result.created).toBe(0);
      expect(
        balanceSnapshotService.findMostRecentBeforeDate,
      ).toHaveBeenCalled();
      expect(balanceSnapshotService.upsert).not.toHaveBeenCalled();
    });

    it('should create forward-fill snapshot when previous snapshot exists', async () => {
      mockAccountRepository.find.mockResolvedValue([mockAccountEntity1]);
      mockBalanceSnapshotService.findByAccountIdAndDate.mockResolvedValue(null);
      mockBalanceSnapshotService.findMostRecentBeforeDate.mockResolvedValue(
        mockBalanceSnapshot,
      );
      mockBalanceSnapshotService.upsert.mockResolvedValue(mockBalanceSnapshot);

      const result = await scheduledService.forwardFillMissingSnapshots();

      expect(result.created).toBe(1);
      expect(balanceSnapshotService.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: mockAccountEntity1.id,
          currentBalance: mockBalanceSnapshot.currentBalance,
          availableBalance: mockBalanceSnapshot.availableBalance,
          snapshotType: BalanceSnapshotType.FORWARD_FILL,
        }),
        mockAccountEntity1.userId,
      );
    });

    it('should process multiple accounts and count correctly', async () => {
      mockAccountRepository.find.mockResolvedValue([
        mockAccountEntity1,
        mockAccountEntity2,
      ]);

      // First account: has existing snapshot (skip)
      // Second account: no existing, has previous (create)
      mockBalanceSnapshotService.findByAccountIdAndDate
        .mockResolvedValueOnce(mockBalanceSnapshot) // account 1: exists
        .mockResolvedValueOnce(null); // account 2: doesn't exist

      mockBalanceSnapshotService.findMostRecentBeforeDate.mockResolvedValue(
        mockBalanceSnapshot,
      );
      mockBalanceSnapshotService.upsert.mockResolvedValue(mockBalanceSnapshot);

      const result = await scheduledService.forwardFillMissingSnapshots();

      expect(result.created).toBe(1);
      expect(balanceSnapshotService.upsert).toHaveBeenCalledTimes(1);
    });

    it('should handle errors for individual accounts and continue processing', async () => {
      mockAccountRepository.find.mockResolvedValue([
        mockAccountEntity1,
        mockAccountEntity2,
      ]);

      // First account: throws error
      // Second account: succeeds
      mockBalanceSnapshotService.findByAccountIdAndDate
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(null);

      mockBalanceSnapshotService.findMostRecentBeforeDate.mockResolvedValue(
        mockBalanceSnapshot,
      );
      mockBalanceSnapshotService.upsert.mockResolvedValue(mockBalanceSnapshot);

      const result = await scheduledService.forwardFillMissingSnapshots();

      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
    });

    it('should use each user timezone to calculate yesterday date', async () => {
      mockAccountRepository.find.mockResolvedValue([
        mockAccountEntity1,
        mockAccountEntity2,
      ]);
      mockBalanceSnapshotService.findByAccountIdAndDate.mockResolvedValue(
        mockBalanceSnapshot,
      );

      // Different timezones for different users
      mockUserService.getTimezone
        .mockResolvedValueOnce('America/New_York')
        .mockResolvedValueOnce('Asia/Tokyo');

      await scheduledService.forwardFillMissingSnapshots();

      expect(userService.getTimezone).toHaveBeenCalledWith(
        mockAccountEntity1.userId,
      );
      expect(userService.getTimezone).toHaveBeenCalledWith(
        mockAccountEntity2.userId,
      );
    });
  });
});
