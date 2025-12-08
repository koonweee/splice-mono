import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransactionEvents } from '../../src/events/transaction.events';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { TransactionService } from '../../src/transaction/transaction.service';
import { MoneySign } from '../../src/types/MoneyWithSign';
import {
  mockAccountId,
  mockCreateTransactionDto,
  mockUserId,
} from '../mocks/transaction/transaction.mock';

describe('TransactionService', () => {
  let service: TransactionService;

  // Mock repository methods
  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    delete: jest.fn(),
  };

  // Mock event emitter
  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: mockRepository,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockEventEmitter.emit.mockClear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new transaction with a generated UUID', async () => {
      const mockEntity = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity.id = 'generated-uuid-123';

      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.create(mockCreateTransactionDto, mockUserId);

      expect(result).toHaveProperty('id');
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.accountId).toBe(mockCreateTransactionDto.accountId);
      expect(result.pending).toBe(mockCreateTransactionDto.pending);
      expect(result.date).toBe(mockCreateTransactionDto.date);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should call repository.save with the correct entity', async () => {
      const mockEntity = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.create(mockCreateTransactionDto, mockUserId);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.any(TransactionEntity),
      );
    });

    it('should emit transaction created event', async () => {
      const mockEntity = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity.id = 'generated-uuid-123';
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.create(mockCreateTransactionDto, mockUserId);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        TransactionEvents.CREATED,
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          transaction: expect.objectContaining({
            id: 'generated-uuid-123',
            accountId: mockCreateTransactionDto.accountId,
          }),
        }),
      );
    });

    it('should create transactions with unique IDs', async () => {
      const mockEntity1 = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity1.id = 'uuid-1';
      const mockEntity2 = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity2.id = 'uuid-2';

      mockRepository.save
        .mockResolvedValueOnce(mockEntity1)
        .mockResolvedValueOnce(mockEntity2);

      const txn1 = await service.create(mockCreateTransactionDto, mockUserId);
      const txn2 = await service.create(mockCreateTransactionDto, mockUserId);

      expect(txn1.id).not.toBe(txn2.id);
    });

    it('should create a transaction without optional fields', async () => {
      const createDto = {
        amount: {
          money: { currency: 'USD', amount: 1000 },
          sign: MoneySign.NEGATIVE,
        },
        accountId: mockAccountId,
        pending: true,
        date: '2024-01-01',
      };

      const mockEntity = TransactionEntity.fromDto(createDto, mockUserId);
      mockEntity.id = 'generated-uuid';
      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.create(createDto, mockUserId);

      expect(result).toHaveProperty('id');
      expect(result.merchantName).toBeNull();
      expect(result.externalTransactionId).toBeNull();
      expect(result.logoUrl).toBeNull();
      expect(result.datetime).toBeNull();
      expect(result.authorizedDate).toBeNull();
      expect(result.authorizedDatetime).toBeNull();
      expect(result.categoryId).toBeNull();
    });
  });

  describe('findOne', () => {
    it('should return a transaction when it exists', async () => {
      const mockEntity = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);

      const result = await service.findOne('test-id', mockUserId);

      expect(result).toBeDefined();
      expect(result?.id).toBe('test-id');
      expect(result?.accountId).toBe(mockCreateTransactionDto.accountId);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-id', userId: mockUserId },
        relations: ['account', 'category'],
      });
    });

    it('should return null when transaction does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findOne('non-existent-id', mockUserId);

      expect(result).toBeNull();
    });

    it('should return null when transaction belongs to different user', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findOne('test-id', 'different-user-id');

      expect(result).toBeNull();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-id', userId: 'different-user-id' },
        relations: ['account', 'category'],
      });
    });
  });

  describe('findAll', () => {
    it('should return an empty array when no transactions exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findAll(mockUserId);

      expect(result).toEqual([]);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        relations: ['account', 'category'],
      });
    });

    it('should return all transactions for user', async () => {
      const mockEntity1 = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity1.id = 'id-1';
      const mockEntity2 = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'Second Merchant',
        },
        mockUserId,
      );
      mockEntity2.id = 'id-2';

      mockRepository.find.mockResolvedValue([mockEntity1, mockEntity2]);

      const result = await service.findAll(mockUserId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('id-1');
      expect(result[1].id).toBe('id-2');
    });
  });

  describe('findByAccountId', () => {
    it('should return transactions for a specific account', async () => {
      const mockEntity1 = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity1.id = 'id-1';
      const mockEntity2 = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity2.id = 'id-2';

      mockRepository.find.mockResolvedValue([mockEntity1, mockEntity2]);

      const result = await service.findByAccountId(mockAccountId, mockUserId);

      expect(result).toHaveLength(2);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { accountId: mockAccountId, userId: mockUserId },
        relations: ['account', 'category'],
      });
    });

    it('should return empty array when no transactions exist for account', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findByAccountId(mockAccountId, mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update and return a transaction', async () => {
      const mockEntity = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      const result = await service.update(
        'test-id',
        { merchantName: 'Updated Merchant' },
        mockUserId,
      );

      expect(result).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-id', userId: mockUserId },
        relations: ['account', 'category'],
      });
    });

    it('should return null when transaction does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.update(
        'non-existent-id',
        { merchantName: 'Updated' },
        mockUserId,
      );

      expect(result).toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should return null when transaction belongs to different user', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.update(
        'test-id',
        { merchantName: 'Updated' },
        'different-user-id',
      );

      expect(result).toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should update pending status', async () => {
      const mockEntity = TransactionEntity.fromDto(
        { ...mockCreateTransactionDto, pending: true },
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.update('test-id', { pending: false }, mockUserId);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          pending: false,
        }),
      );
    });

    it('should update categoryId', async () => {
      const mockEntity = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockRepository.save.mockResolvedValue(mockEntity);

      await service.update(
        'test-id',
        { categoryId: 'new-category-id' },
        mockUserId,
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: 'new-category-id',
        }),
      );
    });
  });

  describe('remove', () => {
    it('should return true when transaction is successfully deleted', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.remove('test-id', mockUserId);

      expect(result).toBe(true);
      expect(mockRepository.delete).toHaveBeenCalledWith({
        id: 'test-id',
        userId: mockUserId,
      });
    });

    it('should return false when transaction does not exist', async () => {
      mockRepository.delete.mockResolvedValue({ affected: 0 });

      const result = await service.remove('non-existent-id', mockUserId);

      expect(result).toBe(false);
    });

    it('should return false when transaction belongs to different user', async () => {
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
  });
});
