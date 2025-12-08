import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BalanceSnapshotController } from '../../src/balance-snapshot/balance-snapshot.controller';
import { BalanceSnapshotService } from '../../src/balance-snapshot/balance-snapshot.service';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { mockBalanceSnapshotService } from '../mocks/balance-snapshot/balance-snapshot-service.mock';
import {
  mockBalanceSnapshot,
  mockBalanceSnapshotWithConversion,
  mockCreateBalanceSnapshotDto,
} from '../mocks/balance-snapshot/balance-snapshot.mock';

describe('BalanceSnapshotController', () => {
  let controller: BalanceSnapshotController;
  let service: typeof mockBalanceSnapshotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BalanceSnapshotController],
      providers: [
        {
          provide: BalanceSnapshotService,
          useValue: mockBalanceSnapshotService,
        },
      ],
    }).compile();

    controller = module.get<BalanceSnapshotController>(
      BalanceSnapshotController,
    );
    service = module.get(BalanceSnapshotService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should return an array of balance snapshots with converted balances', async () => {
      const result = await controller.findAll(mockUser);

      expect(result).toEqual([mockBalanceSnapshotWithConversion]);
      expect(service.findAllWithConversion).toHaveBeenCalledWith(
        mockUser.userId,
      );
    });
  });

  describe('create', () => {
    it('should create and return a balance snapshot', async () => {
      const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };
      const result = await controller.create(
        mockUser,
        mockCreateBalanceSnapshotDto,
      );

      expect(result).toEqual(mockBalanceSnapshot);
      expect(service.create).toHaveBeenCalledWith(
        mockCreateBalanceSnapshotDto,
        mockUser.userId,
      );
    });
  });

  describe('findOne', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should return a balance snapshot when found', async () => {
      const result = await controller.findOne('snapshot-id-123', mockUser);

      expect(result).toEqual(mockBalanceSnapshot);
      expect(service.findOne).toHaveBeenCalledWith(
        'snapshot-id-123',
        mockUser.userId,
      );
    });

    it('should throw NotFoundException when balance snapshot not found', async () => {
      service.findOne.mockResolvedValueOnce(null);

      await expect(
        controller.findOne('nonexistent-id', mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByAccountId', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should return balance snapshots with converted balances for an account', async () => {
      const result = await controller.findByAccountId(
        'account-id-123',
        mockUser,
      );

      expect(result).toEqual([mockBalanceSnapshotWithConversion]);
      expect(service.findByAccountIdWithConversion).toHaveBeenCalledWith(
        'account-id-123',
        mockUser.userId,
      );
    });
  });

  describe('update', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should update and return the balance snapshot', async () => {
      const updateDto = { snapshotType: BalanceSnapshotType.USER_UPDATE };

      const result = await controller.update(
        'snapshot-id-123',
        updateDto,
        mockUser,
      );

      expect(result).toEqual(mockBalanceSnapshot);
      expect(service.update).toHaveBeenCalledWith(
        'snapshot-id-123',
        updateDto,
        mockUser.userId,
      );
    });

    it('should throw NotFoundException when balance snapshot not found', async () => {
      service.update.mockResolvedValueOnce(null);

      await expect(
        controller.update('nonexistent-id', {}, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    const mockUser = { userId: 'user-uuid-123', email: 'test@example.com' };

    it('should remove the balance snapshot', async () => {
      await controller.remove('snapshot-id-123', mockUser);

      expect(service.remove).toHaveBeenCalledWith(
        'snapshot-id-123',
        mockUser.userId,
      );
    });

    it('should throw NotFoundException when balance snapshot not found', async () => {
      service.remove.mockResolvedValueOnce(false);

      await expect(
        controller.remove('nonexistent-id', mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
