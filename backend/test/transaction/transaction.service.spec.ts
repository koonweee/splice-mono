import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryEntity } from '../../src/category/category.entity';
import { CategoryService } from '../../src/category/category.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';
import { TransactionService } from '../../src/transaction/transaction.service';
import type { TransactionSyncResponse } from '../../src/types/BankLink';
import { MoneySign } from '../../src/types/MoneyWithSign';
import {
  mockAccountId,
  mockCreateTransactionDto,
  mockUserId,
} from '../mocks/transaction/transaction.mock';

function buildAssignableCategory(
  overrides: Partial<CategoryEntity> = {},
): CategoryEntity {
  const category = new CategoryEntity();
  category.id = overrides.id ?? 'category-id';
  category.setLabels(
    overrides.primary ?? 'FOOD_AND_DRINK',
    overrides.detailed ?? 'FOOD_AND_DRINK_RESTAURANT',
  );
  category.description = overrides.description ?? '';
  category.source = overrides.source ?? 'plaid';
  category.userId = overrides.userId ?? null;
  category.archivedAt = overrides.archivedAt ?? null;
  category.createdAt = overrides.createdAt ?? new Date('2024-01-01T00:00:00Z');
  category.updatedAt = overrides.updatedAt ?? new Date('2024-01-01T00:00:00Z');
  return category;
}

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

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getManyAndCount: jest.fn(),
  };

  // Mock repository methods
  const mockRepository = {
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
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
    findOne: jest.fn(),
  };

  const mockCategoryService = {
    findActiveAssignableCategory: jest.fn(),
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
          provide: CategoryService,
          useValue: mockCategoryService,
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockQueryBuilder.getMany.mockReset();
    mockQueryBuilder.getMany.mockResolvedValue([]);
    mockQueryBuilder.getManyAndCount.mockReset();
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);
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

    it('validates category ownership before creating with a category id', async () => {
      mockCategoryService.findActiveAssignableCategory.mockResolvedValue(null);

      await expect(
        service.create(
          { ...mockCreateTransactionDto, categoryId: 'other-user-category-id' },
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(
        mockCategoryService.findActiveAssignableCategory,
      ).toHaveBeenCalledWith('other-user-category-id', mockUserId);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('stores an owned custom category create as a user category override', async () => {
      const userCategory = buildAssignableCategory({
        id: 'user-category-id',
        source: 'user',
        userId: mockUserId,
        primary: 'Home Projects',
        detailed: 'Hardware',
      });
      mockCategoryService.findActiveAssignableCategory.mockResolvedValue(
        userCategory,
      );
      mockRepository.save.mockImplementation((entity: TransactionEntity) =>
        Promise.resolve(entity),
      );

      await service.create(
        { ...mockCreateTransactionDto, categoryId: userCategory.id },
        mockUserId,
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: null,
          userCategoryId: userCategory.id,
          userCategory,
          userCategoryUpdatedAt: expect.any(Date),
        }),
      );
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
      expect(result.categoryReviewedAt).toBeNull();
      expect(result.categoryReviewMethod).toBeNull();
      expect(result.categoryNeedsReview).toBe(true);
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
        relations: ['account', 'category', 'userCategory'],
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
        relations: ['account', 'category', 'userCategory'],
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
        relations: ['account', 'category', 'userCategory'],
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
        relations: ['account', 'category', 'userCategory'],
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
        relations: ['account', 'category', 'userCategory'],
        order: {
          date: 'DESC',
          datetime: 'DESC',
          authorizedDatetime: 'DESC',
          id: 'DESC',
        },
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
          order: {
            merchantName: 'ASC',
            date: 'DESC',
            datetime: 'DESC',
            authorizedDatetime: 'DESC',
            id: 'DESC',
          },
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
          order: {
            date: 'DESC',
            datetime: 'DESC',
            authorizedDatetime: 'DESC',
            id: 'DESC',
          },
        }),
      );
    });

    it('should use transaction time and id as stable tie-breakers for date sort', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        sortBy: 'date',
        sortOrder: 'ASC',
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: {
            date: 'ASC',
            datetime: 'ASC',
            authorizedDatetime: 'ASC',
            id: 'ASC',
          },
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

    it('should filter by categoryPrimary using effective category', async () => {
      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        categoryPrimary: 'FOOD_AND_DRINK',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'COALESCE(userCategory.primary, category.primary) = :categoryPrimary',
        { categoryPrimary: 'FOOD_AND_DRINK' },
      );
      expect(mockRepository.findAndCount).not.toHaveBeenCalled();
    });

    it('should filter uncategorized using effective category nullness', async () => {
      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        categoryPrimary: 'UNCATEGORIZED',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'COALESCE(transaction.userCategoryId, transaction.categoryId) IS NULL',
      );
      expect(mockRepository.findAndCount).not.toHaveBeenCalled();
    });

    it('should return query results when categoryPrimary has no matching categories', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        categoryPrimary: 'NONEXISTENT_CATEGORY',
      });

      expect(result).toEqual({ data: [], total: 0 });
      expect(mockRepository.findAndCount).not.toHaveBeenCalled();
      expect(mockQueryBuilder.getManyAndCount).toHaveBeenCalledTimes(1);
    });

    it('should combine all filters together', async () => {
      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        categoryPrimary: 'FOOD_AND_DRINK',
        accountId: mockAccountId,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.accountId = :accountId',
        { accountId: mockAccountId },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.date BETWEEN :startDate AND :endDate',
        { startDate: '2024-01-01', endDate: '2024-01-31' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'COALESCE(userCategory.primary, category.primary) = :categoryPrimary',
        { categoryPrimary: 'FOOD_AND_DRINK' },
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
      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        categoryPrimary: 'INCOME',
        amountSign: 'negative',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.amountSign = :amountSign',
        { amountSign: 'negative' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'COALESCE(userCategory.primary, category.primary) = :categoryPrimary',
        { categoryPrimary: 'INCOME' },
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

    it('should filter by needs-review status', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        categoryReviewStatus: 'needs_review',
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryReviewedAt: expect.objectContaining({
              _type: 'isNull',
            }),
          }),
        }),
      );
    });

    it('should filter by reviewed status', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        categoryReviewStatus: 'reviewed',
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryReviewedAt: expect.objectContaining({
              _type: 'not',
            }),
          }),
        }),
      );
    });

    it('should combine category and review-status filters in query builder', async () => {
      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        categoryPrimary: 'FOOD_AND_DRINK',
        categoryReviewStatus: 'needs_review',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.categoryReviewedAt IS NULL',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'COALESCE(userCategory.primary, category.primary) = :categoryPrimary',
        { categoryPrimary: 'FOOD_AND_DRINK' },
      );
    });

    it('should apply stable tie-breakers in category-filtered query builder results', async () => {
      await service.findAllPaginated(mockUserId, {
        pageIndex: 0,
        pageSize: 10,
        categoryPrimary: 'FOOD_AND_DRINK',
      });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'transaction.date',
        'DESC',
      );
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith(
        'transaction.datetime',
        'DESC',
        'NULLS LAST',
      );
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith(
        'transaction.authorizedDatetime',
        'DESC',
        'NULLS LAST',
      );
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith(
        'transaction.id',
        'DESC',
      );
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
        relations: ['account', 'category', 'userCategory'],
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
      const category = buildAssignableCategory({ id: 'new-category-id' });
      const mockEntity = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockCategoryService.findActiveAssignableCategory.mockResolvedValue(
        category,
      );
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

    it('rejects generic updates to custom categories that are not assignable to the user', async () => {
      const mockEntity = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockCategoryService.findActiveAssignableCategory.mockResolvedValue(null);

      await expect(
        service.update(
          'test-id',
          { categoryId: 'other-user-category-id' },
          mockUserId,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(
        mockCategoryService.findActiveAssignableCategory,
      ).toHaveBeenCalledWith('other-user-category-id', mockUserId);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('stores generic updates to owned custom categories as user category overrides', async () => {
      const providerCategory = buildAssignableCategory({
        id: 'provider-category-id',
      });
      const userCategory = buildAssignableCategory({
        id: 'user-category-id',
        source: 'user',
        userId: mockUserId,
        primary: 'Home Projects',
        detailed: 'Hardware',
      });
      const mockEntity = TransactionEntity.fromDto(
        { ...mockCreateTransactionDto, categoryId: providerCategory.id },
        mockUserId,
      );
      mockEntity.id = 'test-id';
      mockEntity.category = providerCategory;
      mockRepository.findOne.mockResolvedValue(mockEntity);
      mockCategoryService.findActiveAssignableCategory.mockResolvedValue(
        userCategory,
      );
      mockRepository.save.mockImplementation((entity: TransactionEntity) =>
        Promise.resolve(entity),
      );

      await service.update(
        'test-id',
        { categoryId: userCategory.id },
        mockUserId,
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: providerCategory.id,
          userCategoryId: userCategory.id,
          userCategory,
          userCategoryUpdatedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('updateCategory', () => {
    const providerCategory = {
      id: 'provider-category-id',
      primary: 'FOOD_AND_DRINK',
      detailed: 'FOOD_AND_DRINK_RESTAURANT',
      description: 'Restaurants',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      toObject: jest.fn().mockReturnValue({
        id: 'provider-category-id',
        primary: 'FOOD_AND_DRINK',
        detailed: 'FOOD_AND_DRINK_RESTAURANT',
        description: 'Restaurants',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      }),
    } as unknown as CategoryEntity;

    const userCategory = {
      id: 'user-category-id',
      primary: 'GENERAL_MERCHANDISE',
      detailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
      description: 'General merchandise',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
      toObject: jest.fn().mockReturnValue({
        id: 'user-category-id',
        primary: 'GENERAL_MERCHANDISE',
        detailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
        description: 'General merchandise',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      }),
    } as unknown as CategoryEntity;

    function buildCategorizedEntity(): TransactionEntity {
      const entity = TransactionEntity.fromDto(
        { ...mockCreateTransactionDto, categoryId: providerCategory.id },
        mockUserId,
      );
      entity.id = 'test-id';
      entity.category = providerCategory;
      return entity;
    }

    it('sets a user category override when selected category differs from provider category', async () => {
      const entity = buildCategorizedEntity();
      mockRepository.findOne
        .mockResolvedValueOnce(entity)
        .mockResolvedValue(entity);
      mockCategoryService.findActiveAssignableCategory.mockResolvedValue(
        userCategory,
      );
      mockRepository.save.mockImplementation((saved) => Promise.resolve(saved));

      const result = await service.updateCategory(
        'test-id',
        { categoryId: userCategory.id },
        mockUserId,
      );

      expect(
        mockCategoryService.findActiveAssignableCategory,
      ).toHaveBeenCalledWith(userCategory.id, mockUserId);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userCategoryId: userCategory.id,
          userCategory,
          userCategoryUpdatedAt: expect.any(Date),
          categoryReviewedAt: expect.any(Date),
          categoryReviewMethod: 'manual_change',
        }),
      );
      expect(result?.effectiveCategoryId).toBe(userCategory.id);
      expect(result?.effectiveCategory?.primary).toBe('GENERAL_MERCHANDISE');
      expect(result?.categoryNeedsReview).toBe(false);
    });

    it('clears user category override when selected category matches provider category', async () => {
      const entity = buildCategorizedEntity();
      entity.userCategoryId = userCategory.id;
      entity.userCategory = userCategory;
      entity.userCategoryUpdatedAt = new Date('2024-02-01T00:00:00Z');
      mockRepository.findOne
        .mockResolvedValueOnce(entity)
        .mockResolvedValue(entity);
      mockRepository.save.mockImplementation((saved) => Promise.resolve(saved));

      const result = await service.updateCategory(
        'test-id',
        { categoryId: providerCategory.id },
        mockUserId,
      );

      expect(
        mockCategoryService.findActiveAssignableCategory,
      ).not.toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userCategoryId: null,
          userCategory: null,
          userCategoryUpdatedAt: null,
          categoryReviewedAt: expect.any(Date),
          categoryReviewMethod: 'manual_change',
        }),
      );
      expect(result?.effectiveCategoryId).toBe(providerCategory.id);
      expect(result?.effectiveCategory?.primary).toBe('FOOD_AND_DRINK');
      expect(result?.categoryNeedsReview).toBe(false);
    });

    it('clears user category override when selected category is null', async () => {
      const entity = buildCategorizedEntity();
      entity.userCategoryId = userCategory.id;
      entity.userCategory = userCategory;
      entity.userCategoryUpdatedAt = new Date('2024-02-01T00:00:00Z');
      mockRepository.findOne
        .mockResolvedValueOnce(entity)
        .mockResolvedValue(entity);
      mockRepository.save.mockImplementation((saved) => Promise.resolve(saved));

      await service.updateCategory('test-id', { categoryId: null }, mockUserId);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userCategoryId: null,
          userCategory: null,
          userCategoryUpdatedAt: null,
          categoryReviewedAt: expect.any(Date),
          categoryReviewMethod: 'manual_change',
        }),
      );
    });

    it('returns null when selected category does not exist', async () => {
      const entity = buildCategorizedEntity();
      mockRepository.findOne.mockResolvedValue(entity);
      mockCategoryService.findActiveAssignableCategory.mockResolvedValue(null);

      const result = await service.updateCategory(
        'test-id',
        { categoryId: 'missing-category-id' },
        mockUserId,
      );

      expect(result).toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('returns null when selected custom category belongs to another user', async () => {
      const entity = buildCategorizedEntity();
      mockRepository.findOne.mockResolvedValue(entity);
      mockCategoryService.findActiveAssignableCategory.mockResolvedValue(null);

      const result = await service.updateCategory(
        'test-id',
        { categoryId: 'other-user-category-id' },
        mockUserId,
      );

      expect(result).toBeNull();
      expect(
        mockCategoryService.findActiveAssignableCategory,
      ).toHaveBeenCalledWith('other-user-category-id', mockUserId);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('returns null when transaction does not belong to user', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.updateCategory(
        'test-id',
        { categoryId: userCategory.id },
        'other-user-id',
      );

      expect(result).toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('updateCategoryReview', () => {
    function buildEntity(): TransactionEntity {
      const entity = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      entity.id = 'test-id';
      return entity;
    }

    it('marks a transaction category as reviewed', async () => {
      const entity = buildEntity();
      mockRepository.findOne
        .mockResolvedValueOnce(entity)
        .mockResolvedValue(entity);
      mockRepository.save.mockImplementation((saved) => Promise.resolve(saved));

      const result = await service.updateCategoryReview(
        'test-id',
        { reviewed: true },
        mockUserId,
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryReviewedAt: expect.any(Date),
          categoryReviewMethod: 'manual_accept',
        }),
      );
      expect(result?.categoryNeedsReview).toBe(false);
    });

    it('clears category review metadata for undo', async () => {
      const entity = buildEntity();
      entity.categoryReviewedAt = new Date('2026-02-14T00:00:00Z');
      entity.categoryReviewMethod = 'manual_accept';
      mockRepository.findOne
        .mockResolvedValueOnce(entity)
        .mockResolvedValue(entity);
      mockRepository.save.mockImplementation((saved) => Promise.resolve(saved));

      const result = await service.updateCategoryReview(
        'test-id',
        { reviewed: false },
        mockUserId,
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryReviewedAt: null,
          categoryReviewMethod: null,
        }),
      );
      expect(result?.categoryNeedsReview).toBe(true);
    });

    it('returns null when transaction does not belong to user', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.updateCategoryReview(
        'test-id',
        { reviewed: true },
        'other-user-id',
      );

      expect(result).toBeNull();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('bulk category review', () => {
    function buildEntity(id: string): TransactionEntity {
      const entity = TransactionEntity.fromDto(
        mockCreateTransactionDto,
        mockUserId,
      );
      entity.id = id;
      return entity;
    }

    it('marks unreviewed filtered transactions as reviewed', async () => {
      const first = buildEntity('11111111-1111-4111-8111-111111111111');
      const second = buildEntity('22222222-2222-4222-8222-222222222222');
      mockQueryBuilder.getMany.mockResolvedValue([first, second]);
      mockRepository.save.mockImplementation((saved) => Promise.resolve(saved));

      const result = await service.bulkReviewCategories(mockUserId, {
        filters: {
          accountId: mockAccountId,
          categoryReviewStatus: 'needs_review',
        },
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.accountId = :accountId',
        { accountId: mockAccountId },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'transaction.categoryReviewedAt IS NULL',
      );
      expect(mockRepository.save).toHaveBeenCalledWith([
        expect.objectContaining({
          id: first.id,
          categoryReviewedAt: expect.any(Date),
          categoryReviewMethod: 'bulk_accept',
        }),
        expect.objectContaining({
          id: second.id,
          categoryReviewedAt: expect.any(Date),
          categoryReviewMethod: 'bulk_accept',
        }),
      ]);
      expect(result).toEqual({
        count: 2,
        transactionIds: [first.id, second.id],
      });
    });

    it('returns an empty result without saving when no rows match bulk review', async () => {
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.bulkReviewCategories(mockUserId, {
        filters: {},
      });

      expect(result).toEqual({ count: 0, transactionIds: [] });
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('clears review metadata for bulk undo ids owned by the user', async () => {
      const entity = buildEntity('11111111-1111-4111-8111-111111111111');
      entity.categoryReviewedAt = new Date('2026-02-14T00:00:00Z');
      entity.categoryReviewMethod = 'bulk_accept';
      mockRepository.find.mockResolvedValue([entity]);
      mockRepository.save.mockImplementation((saved) => Promise.resolve(saved));

      const result = await service.undoBulkReviewCategories(mockUserId, {
        transactionIds: [entity.id],
      });

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          id: expect.objectContaining({ _value: [entity.id] }),
          userId: mockUserId,
        },
        relations: ['account', 'category', 'userCategory'],
      });
      expect(mockRepository.save).toHaveBeenCalledWith([
        expect.objectContaining({
          id: entity.id,
          categoryReviewedAt: null,
          categoryReviewMethod: null,
        }),
      ]);
      expect(result).toEqual({
        count: 1,
        transactionIds: [entity.id],
      });
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
      existingEntity.userCategoryId = 'user-category-id';
      existingEntity.userCategoryUpdatedAt = new Date('2024-02-01T00:00:00Z');
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
          userCategoryId: 'user-category-id',
          userCategoryUpdatedAt: new Date('2024-02-01T00:00:00Z'),
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

    it('should not update categoryId on reviewed modified transactions', async () => {
      mockCategoryRepository.find.mockResolvedValue([
        {
          id: 'cat-uuid-2',
          primary: 'TRANSPORTATION',
          detailed: 'TRANSPORTATION_GAS',
        },
      ]);

      const existingEntity = TransactionEntity.fromDto(
        {
          ...mockCreateTransactionDto,
          accountId: 'int-acc-1',
          categoryId: 'old-category-id',
        },
        mockUserId,
      );
      existingEntity.id = 'existing-id';
      existingEntity.categoryReviewedAt = new Date('2026-02-14T00:00:00Z');
      existingEntity.categoryReviewMethod = 'manual_accept';
      mockTxnRepo.findOne.mockResolvedValue(existingEntity);

      const syncResults: TransactionSyncResponse = {
        added: [],
        modified: [
          {
            ...mockSyncTransaction,
            merchantName: 'Updated Store',
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
          merchantName: 'Updated Store',
          categoryId: 'old-category-id',
          categoryReviewedAt: new Date('2026-02-14T00:00:00Z'),
          categoryReviewMethod: 'manual_accept',
        }),
      );
    });
  });

  describe('searchForSurface', () => {
    it('should return capped transaction surface results with matchedCount', async () => {
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
      netflix.category = {
        id: 'provider-category-id',
        primary: 'FOOD_AND_DRINK',
        detailed: 'FOOD_AND_DRINK_RESTAURANT',
        description: 'Restaurants',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        toObject: jest.fn().mockReturnValue({
          id: 'provider-category-id',
          primary: 'FOOD_AND_DRINK',
          detailed: 'FOOD_AND_DRINK_RESTAURANT',
          description: 'Restaurants',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        }),
      } as unknown as TransactionEntity['category'];
      netflix.userCategory = {
        id: 'user-category-id',
        primary: 'GENERAL_MERCHANDISE',
        detailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
        description: 'General merchandise',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
        toObject: jest.fn().mockReturnValue({
          id: 'user-category-id',
          primary: 'GENERAL_MERCHANDISE',
          detailed: 'GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE',
          description: 'General merchandise',
          createdAt: new Date('2024-01-01T00:00:00Z'),
          updatedAt: new Date('2024-01-01T00:00:00Z'),
        }),
      } as unknown as TransactionEntity['userCategory'];
      netflix.userCategoryId = 'user-category-id';

      mockRepository.find.mockResolvedValue([netflix]);

      const result = await service.searchForSurface(mockUserId, {
        categoryPrimary: 'GENERAL_MERCHANDISE',
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
            categoryPrimary: 'GENERAL_MERCHANDISE',
          },
        ],
      });
    });
  });
});
