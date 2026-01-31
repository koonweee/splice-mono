import { Test, TestingModule } from '@nestjs/testing';
import { BalanceSnapshotListener } from '../../src/balance-snapshot/balance-snapshot.listener';
import { BalanceSnapshotService } from '../../src/balance-snapshot/balance-snapshot.service';
import {
  LinkedAccountCreatedEvent,
  LinkedAccountUpdatedEvent,
  ManualAccountBalanceUpdatedEvent,
  ManualAccountCreatedEvent,
} from '../../src/events/account.events';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { UserService } from '../../src/user/user.service';
import { mockAccount, mockManualAccount } from '../mocks/account/account.mock';
import { mockBalanceSnapshot } from '../mocks/balance-snapshot/balance-snapshot.mock';
import { mockUserService } from '../mocks/user/user-service.mock';

const mockBalanceSnapshotService = {
  upsert: jest.fn().mockResolvedValue(mockBalanceSnapshot),
};

describe('BalanceSnapshotListener', () => {
  let listener: BalanceSnapshotListener;
  let balanceSnapshotService: typeof mockBalanceSnapshotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceSnapshotListener,
        {
          provide: BalanceSnapshotService,
          useValue: mockBalanceSnapshotService,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
      ],
    }).compile();

    listener = module.get<BalanceSnapshotListener>(BalanceSnapshotListener);
    balanceSnapshotService = module.get(BalanceSnapshotService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleLinkedAccountChanged', () => {
    it('should upsert a balance snapshot when linked account is created', async () => {
      const event = new LinkedAccountCreatedEvent(mockAccount);

      await listener.handleLinkedAccountChanged(event);

      expect(balanceSnapshotService.upsert).toHaveBeenCalledWith(
        {
          accountId: mockAccount.id,
          currentBalance: mockAccount.currentBalance,
          availableBalance: mockAccount.availableBalance,
          snapshotType: BalanceSnapshotType.SYNC,
          snapshotDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
        },
        mockAccount.userId,
      );
    });

    it('should upsert a balance snapshot when linked account is updated', async () => {
      const event = new LinkedAccountUpdatedEvent(mockAccount);

      await listener.handleLinkedAccountChanged(event);

      expect(balanceSnapshotService.upsert).toHaveBeenCalledWith(
        {
          accountId: mockAccount.id,
          currentBalance: mockAccount.currentBalance,
          availableBalance: mockAccount.availableBalance,
          snapshotType: BalanceSnapshotType.SYNC,
          snapshotDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
        },
        mockAccount.userId,
      );
    });

    it('should handle errors gracefully for created events', async () => {
      const event = new LinkedAccountCreatedEvent(mockAccount);
      balanceSnapshotService.upsert.mockRejectedValueOnce(
        new Error('Database error'),
      );

      // Should not throw
      await expect(
        listener.handleLinkedAccountChanged(event),
      ).resolves.not.toThrow();
    });

    it('should handle errors gracefully for updated events', async () => {
      const event = new LinkedAccountUpdatedEvent(mockAccount);
      balanceSnapshotService.upsert.mockRejectedValueOnce(
        new Error('Database error'),
      );

      // Should not throw
      await expect(
        listener.handleLinkedAccountChanged(event),
      ).resolves.not.toThrow();
    });
  });

  describe('handleManualAccountUpdate', () => {
    it('should upsert a USER_UPDATE snapshot when manual account is created', async () => {
      const event = new ManualAccountCreatedEvent(mockManualAccount);

      await listener.handleManualAccountUpdate(event);

      expect(balanceSnapshotService.upsert).toHaveBeenCalledWith(
        {
          accountId: mockManualAccount.id,
          currentBalance: mockManualAccount.currentBalance,
          availableBalance: mockManualAccount.availableBalance,
          snapshotType: BalanceSnapshotType.USER_UPDATE,
          snapshotDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
        },
        mockManualAccount.userId,
      );
    });

    it('should upsert a USER_UPDATE snapshot when manual balance is updated', async () => {
      const event = new ManualAccountBalanceUpdatedEvent(mockManualAccount);

      await listener.handleManualAccountUpdate(event);

      expect(balanceSnapshotService.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshotType: BalanceSnapshotType.USER_UPDATE,
        }),
        mockManualAccount.userId,
      );
    });

    it('should handle errors gracefully', async () => {
      const event = new ManualAccountCreatedEvent(mockManualAccount);
      balanceSnapshotService.upsert.mockRejectedValueOnce(
        new Error('Database error'),
      );

      await expect(
        listener.handleManualAccountUpdate(event),
      ).resolves.not.toThrow();
    });
  });
});
