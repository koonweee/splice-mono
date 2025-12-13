import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountService } from '../../src/account/account.service';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BalanceSnapshotService } from '../../src/balance-snapshot/balance-snapshot.service';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserService } from '../../src/user/user.service';
import { mockAccountService } from '../mocks/account/account-service.mock';
import { mockBalanceSnapshotRepository } from '../mocks/balance-snapshot/balance-snapshot-repository.mock';
import {
  mockBalanceSnapshot,
  mockCreateBalanceSnapshotDto,
  mockUserId,
} from '../mocks/balance-snapshot/balance-snapshot.mock';
import { mockUserService } from '../mocks/user/user-service.mock';

const mockEventEmitter = {
  emit: jest.fn(),
};

describe('BalanceSnapshotService', () => {
  let service: BalanceSnapshotService;
  let repository: typeof mockBalanceSnapshotRepository;

  beforeEach(async () => {
    mockEventEmitter.emit.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalanceSnapshotService,
        {
          provide: getRepositoryToken(BalanceSnapshotEntity),
          useValue: mockBalanceSnapshotRepository,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: AccountService,
          useValue: mockAccountService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<BalanceSnapshotService>(BalanceSnapshotService);
    repository = module.get(getRepositoryToken(BalanceSnapshotEntity));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and return a balance snapshot', async () => {
      const result = await service.create(
        mockCreateBalanceSnapshotDto,
        mockUserId,
      );

      expect(result).toEqual(mockBalanceSnapshot);
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a balance snapshot when found', async () => {
      const result = await service.findOne('snapshot-id-123', mockUserId);

      expect(result).toEqual(mockBalanceSnapshot);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'snapshot-id-123', userId: mockUserId },
        relations: [],
      });
    });

    it('should return null when balance snapshot not found', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.findOne('nonexistent-id', mockUserId);

      expect(result).toBeNull();
    });

    it('should return null when balance snapshot belongs to different user', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.findOne('snapshot-id-123', 'different-user');

      expect(result).toBeNull();
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'snapshot-id-123', userId: 'different-user' },
        relations: [],
      });
    });
  });

  describe('findAll', () => {
    it('should return all balance snapshots for user', async () => {
      const result = await service.findAll(mockUserId);

      expect(result).toEqual([mockBalanceSnapshot]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        relations: [],
      });
    });
  });

  describe('findByAccountId', () => {
    it('should return balance snapshots for an account', async () => {
      const result = await service.findByAccountId(
        'account-id-123',
        mockUserId,
      );

      expect(result).toEqual([mockBalanceSnapshot]);
      expect(repository.find).toHaveBeenCalledWith({
        where: { accountId: 'account-id-123', userId: mockUserId },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('update', () => {
    it('should update and return the balance snapshot', async () => {
      const updateDto = {
        snapshotType: BalanceSnapshotType.USER_UPDATE,
      };

      const result = await service.update(
        'snapshot-id-123',
        updateDto,
        mockUserId,
      );

      expect(result).toEqual(mockBalanceSnapshot);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'snapshot-id-123', userId: mockUserId },
        relations: [],
      });
      expect(repository.save).toHaveBeenCalled();
    });

    it('should return null when balance snapshot not found', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.update('nonexistent-id', {}, mockUserId);

      expect(result).toBeNull();
    });

    it('should return null when balance snapshot belongs to different user', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.update(
        'snapshot-id-123',
        {},
        'different-user',
      );

      expect(result).toBeNull();
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 'snapshot-id-123', userId: 'different-user' },
        relations: [],
      });
    });

    it('should update balance fields when provided', async () => {
      const updateDto = {
        currentBalance: {
          money: { currency: 'USD', amount: 200000 },
          sign: MoneySign.POSITIVE,
        },
      };

      await service.update('snapshot-id-123', updateDto, mockUserId);

      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should return true when balance snapshot is deleted', async () => {
      const result = await service.remove('snapshot-id-123', mockUserId);

      expect(result).toBe(true);
      expect(repository.delete).toHaveBeenCalledWith({
        id: 'snapshot-id-123',
        userId: mockUserId,
      });
    });

    it('should return false when balance snapshot not found', async () => {
      repository.delete.mockResolvedValueOnce({ affected: 0 });

      const result = await service.remove('nonexistent-id', mockUserId);

      expect(result).toBe(false);
    });

    it('should return false when balance snapshot belongs to different user', async () => {
      repository.delete.mockResolvedValueOnce({ affected: 0 });

      const result = await service.remove('snapshot-id-123', 'different-user');

      expect(result).toBe(false);
      expect(repository.delete).toHaveBeenCalledWith({
        id: 'snapshot-id-123',
        userId: 'different-user',
      });
    });
  });

  describe('upsert', () => {
    it('should create a new snapshot when none exists for account and date', async () => {
      repository.findOne.mockResolvedValueOnce(null);

      const result = await service.upsert(
        mockCreateBalanceSnapshotDto,
        mockUserId,
      );

      expect(result).toEqual(mockBalanceSnapshot);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: {
          accountId: mockCreateBalanceSnapshotDto.accountId,
          snapshotDate: mockCreateBalanceSnapshotDto.snapshotDate,
          userId: mockUserId,
        },
      });
      expect(repository.save).toHaveBeenCalled();
    });

    it('should update existing snapshot when one exists for account and date', async () => {
      const existingEntity = {
        id: 'existing-snapshot-id',
        accountId: 'account-id-123',
        snapshotDate: '2024-01-01',
        currentBalance: {
          amount: 50000,
          currency: 'USD',
          sign: MoneySign.POSITIVE,
        },
        availableBalance: {
          amount: 45000,
          currency: 'USD',
          sign: MoneySign.POSITIVE,
        },
        snapshotType: BalanceSnapshotType.SYNC,
        toObject: jest.fn().mockReturnValue(mockBalanceSnapshot),
      };
      repository.findOne.mockResolvedValueOnce(existingEntity);

      const result = await service.upsert(
        mockCreateBalanceSnapshotDto,
        mockUserId,
      );

      expect(result).toEqual(mockBalanceSnapshot);
      expect(repository.save).toHaveBeenCalledWith(existingEntity);
    });

    it('should update balance fields on existing snapshot', async () => {
      const existingEntity = {
        id: 'existing-snapshot-id',
        accountId: 'account-id-123',
        snapshotDate: '2024-01-01',
        currentBalance: {},
        availableBalance: {},
        snapshotType: BalanceSnapshotType.SYNC,
        toObject: jest.fn().mockReturnValue(mockBalanceSnapshot),
      };
      repository.findOne.mockResolvedValueOnce(existingEntity);

      const newDto = {
        ...mockCreateBalanceSnapshotDto,
        snapshotType: BalanceSnapshotType.USER_UPDATE,
      };

      await service.upsert(newDto, mockUserId);

      expect(existingEntity.snapshotType).toBe(BalanceSnapshotType.USER_UPDATE);
      expect(repository.save).toHaveBeenCalledWith(existingEntity);
    });
  });
});
