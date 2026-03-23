import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryEntity } from '../../src/category/category.entity';
import { CurrencyConversionService } from '../../src/currency-exchange/currency-conversion.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { TransactionService } from '../../src/transaction/transaction.service';
import type { TransactionSyncResponse } from '../../src/types/BankLink';
import { MoneySign } from '../../src/types/MoneyWithSign';
import {
  mockAccountId,
  mockCreateTransactionDto,
  mockUserId,
} from '../mocks/transaction/transaction.mock';

describe('TransactionService', () => {
  let service: TransactionService;

  // Mock transaction repository for manager.transaction
  const mockTxnRepo = {
    save: jest.fn().mockImplementation((entities) => Promise.resolve(entities)),
    findOne: jest.fn(),
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };

  const mockManager = {
    getRepository: jest.fn().mockReturnValue(mockTxnRepo),
  };

  // Mock repository methods
  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    delete: jest.fn(),
    manager: {
      transaction: jest.fn(
        (cb: (manager: typeof mockManager) => Promise<void>) => cb(mockManager),
      ),
    },
  };

  // Mock category repository for category lookup
  const mockCategoryRepository = {
    find: jest.fn().mockResolvedValue([]),
  };

  const mockCurrencyConversionService = {
    getPreferredCurrency: jest.fn().mockResolvedValue('USD'),
    getRateMap: jest.fn().mockResolvedValue(new Map()),
    convertAmount: jest.fn(),
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
          provide: getRepositoryToken(CategoryEntity),
          useValue: mockCategoryRepository,
        },
        {
          provide: CurrencyConversionService,
          useValue: mockCurrencyConversionService,
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
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

  describe('findAllPaginated', () => {
    it('should return paginated results with default sort', async () => {
      const mockEntity1 = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity1.id = 'id-1';
      const mockEntity2 = TransactionEntity.fromDto(
        { ...mockCreateTransactionDto, merchantName: 'Second' },
        mockUserId,
      );
      mockEntity2.id = 'id-2';

      mockRepository.findAndCount.mockResolvedValue([
        [mockEntity1, mockEntity2],
        5,
      ]);

      const result = await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 2,
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        relations: ['account', 'category'],
        order: { date: 'DESC' },
        skip: 0,
        take: 2,
      });
    });

    it('should apply custom sort column and order', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        sortBy: 'merchantName',
        sortOrder: 'ASC',
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { merchantName: 'ASC' },
        }),
      );
    });

    it('should fall back to date sort for invalid sortBy', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        sortBy: 'invalidColumn',
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { date: 'DESC' },
        }),
      );
    });

    it('should calculate skip correctly from pageIndex', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 3,
        pageSize: 15,
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 45,
          take: 15,
        }),
      );
    });

    it('should filter by accountId when provided', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        accountId: mockAccountId,
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId, accountId: mockAccountId },
        }),
      );
    });

    it('should return empty data with total 0 when no results', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
      });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should filter by date range when startDate and endDate are provided', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            date: expect.objectContaining({
              _type: 'between',
              _value: ['2024-01-01', '2024-01-31'],
            }),
          }),
        }),
      );
    });

    it('should apply MoreThanOrEqual when only startDate is provided', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        startDate: '2024-01-01',
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            date: expect.objectContaining({
              _type: 'moreThanOrEqual',
              _value: '2024-01-01',
            }),
          }),
        }),
      );
    });

    it('should apply LessThanOrEqual when only endDate is provided', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        endDate: '2024-01-31',
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            date: expect.objectContaining({
              _type: 'lessThanOrEqual',
              _value: '2024-01-31',
            }),
          }),
        }),
      );
    });

    it('should filter by categoryPrimary using category IDs', async () => {
      mockCategoryRepository.find.mockResolvedValue([
        { id: 'cat-1', primary: 'FOOD_AND_DRINK', detailed: 'COFFEE' },
        { id: 'cat-2', primary: 'FOOD_AND_DRINK', detailed: 'RESTAURANTS' },
      ]);
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        categoryPrimary: 'FOOD_AND_DRINK',
      });

      expect(mockCategoryRepository.find).toHaveBeenCalledWith({
        where: { primary: 'FOOD_AND_DRINK' },
      });
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            categoryId: expect.objectContaining({
              _type: 'in',
              _value: ['cat-1', 'cat-2'],
            }),
          }),
        }),
      );
    });

    it('should filter uncategorized using IsNull', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        categoryPrimary: 'UNCATEGORIZED',
      });

      expect(mockCategoryRepository.find).not.toHaveBeenCalled();
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            categoryId: expect.objectContaining({ _type: 'isNull' }),
          }),
        }),
      );
    });

    it('should return empty results when categoryPrimary has no matching categories', async () => {
      mockCategoryRepository.find.mockResolvedValue([]);

      const result = await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        categoryPrimary: 'NONEXISTENT_CATEGORY',
      });

      expect(result).toEqual({ data: [], total: 0 });
      expect(mockRepository.findAndCount).not.toHaveBeenCalled();
    });

    it('should combine all filters together', async () => {
      mockCategoryRepository.find.mockResolvedValue([
        { id: 'cat-1', primary: 'FOOD_AND_DRINK', detailed: 'COFFEE' },
      ]);
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        categoryPrimary: 'FOOD_AND_DRINK',
        accountId: mockAccountId,
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            accountId: mockAccountId,
            date: expect.objectContaining({
              _type: 'between',
              _value: ['2024-01-01', '2024-01-31'],
            }),
            categoryId: expect.objectContaining({
              _type: 'in',
              _value: ['cat-1'],
            }),
          }),
        }),
      );
    });

    it('should filter by amountSign when provided', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        amountSign: 'positive',
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            amount: { sign: 'positive' },
          }),
        }),
      );
    });

    it('should combine amountSign with other filters', async () => {
      mockCategoryRepository.find.mockResolvedValue([
        { id: 'cat-1', primary: 'INCOME', detailed: 'INCOME_WAGES' },
      ]);
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        categoryPrimary: 'INCOME',
        amountSign: 'negative',
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUserId,
            amount: { sign: 'negative' },
            date: expect.objectContaining({
              _type: 'between',
              _value: ['2024-01-01', '2024-01-31'],
            }),
            categoryId: expect.objectContaining({
              _type: 'in',
              _value: ['cat-1'],
            }),
          }),
        }),
      );
    });

    it('should not include amountSign filter when not provided', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
      });

      const calledWith = mockRepository.findAndCount.mock.calls[0][0];
      expect(calledWith.where).not.toHaveProperty('amount');
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

  describe('processSyncResults', () => {
    const accountIdMap = new Map<string, string>([
      ['ext-acc-1', 'int-acc-1'],
      ['ext-acc-2', 'int-acc-2'],
    ]);

    const mockSyncTransaction = {
      amount: {
        money: { currency: 'USD', amount: 5000 },
        sign: MoneySign.NEGATIVE,
      },
      accountId: 'ext-acc-1',
      merchantName: 'Test Store',
      pending: false,
      externalTransactionId: 'ext-txn-1',
      logoUrl: null,
      date: '2024-01-15',
      datetime: null,
      authorizedDate: null,
      authorizedDatetime: null,
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockTxnRepo.save.mockImplementation((entities) =>
        Promise.resolve(entities),
      );
      mockTxnRepo.findOne.mockResolvedValue(null);
      mockTxnRepo.delete.mockResolvedValue({ affected: 0 });
    });

    it('should insert added transactions with mapped account IDs', async () => {
      const syncResults: TransactionSyncResponse = {
        added: [mockSyncTransaction],
        modified: [],
        removed: [],
        nextCursor: 'cursor-1',
        hasMore: false,
      };

      await service.processSyncResults(mockUserId, accountIdMap, syncResults);

      expect(mockTxnRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            accountId: 'int-acc-1', // Mapped from ext-acc-1
            userId: mockUserId,
          }),
        ]),
      );
    });

    it('should skip transactions with unmapped account IDs', async () => {
      const syncResults: TransactionSyncResponse = {
        added: [{ ...mockSyncTransaction, accountId: 'unknown-ext-acc' }],
        modified: [],
        removed: [],
        nextCursor: 'cursor-1',
        hasMore: false,
      };

      await service.processSyncResults(mockUserId, accountIdMap, syncResults);

      // save should not be called for added (all filtered out)
      expect(mockTxnRepo.save).not.toHaveBeenCalled();
    });

    it('should update modified transactions when found', async () => {
      const existingEntity = TransactionEntity.fromDto(
        { ...mockCreateTransactionDto, accountId: 'int-acc-1' },
        mockUserId,
      );
      existingEntity.id = 'existing-id';
      mockTxnRepo.findOne.mockResolvedValue(existingEntity);

      const syncResults: TransactionSyncResponse = {
        added: [],
        modified: [{ ...mockSyncTransaction, merchantName: 'Updated Store' }],
        removed: [],
        nextCursor: 'cursor-1',
        hasMore: false,
      };

      await service.processSyncResults(mockUserId, accountIdMap, syncResults);

      expect(mockTxnRepo.findOne).toHaveBeenCalledWith({
        where: {
          externalTransactionId: 'ext-txn-1',
          accountId: 'int-acc-1',
          userId: mockUserId,
        },
      });
      expect(mockTxnRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'existing-id',
          merchantName: 'Updated Store',
        }),
      );
    });

    it('should insert modified transactions that are not found locally', async () => {
      mockTxnRepo.findOne.mockResolvedValue(null);

      const syncResults: TransactionSyncResponse = {
        added: [],
        modified: [mockSyncTransaction],
        removed: [],
        nextCursor: 'cursor-1',
        hasMore: false,
      };

      await service.processSyncResults(mockUserId, accountIdMap, syncResults);

      // Should save a new entity since the modified one wasn't found
      expect(mockTxnRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'int-acc-1',
          userId: mockUserId,
        }),
      );
    });

    it('should delete removed transactions', async () => {
      mockTxnRepo.delete.mockResolvedValue({ affected: 2 });

      const syncResults: TransactionSyncResponse = {
        added: [],
        modified: [],
        removed: ['ext-txn-1', 'ext-txn-2'],
        nextCursor: 'cursor-1',
        hasMore: false,
      };

      await service.processSyncResults(mockUserId, accountIdMap, syncResults);

      expect(mockTxnRepo.delete).toHaveBeenCalledWith({
        externalTransactionId: expect.objectContaining({
          _value: ['ext-txn-1', 'ext-txn-2'],
        }),
        accountId: expect.objectContaining({
          _value: ['int-acc-1', 'int-acc-2'],
        }),
        userId: mockUserId,
      });
    });

    it('should handle empty sync results', async () => {
      const syncResults: TransactionSyncResponse = {
        added: [],
        modified: [],
        removed: [],
        nextCursor: 'cursor-1',
        hasMore: false,
      };

      await service.processSyncResults(mockUserId, accountIdMap, syncResults);

      expect(mockTxnRepo.save).not.toHaveBeenCalled();
      expect(mockTxnRepo.delete).not.toHaveBeenCalled();
    });

    it('should resolve categoryId from personalFinanceCategory on added transactions', async () => {
      mockCategoryRepository.find.mockResolvedValue([
        {
          id: 'cat-uuid-1',
          primary: 'FOOD_AND_DRINK',
          detailed: 'FOOD_AND_DRINK_COFFEE',
        },
      ]);

      const syncResults: TransactionSyncResponse = {
        added: [
          {
            ...mockSyncTransaction,
            personalFinanceCategory: {
              primary: 'FOOD_AND_DRINK',
              detailed: 'FOOD_AND_DRINK_COFFEE',
            },
          },
        ],
        modified: [],
        removed: [],
        nextCursor: 'cursor-1',
        hasMore: false,
      };

      await service.processSyncResults(mockUserId, accountIdMap, syncResults);

      expect(mockTxnRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            categoryId: 'cat-uuid-1',
            accountId: 'int-acc-1',
          }),
        ]),
      );
    });

    it('should leave categoryId null when personalFinanceCategory is not provided', async () => {
      mockCategoryRepository.find.mockResolvedValue([
        {
          id: 'cat-uuid-1',
          primary: 'FOOD_AND_DRINK',
          detailed: 'FOOD_AND_DRINK_COFFEE',
        },
      ]);

      const syncResults: TransactionSyncResponse = {
        added: [mockSyncTransaction], // no personalFinanceCategory
        modified: [],
        removed: [],
        nextCursor: 'cursor-1',
        hasMore: false,
      };

      await service.processSyncResults(mockUserId, accountIdMap, syncResults);

      expect(mockTxnRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            categoryId: null,
            accountId: 'int-acc-1',
          }),
        ]),
      );
    });

    it('should leave categoryId null when personalFinanceCategory is unknown', async () => {
      mockCategoryRepository.find.mockResolvedValue([
        {
          id: 'cat-uuid-1',
          primary: 'FOOD_AND_DRINK',
          detailed: 'FOOD_AND_DRINK_COFFEE',
        },
      ]);

      const syncResults: TransactionSyncResponse = {
        added: [
          {
            ...mockSyncTransaction,
            personalFinanceCategory: {
              primary: 'UNKNOWN',
              detailed: 'UNKNOWN_SUBCATEGORY',
            },
          },
        ],
        modified: [],
        removed: [],
        nextCursor: 'cursor-1',
        hasMore: false,
      };

      await service.processSyncResults(mockUserId, accountIdMap, syncResults);

      expect(mockTxnRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            categoryId: null,
            accountId: 'int-acc-1',
          }),
        ]),
      );
    });

    it('should resolve categoryId on modified transactions', async () => {
      mockCategoryRepository.find.mockResolvedValue([
        {
          id: 'cat-uuid-2',
          primary: 'TRANSPORTATION',
          detailed: 'TRANSPORTATION_GAS',
        },
      ]);

      const existingEntity = TransactionEntity.fromDto(
        { ...mockCreateTransactionDto, accountId: 'int-acc-1' },
        mockUserId,
      );
      existingEntity.id = 'existing-id';
      mockTxnRepo.findOne.mockResolvedValue(existingEntity);

      const syncResults: TransactionSyncResponse = {
        added: [],
        modified: [
          {
            ...mockSyncTransaction,
            personalFinanceCategory: {
              primary: 'TRANSPORTATION',
              detailed: 'TRANSPORTATION_GAS',
            },
          },
        ],
        removed: [],
        nextCursor: 'cursor-1',
        hasMore: false,
      };

      await service.processSyncResults(mockUserId, accountIdMap, syncResults);

      expect(mockTxnRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'existing-id',
          categoryId: 'cat-uuid-2',
        }),
      );
    });
  });

  describe('findForAsk', () => {
    it('should return capped Ask transaction results with matchedCount', async () => {
      const netflix = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'Netflix',
          date: '2026-03-03',
        },
        mockUserId,
      );
      netflix.id = 'txn-1';
      netflix.account = {
        name: 'Checking',
        customName: 'House Checking',
      } as TransactionEntity['account'];

      mockRepository.find.mockResolvedValue([netflix]);

      const result = await service.findForAsk(mockUserId, {
        merchantQuery: 'netflix',
        limit: 20,
      });

      expect(result).toMatchObject({
        matchedCount: 1,
        truncated: false,
        transactions: [
          {
            id: 'txn-1',
            merchantName: 'Netflix',
            accountName: 'House Checking',
          },
        ],
      });
    });
  });

  describe('summarizeForAsk', () => {
    it('should summarize totals and top drivers for Ask', async () => {
      const paycheck = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'Employer',
          date: '2026-03-01',
          amount: {
            money: { currency: 'USD', amount: 125_000 },
            sign: MoneySign.POSITIVE,
          },
        },
        mockUserId,
      );
      paycheck.id = 'txn-1';
      paycheck.account = {
        name: 'Checking',
        customName: 'House Checking',
      } as TransactionEntity['account'];
      paycheck.category = {
        toObject: () => ({
          id: 'cat-0',
          primary: 'INCOME',
          detailed: 'INCOME_WAGES',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as TransactionEntity['category'];

      const grocery = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: "Trader Joe's",
          date: '2026-03-02',
          amount: {
            money: { currency: 'USD', amount: 8_500 },
            sign: MoneySign.NEGATIVE,
          },
        },
        mockUserId,
      );
      grocery.id = 'txn-2';
      grocery.account = {
        name: 'Checking',
        customName: 'House Checking',
      } as TransactionEntity['account'];
      grocery.category = {
        toObject: () => ({
          id: 'cat-1',
          primary: 'FOOD_AND_DRINK',
          detailed: 'GROCERIES',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as TransactionEntity['category'];

      const subscription = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'Netflix',
          date: '2026-03-10',
          amount: {
            money: { currency: 'USD', amount: 1_599 },
            sign: MoneySign.NEGATIVE,
          },
        },
        mockUserId,
      );
      subscription.id = 'txn-3';
      subscription.account = grocery.account;
      subscription.category = {
        toObject: () => ({
          id: 'cat-2',
          primary: 'ENTERTAINMENT',
          detailed: 'TV_AND_MOVIES',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as TransactionEntity['category'];

      const previousSubscription = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'Netflix',
          date: '2026-02-10',
          amount: {
            money: { currency: 'USD', amount: 1_599 },
            sign: MoneySign.NEGATIVE,
          },
        },
        mockUserId,
      );
      previousSubscription.id = 'txn-4';
      previousSubscription.account = grocery.account;
      previousSubscription.category = subscription.category;

      mockRepository.find.mockResolvedValue([
        paycheck,
        grocery,
        subscription,
        previousSubscription,
      ]);

      const result = await service.summarizeForAsk(mockUserId, {
        startDate: '2026-02-01',
        endDate: '2026-03-22',
        includePending: false,
      });

      expect(result.totalInflow).toBe(1250);
      expect(result.totalOutflow).toBe(116.98);
      expect(result.net).toBe(1133.02);
      expect(result.topCategories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'FOOD_AND_DRINK',
            amount: 85,
            currency: 'USD',
            kind: 'category',
          }),
          expect.objectContaining({
            label: 'ENTERTAINMENT',
            amount: 31.98,
            currency: 'USD',
            kind: 'category',
          }),
        ]),
      );
      expect(result.recurringTransactions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            merchantName: 'Netflix',
            cadence: 'monthly',
            amount: 15.99,
            currency: 'USD',
          }),
        ]),
      );
    });

    it('converts mixed-currency transactions into the preferred currency before aggregating', async () => {
      mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue(
        'USD',
      );
      mockCurrencyConversionService.getRateMap.mockResolvedValue(
        new Map([['EUR', 1.2]]),
      );
      mockCurrencyConversionService.convertAmount.mockImplementation(
        (amount: number, source: string, target: string, rate: number) => {
          if (source === target) {
            return amount;
          }

          return Math.round(amount * rate);
        },
      );

      const paycheck = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'Employer',
          date: '2026-03-01',
          amount: {
            money: { currency: 'USD', amount: 125_000 },
            sign: MoneySign.POSITIVE,
          },
        },
        mockUserId,
      );
      paycheck.id = 'txn-paycheck';
      paycheck.account = {
        name: 'Checking',
        customName: 'House Checking',
      } as TransactionEntity['account'];
      paycheck.category = {
        toObject: () => ({
          id: 'cat-income',
          primary: 'INCOME',
          detailed: 'INCOME_WAGES',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as TransactionEntity['category'];

      const grocery = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: "Trader Joe's",
          date: '2026-03-02',
          amount: {
            money: { currency: 'USD', amount: 8_500 },
            sign: MoneySign.NEGATIVE,
          },
        },
        mockUserId,
      );
      grocery.id = 'txn-grocery';
      grocery.account = paycheck.account;
      grocery.category = {
        toObject: () => ({
          id: 'cat-food',
          primary: 'FOOD_AND_DRINK',
          detailed: 'GROCERIES',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as TransactionEntity['category'];

      const netflixFebruary = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'Netflix',
          date: '2026-02-10',
          amount: {
            money: { currency: 'EUR', amount: 1_000 },
            sign: MoneySign.NEGATIVE,
          },
        },
        mockUserId,
      );
      netflixFebruary.id = 'txn-netflix-february';
      netflixFebruary.account = paycheck.account;
      netflixFebruary.category = {
        toObject: () => ({
          id: 'cat-entertainment',
          primary: 'ENTERTAINMENT',
          detailed: 'TV_AND_MOVIES',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as TransactionEntity['category'];

      const netflixMarch = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'Netflix',
          date: '2026-03-10',
          amount: {
            money: { currency: 'EUR', amount: 1_000 },
            sign: MoneySign.NEGATIVE,
          },
        },
        mockUserId,
      );
      netflixMarch.id = 'txn-netflix-march';
      netflixMarch.account = paycheck.account;
      netflixMarch.category = netflixFebruary.category;

      mockRepository.find.mockResolvedValue([
        paycheck,
        grocery,
        netflixFebruary,
        netflixMarch,
      ]);

      const result = await service.summarizeForAsk(mockUserId, {
        startDate: '2026-02-01',
        endDate: '2026-03-22',
        includePending: false,
      });

      expect(
        mockCurrencyConversionService.getPreferredCurrency,
      ).toHaveBeenCalledWith(mockUserId);
      expect(mockCurrencyConversionService.getRateMap).toHaveBeenCalledWith(
        ['EUR'],
        'USD',
        '2026-03-22',
      );
      expect(result.totalInflow).toBe(1250);
      expect(result.totalOutflow).toBe(109);
      expect(result.net).toBe(1141);
      expect(result.topCategories).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'FOOD_AND_DRINK',
            amount: 85,
            currency: 'USD',
          }),
          expect.objectContaining({
            label: 'ENTERTAINMENT',
            amount: 24,
            currency: 'USD',
          }),
        ]),
      );
      expect(result.topMerchants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Netflix',
            amount: 24,
            currency: 'USD',
          }),
        ]),
      );
      expect(result.topAccounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: 'House Checking',
            amount: 1359,
            currency: 'USD',
          }),
        ]),
      );
      expect(result.recurringTransactions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            merchantName: 'Netflix',
            cadence: 'monthly',
            amount: 12,
            currency: 'USD',
          }),
        ]),
      );
    });
  });

  describe('compareForAsk', () => {
    it('should compare current and previous outflow periods', async () => {
      const currentTravel = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'United',
          date: '2026-03-10',
          amount: {
            money: { currency: 'USD', amount: 6_000 },
            sign: MoneySign.NEGATIVE,
          },
        },
        mockUserId,
      );
      currentTravel.id = 'txn-current-1';
      currentTravel.account = {
        name: 'Amex Gold',
        customName: null,
      } as TransactionEntity['account'];
      currentTravel.category = {
        toObject: () => ({
          id: 'cat-travel',
          primary: 'TRAVEL',
          detailed: 'TRAVEL_FLIGHTS',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as TransactionEntity['category'];

      const currentDining = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'Cafe',
          date: '2026-03-11',
          amount: {
            money: { currency: 'USD', amount: 34_000 },
            sign: MoneySign.NEGATIVE,
          },
        },
        mockUserId,
      );
      currentDining.id = 'txn-current-2';
      currentDining.account = currentTravel.account;
      currentDining.category = {
        toObject: () => ({
          id: 'cat-food',
          primary: 'FOOD_AND_DRINK',
          detailed: 'FOOD_AND_DRINK_RESTAURANTS',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as TransactionEntity['category'];

      const previousDining = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'Cafe',
          date: '2026-02-11',
          amount: {
            money: { currency: 'USD', amount: 32_000 },
            sign: MoneySign.NEGATIVE,
          },
        },
        mockUserId,
      );
      previousDining.id = 'txn-previous-1';
      previousDining.account = currentTravel.account;
      previousDining.category = currentDining.category;

      mockRepository.find
        .mockResolvedValueOnce([currentTravel, currentDining])
        .mockResolvedValueOnce([previousDining]);

      const result = await service.compareForAsk(mockUserId, {
        currentStartDate: '2026-03-01',
        currentEndDate: '2026-03-22',
        previousStartDate: '2026-02-01',
        previousEndDate: '2026-02-22',
      });

      expect(result).toMatchObject({
        currentTotalOutflow: 400,
        previousTotalOutflow: 320,
        absoluteDelta: 80,
        percentDelta: 25,
      });
      expect(result.categoryDrivers[0]).toMatchObject({
        label: 'TRAVEL',
        amount: 60,
        currency: 'USD',
      });
      expect(result.merchantDrivers[0]).toMatchObject({
        label: 'United',
        amount: 60,
        currency: 'USD',
      });
      expect(result.accountDrivers[0]).toMatchObject({
        label: 'Amex Gold',
        amount: 80,
        currency: 'USD',
      });
    });

    it('compares mixed-currency periods after conversion into the preferred currency', async () => {
      mockCurrencyConversionService.getPreferredCurrency.mockResolvedValue(
        'USD',
      );
      mockCurrencyConversionService.getRateMap.mockResolvedValue(
        new Map([['EUR', 1.2]]),
      );
      mockCurrencyConversionService.convertAmount.mockImplementation(
        (amount: number, source: string, target: string, rate: number) => {
          if (source === target) {
            return amount;
          }

          return Math.round(amount * rate);
        },
      );

      const currentTravel = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'United',
          date: '2026-03-10',
          amount: {
            money: { currency: 'EUR', amount: 1_000 },
            sign: MoneySign.NEGATIVE,
          },
        },
        mockUserId,
      );
      currentTravel.id = 'txn-current-eur';
      currentTravel.account = {
        name: 'Amex Gold',
        customName: null,
      } as TransactionEntity['account'];
      currentTravel.category = {
        toObject: () => ({
          id: 'cat-travel',
          primary: 'TRAVEL',
          detailed: 'TRAVEL_FLIGHTS',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as TransactionEntity['category'];

      const previousTravel = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          merchantName: 'United',
          date: '2026-02-11',
          amount: {
            money: { currency: 'USD', amount: 1_000 },
            sign: MoneySign.NEGATIVE,
          },
        },
        mockUserId,
      );
      previousTravel.id = 'txn-previous-usd';
      previousTravel.account = currentTravel.account;
      previousTravel.category = currentTravel.category;

      mockRepository.find
        .mockResolvedValueOnce([currentTravel])
        .mockResolvedValueOnce([previousTravel]);

      const result = await service.compareForAsk(mockUserId, {
        currentStartDate: '2026-03-01',
        currentEndDate: '2026-03-22',
        previousStartDate: '2026-02-01',
        previousEndDate: '2026-02-22',
      });

      expect(result).toMatchObject({
        currentTotalOutflow: 12,
        previousTotalOutflow: 10,
        absoluteDelta: 2,
        percentDelta: 20,
      });
      expect(result.categoryDrivers[0]).toMatchObject({
        label: 'TRAVEL',
        amount: 2,
        currency: 'USD',
      });
      expect(result.merchantDrivers[0]).toMatchObject({
        label: 'United',
        amount: 2,
        currency: 'USD',
      });
      expect(result.accountDrivers[0]).toMatchObject({
        label: 'Amex Gold',
        amount: 2,
        currency: 'USD',
      });
    });
  });
});
