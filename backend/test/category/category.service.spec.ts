import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoryEntity } from '../../src/category/category.entity';
import { CategoryService } from '../../src/category/category.service';

const mockUserId = '00000000-0000-4000-8000-000000000001';
const otherUserId = '00000000-0000-4000-8000-000000000002';

function buildCategoryEntity(
  overrides: Partial<CategoryEntity> = {},
): CategoryEntity {
  const entity = new CategoryEntity();
  entity.id = overrides.id ?? '00000000-0000-4000-8000-000000000100';
  entity.setLabels(
    overrides.primary ?? 'FOOD_AND_DRINK',
    overrides.detailed ?? 'FOOD_AND_DRINK_RESTAURANTS',
  );
  entity.description = overrides.description ?? '';
  entity.source = overrides.source ?? 'plaid';
  entity.userId = overrides.userId ?? null;
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

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoryService,
        {
          provide: getRepositoryToken(CategoryEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CategoryService>(CategoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockQueryBuilder.getMany.mockReset();
    mockQueryBuilder.getOne.mockReset();
  });

  it('returns Plaid categories and active custom categories for the current user', async () => {
    const plaidCategory = buildCategoryEntity();
    const customCategory = buildCategoryEntity({
      id: '00000000-0000-4000-8000-000000000101',
      primary: 'Home Projects',
      detailed: 'Hardware',
      source: 'user',
      userId: mockUserId,
    });
    mockRepository.find.mockResolvedValue([plaidCategory, customCategory]);

    const result = await service.findAll(mockUserId);

    expect(result).toHaveLength(2);
    expect(mockRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.arrayContaining([
          expect.objectContaining({ source: 'plaid' }),
          expect.objectContaining({ source: 'user', userId: mockUserId }),
        ]),
      }),
    );
  });

  it('creates a user category with cleaned labels when no duplicate exists', async () => {
    mockQueryBuilder.getOne.mockResolvedValue(null);
    mockRepository.save.mockImplementation((entity: CategoryEntity) => {
      entity.id = '00000000-0000-4000-8000-000000000102';
      entity.createdAt = new Date('2024-01-01T00:00:00.000Z');
      entity.updatedAt = new Date('2024-01-01T00:00:00.000Z');
      return Promise.resolve(entity);
    });

    const result = await service.createCustom(mockUserId, {
      primary: '  Home   Projects ',
      detailed: ' Hardware ',
    });

    expect(result.primary).toBe('Home Projects');
    expect(result.detailed).toBe('Hardware');
    expect(result.source).toBe('user');
    expect(result.userId).toBe(mockUserId);
    expect(mockRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedPrimary: 'home projects',
        normalizedDetailed: 'hardware',
        source: 'user',
        userId: mockUserId,
      }),
    );
  });

  it('returns conflict response when concurrent create hits active duplicate index', async () => {
    const conflict = buildCategoryEntity({
      id: '00000000-0000-4000-8000-000000000107',
      source: 'user',
      userId: mockUserId,
      primary: 'Home Projects',
      detailed: 'Hardware',
    });
    mockQueryBuilder.getOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(conflict);
    mockRepository.save.mockRejectedValueOnce({
      code: '23505',
      constraint: 'UQ_category_user_normalized_pair',
    });

    try {
      await service.createCustom(mockUserId, {
        primary: 'Home Projects',
        detailed: 'Hardware',
      });
      throw new Error('Expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual(
        expect.objectContaining({
          message: 'Category already exists',
          category: expect.objectContaining({
            categoryId: conflict.id,
            label: 'Home Projects > Hardware',
            source: 'user',
          }),
        }),
      );
    }
  });

  it('rejects duplicate custom category creation against Plaid categories', async () => {
    const plaidCategory = buildCategoryEntity();
    mockQueryBuilder.getOne.mockResolvedValue(plaidCategory);

    await expect(
      service.createCustom(mockUserId, {
        primary: ' food  and drink ',
        detailed: 'restaurants',
      }),
    ).rejects.toThrow(ConflictException);

    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('returns a display-friendly conflict label for Plaid duplicates', async () => {
    const plaidCategory = buildCategoryEntity();
    mockQueryBuilder.getOne.mockResolvedValue(plaidCategory);

    try {
      await service.createCustom(mockUserId, {
        primary: 'Food and Drink',
        detailed: 'Restaurants',
      });
      throw new Error('Expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual(
        expect.objectContaining({
          category: expect.objectContaining({
            label: 'Food And Drink > Restaurants',
          }),
        }),
      );
    }
  });

  it('allows different users to create the same custom pair when there is no Plaid conflict', async () => {
    mockQueryBuilder.getOne.mockResolvedValue(null);
    mockRepository.save.mockImplementation((entity: CategoryEntity) => {
      entity.id = '00000000-0000-4000-8000-000000000103';
      entity.createdAt = new Date('2024-01-01T00:00:00.000Z');
      entity.updatedAt = new Date('2024-01-01T00:00:00.000Z');
      return Promise.resolve(entity);
    });

    await service.createCustom(otherUserId, {
      primary: 'Home Projects',
      detailed: 'Hardware',
    });

    expect(mockRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: otherUserId }),
    );
  });

  it('rejects renaming an active custom category to an existing visible pair', async () => {
    const category = buildCategoryEntity({
      id: '00000000-0000-4000-8000-000000000104',
      source: 'user',
      userId: mockUserId,
      primary: 'Pets',
      detailed: 'Grooming',
    });
    const conflict = buildCategoryEntity();
    mockRepository.findOne.mockResolvedValue(category);
    mockQueryBuilder.getOne.mockResolvedValue(conflict);

    await expect(
      service.updateCustom(category.id, mockUserId, {
        primary: 'Food and Drink',
        detailed: 'Restaurants',
      }),
    ).rejects.toThrow(ConflictException);

    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('returns conflict response when concurrent restore hits active duplicate index', async () => {
    const category = buildCategoryEntity({
      id: '00000000-0000-4000-8000-000000000108',
      source: 'user',
      userId: mockUserId,
      primary: 'Pets',
      detailed: 'Grooming',
      archivedAt: new Date('2024-02-01T00:00:00.000Z'),
    });
    const conflict = buildCategoryEntity({
      id: '00000000-0000-4000-8000-000000000109',
      source: 'user',
      userId: mockUserId,
      primary: 'Pets',
      detailed: 'Grooming',
    });
    mockRepository.findOne.mockResolvedValue(category);
    mockQueryBuilder.getOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(conflict);
    mockRepository.save.mockRejectedValueOnce({
      driverError: {
        code: '23505',
        constraint: 'UQ_category_user_normalized_pair',
      },
    });

    try {
      await service.updateCustom(category.id, mockUserId, {
        archived: false,
      });
      throw new Error('Expected conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toEqual(
        expect.objectContaining({
          message: 'Category already exists',
          category: expect.objectContaining({
            categoryId: conflict.id,
            label: 'Pets > Grooming',
            source: 'user',
          }),
        }),
      );
    }
  });

  it('archives and restores only user-owned custom categories', async () => {
    const category = buildCategoryEntity({
      id: '00000000-0000-4000-8000-000000000105',
      source: 'user',
      userId: mockUserId,
      primary: 'Pets',
      detailed: 'Grooming',
    });
    mockRepository.findOne.mockResolvedValue(category);
    mockRepository.save.mockImplementation((entity: CategoryEntity) =>
      Promise.resolve(entity),
    );

    const archived = await service.updateCustom(category.id, mockUserId, {
      archived: true,
    });

    expect(archived?.archivedAt).toEqual(expect.any(Date));

    mockQueryBuilder.getOne.mockResolvedValue(null);
    const restored = await service.updateCustom(category.id, mockUserId, {
      archived: false,
    });

    expect(restored?.archivedAt).toBeNull();
  });

  it('returns null when updating another user category or a Plaid category through custom update', async () => {
    mockRepository.findOne.mockResolvedValue(null);

    const result = await service.updateCustom(
      '00000000-0000-4000-8000-000000000106',
      mockUserId,
      { archived: true },
    );

    expect(result).toBeNull();
    expect(mockRepository.save).not.toHaveBeenCalled();
  });
});
