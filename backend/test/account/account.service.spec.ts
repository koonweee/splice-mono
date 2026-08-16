import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AccountSubtype, AccountType } from 'plaid';
import { AccountEntity } from '../../src/account/account.entity';
import { AccountService } from '../../src/account/account.service';
import { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';
import { BankLinkEntity } from '../../src/bank-link/bank-link.entity';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import {
  ManualAccountEvents,
  ManualAccountCreatedEvent,
  ManualAccountBalanceUpdatedEvent,
} from '../../src/events/account.events';
import { MoneySign } from '../../src/types/MoneyWithSign';
import { UserService } from '../../src/user/user.service';
import type { CreateAccountDto } from '../../src/types/Account';
import {
  mockCreateAccountDto,
  mockCreateManualAccountDto,
  mockUserId,
} from '../mocks/account/account.mock';
import { mockApiAccount } from '../mocks/bank-link/provider.mock';
import { mockUserService } from '../mocks/user/user-service.mock';

describe('AccountService', () => {
  let service: AccountService;
  let mockEventEmitter: { emit: jest.Mock };

  // Mock repository methods
  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };

  // Mock balance snapshot repository
  const mockSnapshotRepository = {
    find: jest.fn(),
  };
  const mockBankLinkRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    mockSnapshotRepository.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: mockRepository,
        },
        {
          provide: UserService,
          useValue: mockUserService,
        },
        {
          provide: EventEmitter2,
          useFactory: () => {
            mockEventEmitter = { emit: jest.fn() };
            return mockEventEmitter;
          },
        },
        {
          provide: getRepositoryToken(BalanceSnapshotEntity),
          useValue: mockSnapshotRepository,
        },
        {
          provide: getRepositoryToken(BankLinkEntity),
          useValue: mockBankLinkRepository,
        },
      ],
    }).compile();

    service = module.get<AccountService>(AccountService);
  });

  afterEach(() => {
    // Clear all mocks after each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new account with a generated UUID', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity.id = 'generated-uuid-123';

      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.create(mockCreateAccountDto, mockUserId);

      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.name).toBe(mockCreateAccountDto.name);
      expect(result.type).toBe(mockCreateAccountDto.type);
      expect(result.availableBalance).toEqual(
        mockCreateAccountDto.availableBalance,
      );
      expect(result.currentBalance).toEqual(
        mockCreateAccountDto.currentBalance,
      );
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should call repository.save with the correct entity', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.create(mockCreateAccountDto, mockUserId);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.any(AccountEntity),
      );
    });

    it('should discard provider fields from structurally wider inputs', async () => {
      mockRepository.save.mockImplementation(async (entity) => entity);
      const widerDto: CreateAccountDto = {
        ...mockCreateAccountDto,
        externalAccountId: 'provider-account-id',
        bankLinkId: 'bank-link-id',
        mask: '1234',
        rawApiAccount: mockApiAccount,
      };

      await service.create(widerDto, mockUserId);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          externalAccountId: null,
          bankLinkId: null,
          mask: null,
          rawApiAccount: null,
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        ManualAccountEvents.CREATED,
        expect.any(ManualAccountCreatedEvent),
      );
    });

    it('should create accounts with unique IDs', async () => {
      const mockEntity1 = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity1.id = 'uuid-1';
      const mockEntity2 = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity2.id = 'uuid-2';

      mockRepository.save
        .mockResolvedValueOnce(mockEntity1)
        .mockResolvedValueOnce(mockEntity2);

      const account1 = await service.create(mockCreateAccountDto, mockUserId);
      const account2 = await service.create(mockCreateAccountDto, mockUserId);

      expect(account1.id).not.toBe(account2.id);
    });

    it('should create an account without optional fields', async () => {
      const createDto = {
        name: null,
        availableBalance: {
          money: { currency: 'USD', amount: 100 },
          sign: MoneySign.POSITIVE,
        },
        currentBalance: {
          money: { currency: 'USD', amount: 100 },
          sign: MoneySign.POSITIVE,
        },
        type: AccountType.Depository,
        subType: null,
      };

      const mockEntity = AccountEntity.fromDto(createDto, mockUserId);
      mockEntity.id = 'generated-uuid';
      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.create(createDto, mockUserId);

      expect(result).toHaveProperty('id');
      expect(result.name).toBeNull();
      expect(result.subType).toBeNull();
      expect(result.notes).toBeNull();
      expect(result.externalAccountId).toBeNull();
      expect(result.bankLinkId).toBeNull();
    });

    it('should create an account with notes', async () => {
      const createDto = {
        ...mockCreateAccountDto,
        notes: 'Keep this account for annual taxes.',
      };
      const mockEntity = AccountEntity.fromDto(createDto, mockUserId);
      mockEntity.id = 'generated-uuid';
      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.create(createDto, mockUserId);

      expect(result.notes).toBe('Keep this account for annual taxes.');
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: 'Keep this account for annual taxes.',
        }),
      );
    });

    it('should emit ManualAccountCreatedEvent when creating a manual account', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateManualAccountDto,
        mockUserId,
      );
      mockEntity.id = 'manual-uuid';
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.create(mockCreateManualAccountDto, mockUserId);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        ManualAccountEvents.CREATED,
        expect.any(ManualAccountCreatedEvent),
      );
    });
  });

  describe('findOne', () => {
    it('should return an account when it exists', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.findOne('test-id', mockUserId);

      expect(result).toBeDefined();
      expect(result?.id).toBe('test-id');
      expect(result?.name).toBe(mockCreateAccountDto.name);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-id', userId: mockUserId },
        relations: ['bankLink'],
      });
    });

    it('should include syncedAt when latest snapshot exists', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockSnapshotRepository.find.mockResolvedValue([
        {
          accountId: 'test-id',
          snapshotType: BalanceSnapshotType.SYNC,
          updatedAt: new Date('2026-03-20T12:00:00Z'),
        } as unknown as BalanceSnapshotEntity,
      ]);

      const result = await service.findOne('test-id', mockUserId);

      expect(result?.syncedAt?.toISOString()).toEqual(
        new Date('2026-03-20T12:00:00Z').toISOString(),
      );
    });

    it('should not include forward-filled snapshots when determining syncedAt', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      const rows = [
        {
          accountId: 'test-id',
          snapshotType: BalanceSnapshotType.FORWARD_FILL,
          updatedAt: new Date('2026-03-21T12:00:00Z'),
        },
        {
          accountId: 'test-id',
          snapshotType: BalanceSnapshotType.SYNC,
          updatedAt: new Date('2026-03-20T12:00:00Z'),
        },
      ];
      mockSnapshotRepository.find.mockImplementation(async ({ where }) => {
        const blockedType = (where.snapshotType as { _value: string })._value;
        return rows.filter((row) => row.snapshotType !== blockedType);
      });

      const result = await service.findOne('test-id', mockUserId);
      expect(mockSnapshotRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            accountId: expect.any(Object),
            snapshotType: expect.objectContaining({
              _type: 'not',
            }),
          }),
          order: { updatedAt: 'DESC' },
        }),
      );

      expect(result?.syncedAt?.toISOString()).toEqual(
        new Date('2026-03-20T12:00:00Z').toISOString(),
      );
    });

    it('should return null when account does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findOne('non-existent-id', mockUserId);

      expect(result).toBeNull();
    });

    it('should return null when account belongs to different user', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findOne('test-id', 'different-user-id');

      expect(result).toBeNull();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-id', userId: 'different-user-id' },
        relations: ['bankLink'],
      });
    });

    it('should find the correct account among multiple accounts', async () => {
      const mockEntity2 = AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          name: 'Second Account',
        },
        mockUserId,
      );
      mockEntity2.id = 'test-id-2';
      mockRepository.findOne.mockResolvedValue(mockEntity2);

      const foundAccount = await service.findOne('test-id-2', mockUserId);

      expect(foundAccount).toBeDefined();
      expect(foundAccount?.id).toBe('test-id-2');
      expect(foundAccount?.name).toBe('Second Account');
    });
  });

  describe('findAll', () => {
    it('should return an empty array when no accounts exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findAll(mockUserId);

      expect(result).toEqual([]);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        relations: ['bankLink'],
      });
    });

    it('should return all accounts for user', async () => {
      const mockEntity1 = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity1.id = 'id-1';
      const mockEntity2 = AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          name: 'Second Account',
        },
        mockUserId,
      );
      mockEntity2.id = 'id-2';

      mockRepository.find.mockResolvedValue([mockEntity1, mockEntity2]);

      const result = await service.findAll(mockUserId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('id-1');
      expect(result[1].id).toBe('id-2');
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        relations: ['bankLink'],
      });
    });

    it('should include syncedAt for matching accounts and ignore forward-filled rows', async () => {
      const mockEntity1 = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity1.id = 'id-1';
      const mockEntity2 = AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          name: 'Second Account',
        },
        mockUserId,
      );
      mockEntity2.id = 'id-2';

      mockRepository.find.mockResolvedValue([mockEntity1, mockEntity2]);
      const rows = [
        {
          accountId: 'id-1',
          snapshotType: BalanceSnapshotType.SYNC,
          updatedAt: new Date('2026-03-20T12:00:00Z'),
        },
        {
          accountId: 'id-2',
          snapshotType: BalanceSnapshotType.FORWARD_FILL,
          updatedAt: new Date('2026-03-22T12:00:00Z'),
        },
      ];
      mockSnapshotRepository.find.mockImplementation(async ({ where }) => {
        const blockedType = (where.snapshotType as { _value: string })._value;
        return rows.filter((row) => row.snapshotType !== blockedType);
      });

      const result = await service.findAll(mockUserId);

      expect(result[0].syncedAt?.toISOString()).toEqual(
        new Date('2026-03-20T12:00:00Z').toISOString(),
      );
      expect(result[1].syncedAt).toBeUndefined();
    });

    it('should return accounts in the order they were created', async () => {
      const mockEntity1 = AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          name: 'First',
        },
        mockUserId,
      );
      mockEntity1.id = 'id-1';
      const mockEntity2 = AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          name: 'Second',
        },
        mockUserId,
      );
      mockEntity2.id = 'id-2';
      const mockEntity3 = AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          name: 'Third',
        },
        mockUserId,
      );
      mockEntity3.id = 'id-3';

      mockRepository.find.mockResolvedValue([
        mockEntity1,
        mockEntity2,
        mockEntity3,
      ]);

      const result = await service.findAll(mockUserId);

      expect(result[0].name).toBe('First');
      expect(result[1].name).toBe('Second');
      expect(result[2].name).toBe('Third');
    });
  });

  describe('update', () => {
    it('should update and return an account', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.update(
        'test-id',
        { name: 'Updated Name' },
        mockUserId,
      );

      expect(result).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          id: 'test-id',
          userId: mockUserId,
          archivedAt: expect.objectContaining({ _type: 'isNull' }),
        },
        relations: ['bankLink'],
      });
    });

    it('should not update metadata for an archived account', async () => {
      const archivedEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      archivedEntity.id = 'archived-id';
      archivedEntity.archivedAt = new Date('2026-08-15T12:00:00Z');
      mockRepository.findOne.mockImplementation(async ({ where }) =>
        where.archivedAt ? null : archivedEntity,
      );

      const result = await service.update(
        'archived-id',
        { customName: 'Hidden rename' },
        mockUserId,
      );

      expect(result).toBeNull();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          id: 'archived-id',
          userId: mockUserId,
          archivedAt: expect.objectContaining({ _type: 'isNull' }),
        },
        relations: ['bankLink'],
      });
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should return null when account does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.update(
        'non-existent-id',
        { name: 'Updated' },
        mockUserId,
      );

      expect(result).toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should return null when account belongs to different user', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.update(
        'test-id',
        { name: 'Updated' },
        'different-user-id',
      );

      expect(result).toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should reject provider name updates for linked accounts', async () => {
      const mockEntity = AccountEntity.fromDto(
        { ...mockCreateAccountDto, bankLinkId: 'bank-link-123' },
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);

      await expect(
        service.update('test-id', { name: 'Forged provider name' }, mockUserId),
      ).rejects.toThrow(
        'Linked account provider names cannot be updated directly',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should set customName when provided in update DTO', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.update(
        'test-id',
        { customName: 'My Custom Name' },
        mockUserId,
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customName: 'My Custom Name',
        }),
      );
    });

    it('should null out customName when null is passed', async () => {
      const mockEntity = AccountEntity.fromDto(
        { ...mockCreateAccountDto, customName: 'Old Name' },
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.update('test-id', { customName: null }, mockUserId);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customName: null,
        }),
      );
    });

    it('should update notes when provided in update DTO', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.update(
        'test-id',
        { notes: 'Call bank before closing.' },
        mockUserId,
      );

      expect(result?.notes).toBe('Call bank before closing.');
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: 'Call bank before closing.',
        }),
      );
    });

    it('should null out notes when null is passed', async () => {
      const mockEntity = AccountEntity.fromDto(
        { ...mockCreateAccountDto, notes: 'Old note' },
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.update('test-id', { notes: null }, mockUserId);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: null,
        }),
      );
    });

    it('should leave customName unchanged when not in DTO', async () => {
      const mockEntity = AccountEntity.fromDto(
        { ...mockCreateAccountDto, customName: 'Keep This' },
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.update('test-id', { name: 'Updated Name' }, mockUserId);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customName: 'Keep This',
        }),
      );
    });
  });

  describe('updateManualBalance', () => {
    const newBalance = {
      money: { currency: 'USD', amount: 75000 },
      sign: MoneySign.POSITIVE,
    };

    it('should update depository balances to the same value and emit event', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateManualAccountDto,
        mockUserId,
      );
      mockEntity.id = 'manual-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation(async (entity) => entity);

      const result = await service.updateManualBalance(
        'manual-id',
        mockUserId,
        newBalance,
      );

      expect(result).toBeDefined();
      expect(result.currentBalance).toEqual(newBalance);
      expect(result.availableBalance).toEqual(newBalance);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          currentBalance: expect.objectContaining({
            amount: 75000,
            currency: 'USD',
            sign: MoneySign.POSITIVE,
          }),
          availableBalance: expect.objectContaining({
            amount: 75000,
            currency: 'USD',
            sign: MoneySign.POSITIVE,
          }),
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        ManualAccountEvents.BALANCE_UPDATED,
        expect.any(ManualAccountBalanceUpdatedEvent),
      );
    });

    it('should zero available balance for investment accounts', async () => {
      const investmentAccountDto = {
        ...mockCreateManualAccountDto,
        type: AccountType.Investment,
        subType: AccountSubtype._401k,
      };
      const mockEntity = AccountEntity.fromDto(
        investmentAccountDto,
        mockUserId,
      );
      mockEntity.id = 'investment-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockImplementation(async (entity) => entity);

      const result = await service.updateManualBalance(
        'investment-id',
        mockUserId,
        newBalance,
      );

      expect(result.currentBalance).toEqual(newBalance);
      expect(result.availableBalance).toEqual({
        money: { currency: 'USD', amount: 0 },
        sign: MoneySign.POSITIVE,
      });
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          currentBalance: expect.objectContaining({
            amount: 75000,
            currency: 'USD',
            sign: MoneySign.POSITIVE,
          }),
          availableBalance: expect.objectContaining({
            amount: 0,
            currency: 'USD',
            sign: MoneySign.POSITIVE,
          }),
        }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        ManualAccountEvents.BALANCE_UPDATED,
        expect.any(ManualAccountBalanceUpdatedEvent),
      );
    });

    it('should throw NotFoundException when account not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateManualBalance('non-existent', mockUserId, newBalance),
      ).rejects.toThrow(NotFoundException);

      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should reject balance updates for archived accounts without side effects', async () => {
      const archivedEntity = AccountEntity.fromDto(
        mockCreateManualAccountDto,
        mockUserId,
      );
      archivedEntity.id = 'archived-id';
      archivedEntity.archivedAt = new Date('2026-08-15T12:00:00Z');
      mockRepository.findOne.mockImplementation(async ({ where }) =>
        where.archivedAt ? null : archivedEntity,
      );

      await expect(
        service.updateManualBalance('archived-id', mockUserId, newBalance),
      ).rejects.toThrow(NotFoundException);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          id: 'archived-id',
          userId: mockUserId,
          archivedAt: expect.objectContaining({ _type: 'isNull' }),
        },
      });
      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when account is linked', async () => {
      const linkedEntity = AccountEntity.fromDto(
        {
          ...mockCreateManualAccountDto,
          bankLinkId: 'bank-link-123',
        },
        mockUserId,
      );
      linkedEntity.id = 'linked-id';
      mockRepository.findOne.mockResolvedValue(linkedEntity);

      await expect(
        service.updateManualBalance('linked-id', mockUserId, newBalance),
      ).rejects.toThrow(BadRequestException);

      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('rejects direct balance updates for holdings-valued accounts', async () => {
      const holdingsEntity = AccountEntity.fromDto(
        {
          ...mockCreateManualAccountDto,
          type: AccountType.Investment,
          subType: AccountSubtype.Brokerage,
          valuationMode: 'holdings',
        },
        mockUserId,
      );
      holdingsEntity.id = 'holdings-id';
      mockRepository.findOne.mockResolvedValue(holdingsEntity);

      await expect(
        service.updateManualBalance('holdings-id', mockUserId, newBalance),
      ).rejects.toThrow(BadRequestException);

      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should return true when account is successfully deleted', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.remove('test-id', mockUserId);

      expect(result).toBe(true);
      expect(mockRepository.delete).toHaveBeenCalledWith({
        id: 'test-id',
        userId: mockUserId,
      });
    });

    it('should return false when account does not exist', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });

      const result = await service.remove('non-existent-id', mockUserId);

      expect(result).toBe(false);
    });

    it('should return false when account belongs to different user', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });

      const result = await service.remove('test-id', 'different-user-id');

      expect(result).toBe(false);
      expect(mockRepository.delete).toHaveBeenCalledWith({
        id: 'test-id',
        userId: 'different-user-id',
      });
    });

    it('should return false when affected is null', async () => {
      mockRepository.delete.mockResolvedValue({ affected: null });

      const result = await service.remove('test-id', mockUserId);

      expect(result).toBe(false);
    });

    it('should call repository.delete with the correct ID and userId', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      await service.remove('test-id-123', mockUserId);

      expect(mockRepository.delete).toHaveBeenCalledTimes(1);
      expect(mockRepository.delete).toHaveBeenCalledWith({
        id: 'test-id-123',
        userId: mockUserId,
      });
    });
  });
});
