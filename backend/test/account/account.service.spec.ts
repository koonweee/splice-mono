import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountType } from 'plaid';
import { AccountEntity } from '../../src/account/account.entity';
import { AccountService } from '../../src/account/account.service';
import { MoneySign } from '../../src/types/MoneyWithSign';
import {
  mockCreateAccountDto,
  mockUserId,
} from '../mocks/account/account.mock';

describe('AccountService', () => {
  let service: AccountService;

  // Mock repository methods
  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountService,
        {
          provide: getRepositoryToken(AccountEntity),
          useValue: mockRepository,
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
          sign: MoneySign.CREDIT,
        },
        currentBalance: {
          money: { currency: 'USD', amount: 100 },
          sign: MoneySign.CREDIT,
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
      expect(result.externalAccountId).toBeNull();
      expect(result.bankLinkId).toBeNull();
    });

    it('should associate BankLink when bankLinkId is provided', async () => {
      const createDtoWithBankLink = {
        ...mockCreateAccountDto,
        bankLinkId: 'bank-link-123',
        externalAccountId: 'plaid-acc-123',
      };

      const mockEntity = AccountEntity.fromDto(
        createDtoWithBankLink,
        mockUserId,
      );
      mockEntity.id = 'generated-uuid';
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.create(createDtoWithBankLink, mockUserId);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          bankLinkId: 'bank-link-123',
        }),
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
        where: { id: 'test-id', userId: mockUserId },
        relations: ['bankLink'],
      });
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

    it('should update externalAccountId', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.update(
        'test-id',
        { externalAccountId: 'plaid-acc-123' },
        mockUserId,
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          externalAccountId: 'plaid-acc-123',
        }),
      );
    });

    it('should update bankLink association', async () => {
      const mockEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);

      const savedEntity = AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          bankLinkId: 'bank-link-123',
        },
        mockUserId,
      );
      savedEntity.id = 'test-id';
      mockRepository.save.mockResolvedValue(savedEntity);

      await service.update(
        'test-id',
        { bankLinkId: 'bank-link-123' },
        mockUserId,
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          bankLinkId: 'bank-link-123',
        }),
      );
    });

    it('should remove bankLink association when bankLinkId is null', async () => {
      const mockEntity = AccountEntity.fromDto(
        {
          ...mockCreateAccountDto,
          bankLinkId: 'bank-link-123',
        },
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);

      const savedEntity = AccountEntity.fromDto(
        mockCreateAccountDto,
        mockUserId,
      );
      savedEntity.id = 'test-id';
      mockRepository.save.mockResolvedValue(savedEntity);

      await service.update('test-id', { bankLinkId: null }, mockUserId);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          bankLinkId: null,
        }),
      );
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
