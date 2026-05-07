import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Not, Repository } from 'typeorm';
import {
  cleanCategoryLabel,
  formatCategoryDisplayPair,
  normalizeCategoryKey,
} from './category-normalization';
import { CategoryVisibilityPreferenceEntity } from './category-visibility-preference.entity';
import {
  BulkCategoryActionResponse,
  BulkCategoryVisibilityDto,
  BulkCustomCategoryActionDto,
  Category,
  CategoryConflict,
  CategoryManagementItem,
  CreateCustomCategoryDto,
  UpdateCustomCategoryDto,
} from '../types/Category';
import { TransactionEntity } from '../transaction/transaction.entity';
import { CategoryEntity } from './category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(CategoryVisibilityPreferenceEntity)
    private readonly visibilityRepository: Repository<CategoryVisibilityPreferenceEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
  ) {}

  async findAll(userId: string): Promise<Category[]> {
    const categories = await this.findActiveVisibleCategoryEntities(userId);

    return categories.map((category) => category.toObject());
  }

  async findFilterOptions(userId: string): Promise<Category[]> {
    const categories = await this.findActiveCategoryEntities(userId);
    const categoryIds = categories.map((category) => category.id);
    const hiddenIds = await this.findHiddenCategoryIds(userId, categoryIds);
    const usedIds = await this.findUsedCategoryIds(userId, categoryIds);

    return categories
      .filter(
        (category) => !hiddenIds.has(category.id) || usedIds.has(category.id),
      )
      .map((category) => category.toObject());
  }

  async findManagement(
    userId: string,
    options: { archivedMode?: boolean } = {},
  ): Promise<CategoryManagementItem[]> {
    const categories = await this.categoryRepository.find({
      where: [
        ...(options.archivedMode
          ? []
          : ([
              { source: 'plaid', archivedAt: IsNull() },
              { source: 'user', userId, archivedAt: IsNull() },
            ] as const)),
        ...(options.archivedMode
          ? ([{ source: 'user', userId, archivedAt: Not(IsNull()) }] as const)
          : []),
      ],
      order: { primary: 'ASC', detailed: 'ASC' },
    });

    const categoryIds = categories.map((category) => category.id);
    const hiddenIds = await this.findHiddenCategoryIds(userId, categoryIds);
    const usage = await this.findEffectiveUsage(userId, categoryIds);

    return categories.map((category) => {
      const isHidden = hiddenIds.has(category.id);
      const usageRow = usage.get(category.id);

      return {
        ...category.toObject(),
        isHidden,
        isSelectable: category.archivedAt === null && !isHidden,
        transactionCount: usageRow?.transactionCount ?? 0,
        lastUsedAt: usageRow?.lastUsedAt ?? null,
      };
    });
  }

  async findCustom(
    userId: string,
    options: { includeArchived?: boolean } = {},
  ): Promise<Category[]> {
    const categories = await this.categoryRepository.find({
      where: {
        source: 'user',
        userId,
        ...(options.includeArchived ? {} : { archivedAt: IsNull() }),
      },
      order: { primary: 'ASC', detailed: 'ASC' },
    });

    return categories.map((category) => category.toObject());
  }

  async search(userId: string, query: string): Promise<Category[]> {
    const normalizedQuery = normalizeCategoryKey(query);

    if (!normalizedQuery) {
      return this.findAll(userId);
    }

    const categories = await this.categoryRepository
      .createQueryBuilder('category')
      .where('category."archivedAt" IS NULL')
      .andWhere(
        new Brackets((scope) => {
          scope
            .where('category.source = :plaidSource', {
              plaidSource: 'plaid',
            })
            .orWhere(
              'category.source = :userSource AND category."userId" = :userId',
              { userSource: 'user', userId },
            );
        }),
      )
      .andWhere(
        new Brackets((search) => {
          search
            .where('category."normalizedPrimary" LIKE :query', {
              query: `%${normalizedQuery}%`,
            })
            .orWhere('category."normalizedDetailed" LIKE :query', {
              query: `%${normalizedQuery}%`,
            });
        }),
      )
      .orderBy('category.primary', 'ASC')
      .addOrderBy('category.detailed', 'ASC')
      .getMany();

    const hiddenIds = await this.findHiddenCategoryIds(
      userId,
      categories.map((category) => category.id),
    );

    return categories
      .filter((category) => !hiddenIds.has(category.id))
      .map((category) => category.toObject());
  }

  async createCustom(
    userId: string,
    dto: CreateCustomCategoryDto,
  ): Promise<Category> {
    const primary = cleanCategoryLabel(dto.primary);
    const detailed = cleanCategoryLabel(dto.detailed);
    const conflict = await this.findActiveConflict(userId, primary, detailed);

    if (conflict) {
      throw await this.buildConflictException(conflict, userId);
    }

    const category = new CategoryEntity();
    category.setLabels(primary, detailed);
    category.description = cleanCategoryLabel(dto.description ?? '');
    category.source = 'user';
    category.userId = userId;
    category.archivedAt = null;

    const saved = await this.saveWithConflictHandling(
      category,
      userId,
      primary,
      detailed,
    );
    return saved.toObject();
  }

  async updateCustom(
    id: string,
    userId: string,
    dto: UpdateCustomCategoryDto,
  ): Promise<Category | null> {
    const category = await this.categoryRepository.findOne({
      where: { id, source: 'user', userId },
    });

    if (!category) {
      return null;
    }

    const nextPrimary =
      dto.primary === undefined
        ? category.primary
        : cleanCategoryLabel(dto.primary);
    const nextDetailed =
      dto.detailed === undefined
        ? category.detailed
        : cleanCategoryLabel(dto.detailed);
    const nextArchivedAt =
      dto.archived === undefined
        ? category.archivedAt
        : dto.archived
          ? (category.archivedAt ?? new Date())
          : null;

    if (nextArchivedAt === null) {
      const conflict = await this.findActiveConflict(
        userId,
        nextPrimary,
        nextDetailed,
        id,
      );

      if (conflict) {
        throw await this.buildConflictException(conflict, userId);
      }
    }

    category.setLabels(nextPrimary, nextDetailed);
    if (dto.description !== undefined) {
      category.description = cleanCategoryLabel(dto.description ?? '');
    }
    category.archivedAt = nextArchivedAt;

    const saved = await this.saveWithConflictHandling(
      category,
      userId,
      nextPrimary,
      nextDetailed,
      id,
    );
    return saved.toObject();
  }

  async findActiveAssignableCategory(
    id: string,
    userId: string,
  ): Promise<CategoryEntity | null> {
    const category = await this.categoryRepository
      .createQueryBuilder('category')
      .where('category.id = :id', { id })
      .andWhere('category."archivedAt" IS NULL')
      .andWhere(
        new Brackets((scope) => {
          scope
            .where('category.source = :plaidSource', {
              plaidSource: 'plaid',
            })
            .orWhere(
              'category.source = :userSource AND category."userId" = :userId',
              { userSource: 'user', userId },
            );
        }),
      )
      .getOne();

    if (!category || (await this.isHidden(userId, id))) {
      return null;
    }

    return category;
  }

  async bulkUpdateVisibility(
    userId: string,
    dto: BulkCategoryVisibilityDto,
  ): Promise<BulkCategoryActionResponse> {
    const requestedIds = Array.from(new Set(dto.categoryIds));
    const categories = await this.categoryRepository.find({
      where: { id: In(requestedIds) },
    });
    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );
    const skipped: BulkCategoryActionResponse['skipped'] = [];
    let updated = 0;

    for (const categoryId of requestedIds) {
      const category = categoryById.get(categoryId);
      if (!category) {
        skipped.push({ categoryId, reason: 'not_found' });
        continue;
      }
      if (category.archivedAt !== null) {
        skipped.push({ categoryId, reason: 'archived' });
        continue;
      }
      if (category.source === 'user' && category.userId !== userId) {
        skipped.push({ categoryId, reason: 'not_owned' });
        continue;
      }

      let preference = await this.visibilityRepository.findOne({
        where: { userId, categoryId },
      });
      if (!preference) {
        preference = new CategoryVisibilityPreferenceEntity();
        preference.userId = userId;
        preference.categoryId = categoryId;
        preference.hiddenAt = null;
      }

      const nextHiddenAt = dto.hidden
        ? (preference.hiddenAt ?? new Date())
        : null;
      if ((preference.hiddenAt === null) === (nextHiddenAt === null)) {
        continue;
      }

      preference.hiddenAt = nextHiddenAt;
      await this.visibilityRepository.save(preference);
      updated += 1;
    }

    return { requested: requestedIds.length, updated, skipped };
  }

  async bulkUpdateCustom(
    userId: string,
    dto: BulkCustomCategoryActionDto,
  ): Promise<BulkCategoryActionResponse> {
    const requestedIds = Array.from(new Set(dto.categoryIds));
    const categories = await this.categoryRepository.find({
      where: { id: In(requestedIds) },
    });
    const categoryById = new Map(
      categories.map((category) => [category.id, category]),
    );
    const skipped: BulkCategoryActionResponse['skipped'] = [];
    let updated = 0;

    for (const categoryId of requestedIds) {
      const category = categoryById.get(categoryId);
      if (!category) {
        skipped.push({ categoryId, reason: 'not_found' });
        continue;
      }
      if (category.source !== 'user') {
        skipped.push({ categoryId, reason: 'system_category' });
        continue;
      }
      if (category.userId !== userId) {
        skipped.push({ categoryId, reason: 'not_owned' });
        continue;
      }

      if (dto.action === 'archive') {
        if (category.archivedAt !== null) {
          skipped.push({ categoryId, reason: 'archived' });
          continue;
        }
        category.archivedAt = new Date();
      } else if (dto.action === 'restore') {
        if (category.archivedAt === null) {
          skipped.push({ categoryId, reason: 'duplicate_conflict' });
          continue;
        }

        const conflict = await this.findActiveConflict(
          userId,
          category.primary,
          category.detailed,
          category.id,
        );
        if (conflict) {
          skipped.push({ categoryId, reason: 'duplicate_conflict' });
          continue;
        }
        category.archivedAt = null;
      } else {
        if (category.archivedAt !== null) {
          skipped.push({ categoryId, reason: 'archived' });
          continue;
        }

        const nextPrimary = cleanCategoryLabel(dto.primary);
        const conflict = await this.findActiveConflict(
          userId,
          nextPrimary,
          category.detailed,
          category.id,
        );
        if (conflict) {
          skipped.push({ categoryId, reason: 'duplicate_conflict' });
          continue;
        }
        category.setLabels(nextPrimary, category.detailed);
      }

      await this.categoryRepository.save(category);
      updated += 1;
    }

    return { requested: requestedIds.length, updated, skipped };
  }

  private async findActiveConflict(
    userId: string,
    primary: string,
    detailed: string,
    excludeId?: string,
  ): Promise<CategoryEntity | null> {
    const query = this.categoryRepository
      .createQueryBuilder('category')
      .where('category."normalizedPrimary" = :primary', {
        primary: normalizeCategoryKey(primary),
      })
      .andWhere('category."normalizedDetailed" = :detailed', {
        detailed: normalizeCategoryKey(detailed),
      })
      .andWhere(
        new Brackets((scope) => {
          scope
            .where('category.source = :plaidSource', {
              plaidSource: 'plaid',
            })
            .orWhere(
              'category.source = :userSource AND category."userId" = :userId',
              { userSource: 'user', userId },
            );
        }),
      );

    if (excludeId) {
      query.andWhere('category.id != :excludeId', { excludeId });
    }

    return query.getOne();
  }

  private async buildConflictException(
    category: CategoryEntity,
    userId: string,
  ): Promise<ConflictException> {
    const conflict: CategoryConflict = {
      categoryId: category.id,
      label: formatCategoryDisplayPair(
        category.source,
        category.primary,
        category.detailed,
      ),
      primary: category.primary,
      detailed: category.detailed,
      source: category.source,
      archivedAt: category.archivedAt,
      isHidden: await this.isHidden(userId, category.id),
    };

    return new ConflictException({
      message: 'Category already exists',
      category: conflict,
    });
  }

  private async saveWithConflictHandling(
    category: CategoryEntity,
    userId: string,
    primary: string,
    detailed: string,
    excludeId?: string,
  ): Promise<CategoryEntity> {
    try {
      return await this.categoryRepository.save(category);
    } catch (error) {
      if (!this.isCategoryPairUniqueViolation(error)) {
        throw error;
      }

      const conflict = await this.findActiveConflict(
        userId,
        primary,
        detailed,
        excludeId,
      );

      if (conflict) {
        throw await this.buildConflictException(conflict, userId);
      }

      throw new ConflictException({
        message: 'Category already exists',
      });
    }
  }

  private isCategoryPairUniqueViolation(error: unknown): boolean {
    const dbError = error as {
      code?: string;
      constraint?: string;
      driverError?: { code?: string; constraint?: string };
    };
    const code = dbError.driverError?.code ?? dbError.code;
    const constraint =
      dbError.driverError?.constraint ?? dbError.constraint ?? '';

    return (
      code === '23505' &&
      (constraint === 'UQ_category_plaid_normalized_pair' ||
        constraint === 'UQ_category_user_normalized_pair')
    );
  }

  private async findActiveVisibleCategoryEntities(
    userId: string,
  ): Promise<CategoryEntity[]> {
    const categories = await this.findActiveCategoryEntities(userId);
    const hiddenIds = await this.findHiddenCategoryIds(
      userId,
      categories.map((category) => category.id),
    );

    return categories.filter((category) => !hiddenIds.has(category.id));
  }

  private async findActiveCategoryEntities(
    userId: string,
  ): Promise<CategoryEntity[]> {
    return this.categoryRepository.find({
      where: [
        { source: 'plaid', archivedAt: IsNull() },
        { source: 'user', userId, archivedAt: IsNull() },
      ],
      order: { primary: 'ASC', detailed: 'ASC' },
    });
  }

  private async findHiddenCategoryIds(
    userId: string,
    categoryIds: string[],
  ): Promise<Set<string>> {
    if (categoryIds.length === 0) {
      return new Set();
    }

    const preferences = await this.visibilityRepository.find({
      where: {
        userId,
        categoryId: In(categoryIds),
        hiddenAt: Not(IsNull()),
      },
    });

    return new Set(preferences.map((preference) => preference.categoryId));
  }

  private async isHidden(userId: string, categoryId: string): Promise<boolean> {
    const preference = await this.visibilityRepository.findOne({
      where: { userId, categoryId, hiddenAt: Not(IsNull()) },
    });

    return preference !== null;
  }

  private async findUsedCategoryIds(
    userId: string,
    categoryIds: Array<string>,
  ): Promise<Set<string>> {
    if (categoryIds.length === 0) {
      return new Set();
    }

    const rows = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select(
        'DISTINCT COALESCE(transaction."userCategoryId", transaction."categoryId")',
        'categoryId',
      )
      .where('transaction."userId" = :userId', { userId })
      .andWhere(
        'COALESCE(transaction."userCategoryId", transaction."categoryId") IN (:...categoryIds)',
        { categoryIds },
      )
      .getRawMany<{ categoryId: string }>();

    return new Set(rows.map((row) => row.categoryId));
  }

  private async findEffectiveUsage(
    userId: string,
    categoryIds: Array<string>,
  ): Promise<
    Map<string, { transactionCount: number; lastUsedAt: string | null }>
  > {
    if (categoryIds.length === 0) {
      return new Map();
    }

    const rows = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select(
        'COALESCE(transaction."userCategoryId", transaction."categoryId")',
        'categoryId',
      )
      .addSelect('COUNT(*)', 'transactionCount')
      .addSelect(
        'MAX(COALESCE(transaction."authorizedDate", transaction."providerDate"))',
        'lastUsedAt',
      )
      .where('transaction."userId" = :userId', { userId })
      .andWhere(
        'COALESCE(transaction."userCategoryId", transaction."categoryId") IN (:...categoryIds)',
        { categoryIds },
      )
      .groupBy(
        'COALESCE(transaction."userCategoryId", transaction."categoryId")',
      )
      .getRawMany<{
        categoryId: string;
        transactionCount: string | number;
        lastUsedAt: string | null;
      }>();

    return new Map(
      rows.map((row) => [
        row.categoryId,
        {
          transactionCount: Number(row.transactionCount),
          lastUsedAt: row.lastUsedAt,
        },
      ]),
    );
  }
}
