import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryEntity } from '../../src/category/category.entity';
import { CategoryService } from '../../src/category/category.service';
import { TransactionEntity } from '../../src/transaction/transaction.entity';

const mockUserId = '00000000-0000-4000-8000-000000000001';
const otherUserId = '00000000-0000-4000-8000-000000000002';

function buildCategoryEntity(
  overrides: Partial<CategoryEntity> = {},
): CategoryEntity {
  const entity = new CategoryEntity();
  entity.id = overrides.id ?? '00000000-0000-4000-8000-000000000100';
  entity.userId = overrides.userId ?? mockUserId;
  entity.setLabels(
    overrides.primary ?? 'FOOD_AND_DRINK',
    overrides.detailed ?? 'FOOD_AND_DRINK_RESTAURANTS',
  );
  entity.description = overrides.description ?? '';
  entity.color = overrides.color ?? '#228be6';
  entity.archivedAt = overrides.archivedAt ?? null;
  entity.createdAt =
    overrides.createdAt ?? new Date('2024-01-01T00:00:00.000Z');
  entity.updatedAt =
    overrides.updatedAt ?? new Date('2024-01-01T00:00:00.000Z');
  return entity;
}

describe('CategoryService', () => {
  let service: CategoryService;

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getOne: jest.fn(),
  };

  const mockTransactionQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockTransactionRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(mockTransactionQueryBuilder),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: getRepositoryToken(CategoryEntity),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(TransactionEntity),
          useValue: mockTransactionRepository,
        },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
    mockTransactionQueryBuilder.getRawMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockQueryBuilder.getMany.mockReset();
    mockQueryBuilder.getOne.mockReset();
    mockTransactionQueryBuilder.getRawMany.mockReset();
  });

  it('returns active user categories for selectors', async () => {
    const category = buildCategoryEntity();
    mockRepository.find.mockResolvedValue([category]);

    const result = await service.findAll(mockUserId);

    expect(result).toEqual([category.toObject()]);
    expect(mockRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: mockUserId, archivedAt: expect.anything() },
        order: { primary: 'ASC', detailed: 'ASC' },
      }),
    );
  });

  it('returns management rows with transaction usage from categoryId only', async () => {
    const category = buildCategoryEntity();
    mockRepository.find.mockResolvedValue([category]);
    mockTransactionQueryBuilder.getRawMany.mockResolvedValue([
      {
        categoryId: category.id,
        transactionCount: '3',
        lastUsedAt: '2026-02-14',
      },
    ]);

    const result = await service.findManagement(mockUserId);

    expect(result[0]).toMatchObject({
      id: category.id,
      transactionCount: 3,
      lastUsedAt: '2026-02-14',
    });
    expect(mockTransactionQueryBuilder.select).toHaveBeenCalledWith(
      'transaction."categoryId"',
      'categoryId',
    );
  });

  it('creates user categories and rejects duplicates including archived rows', async () => {
    const conflict = buildCategoryEntity({
      archivedAt: new Date('2024-02-01T00:00:00.000Z'),
    });
    mockQueryBuilder.getOne.mockResolvedValueOnce(conflict);

    await expect(
      service.createCustom(mockUserId, {
        primary: conflict.primary,
        detailed: conflict.detailed,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'category."normalizedPrimary" = :primary',
      { primary: conflict.normalizedPrimary },
    );
  });

  it('creates user categories with provided or generated colors', async () => {
    mockQueryBuilder.getOne.mockResolvedValue(null);
    mockRepository.save.mockImplementation(async (entity: CategoryEntity) => {
      entity.id = '00000000-0000-4000-8000-000000000103';
      entity.createdAt = new Date('2024-01-01T00:00:00.000Z');
      entity.updatedAt = new Date('2024-01-01T00:00:00.000Z');
      return entity;
    });

    const provided = await service.createCustom(mockUserId, {
      primary: 'Travel',
      detailed: 'Flights',
      color: '#ABC',
    });
    const generated = await service.createCustom(mockUserId, {
      primary: 'Travel',
      detailed: 'Hotels',
    });

    expect(provided.color).toBe('#aabbcc');
    expect(generated.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('updates only categories owned by the current user', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    await expect(
      service.updateCustom('category-id', otherUserId, { primary: 'Travel' }),
    ).resolves.toBeNull();

    expect(mockRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'category-id', userId: otherUserId },
    });
  });

  it('updates custom category colors', async () => {
    const category = buildCategoryEntity();
    mockRepository.findOne.mockResolvedValue(category);
    mockQueryBuilder.getOne.mockResolvedValue(null);
    mockRepository.save.mockImplementation(async (entity: CategoryEntity) => {
      entity.updatedAt = new Date('2024-02-01T00:00:00.000Z');
      return entity;
    });

    const result = await service.updateCustom(category.id, mockUserId, {
      color: '#DEF',
    });

    expect(result?.color).toBe('#ddeeff');
    expect(mockRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ color: '#ddeeff' }),
    );
  });

  it('finds active assignable categories by user ownership', async () => {
    const category = buildCategoryEntity();
    mockRepository.findOne.mockResolvedValue(category);

    const result = await service.findActiveAssignableCategory(
      category.id,
      mockUserId,
    );

    expect(result).toBe(category);
    expect(mockRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: category.id,
        userId: mockUserId,
        archivedAt: expect.anything(),
      },
    });
  });

  it('duplicates active custom categories with the next available copy label', async () => {
    const category = buildCategoryEntity({
      primary: 'Home Projects',
      detailed: 'Hardware',
      description: 'Tools and materials',
    });
    const existingCopy = buildCategoryEntity({
      id: '00000000-0000-4000-8000-000000000101',
      primary: 'Home Projects',
      detailed: 'Hardware - copy (1)',
    });
    mockRepository.find.mockResolvedValue([category]);
    mockQueryBuilder.getOne
      .mockResolvedValueOnce(existingCopy)
      .mockResolvedValueOnce(null);
    mockRepository.save.mockImplementation(async (entity: CategoryEntity) => {
      entity.id = '00000000-0000-4000-8000-000000000102';
      return entity;
    });

    const result = await service.bulkUpdateCustom(mockUserId, {
      categoryIds: [category.id],
      action: 'duplicate',
    });

    expect(result).toEqual({ requested: 1, updated: 1, skipped: [] });
    expect(mockRepository.save).toHaveBeenCalledTimes(1);
    expect(mockRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mockUserId,
        primary: 'Home Projects',
        detailed: 'Hardware - copy (2)',
        description: 'Tools and materials',
        color: expect.stringMatching(/^#[0-9a-f]{6}$/),
        archivedAt: null,
      }),
    );
  });
});
