import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Not, Repository } from 'typeorm';
import {
  generateCategoryColor,
  normalizeCategoryColor,
} from './category-color';
import {
  cleanCategoryLabel,
  formatCategoryPair,
  normalizeCategoryKey,
} from './category-normalization';
import {
  BulkCategoryActionResponse,
  BulkCustomCategoryActionDto,
  Category,
  CategoryConflict,
  CategoryManagementItem,
  CreateCustomCategoryDto,
  UpdateCustomCategoryDto,
} from '../types/Category';
import { TransactionEntity } from '../transaction/transaction.entity';
import { TRANSACTION_ACTIVITY_DATE_EXPRESSION } from '../transaction/transaction-date';
import { CategoryEntity } from './category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
  ) {}

  async findAll(userId: string): Promise<Category[]> {
    const categories = await this.findActiveCategoryEntities(userId);

    return categories.map((category) => category.toObject());
  }

  async findFilterOptions(userId: string): Promise<Category[]> {
    return this.findAll(userId);
  }

  async findManagement(
    userId: string,
    options: { archivedMode?: boolean } = {},
  ): Promise<CategoryManagementItem[]> {
    const categories = await this.categoryRepository.find({
      where: options.archivedMode
        ? { userId, archivedAt: Not(IsNull()) }
        : { userId, archivedAt: IsNull() },
      order: { primary: 'ASC', detailed: 'ASC' },
    });

    const usage = await this.findUsage(
      userId,
      categories.map((category) => category.id),
    );

    return categories.map((category) => {
      const usageRow = usage.get(category.id);

      return {
        ...category.toObject(),
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
      .where('category."userId" = :userId', { userId })
      .andWhere('category."archivedAt" IS NULL')
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

    return categories.map((category) => category.toObject());
  }

  async createCustom(
    userId: string,
    dto: CreateCustomCategoryDto,
  ): Promise<Category> {
    const primary = cleanCategoryLabel(dto.primary);
    const detailed = cleanCategoryLabel(dto.detailed);
    const conflict = await this.findConflict(userId, primary, detailed);

    if (conflict) {
      throw this.buildConflictException(conflict);
    }

    const category = new CategoryEntity();
    category.userId = userId;
    category.setLabels(primary, detailed);
    category.description = cleanCategoryLabel(dto.description ?? '');
    category.color = dto.color
      ? normalizeCategoryColor(dto.color)
      : generateCategoryColor();
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
      where: { id, userId },
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
    const conflict = await this.findConflict(
      userId,
      nextPrimary,
      nextDetailed,
      id,
    );

    if (conflict) {
      throw this.buildConflictException(conflict);
    }

    category.setLabels(nextPrimary, nextDetailed);
    if (dto.description !== undefined) {
      category.description = cleanCategoryLabel(dto.description ?? '');
    }
    if (dto.color !== undefined) {
      category.color = normalizeCategoryColor(dto.color);
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
    return this.categoryRepository.findOne({
      where: { id, userId, archivedAt: IsNull() },
    });
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

        const conflict = await this.findConflict(
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
      } else if (dto.action === 'duplicate') {
        if (category.archivedAt !== null) {
          skipped.push({ categoryId, reason: 'archived' });
          continue;
        }

        const duplicate = new CategoryEntity();
        duplicate.userId = userId;
        duplicate.setLabels(
          category.primary,
          await this.findNextDuplicateDetailedLabel(
            userId,
            category.primary,
            category.detailed,
          ),
        );
        duplicate.description = category.description;
        duplicate.color = generateCategoryColor();
        duplicate.archivedAt = null;

        await this.categoryRepository.save(duplicate);
        updated += 1;
        continue;
      } else {
        if (category.archivedAt !== null) {
          skipped.push({ categoryId, reason: 'archived' });
          continue;
        }

        const nextPrimary = cleanCategoryLabel(dto.primary);
        const conflict = await this.findConflict(
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

  private async findNextDuplicateDetailedLabel(
    userId: string,
    primary: string,
    detailed: string,
  ): Promise<string> {
    let copyNumber = 1;

    while (copyNumber <= 500) {
      const candidate = `${detailed} - copy (${copyNumber})`;
      const conflict = await this.findConflict(userId, primary, candidate);

      if (!conflict) {
        return candidate;
      }

      copyNumber += 1;
    }

    throw new ConflictException({
      message: 'Unable to find an available duplicate category name',
    });
  }

  private async findConflict(
    userId: string,
    primary: string,
    detailed: string,
    excludeId?: string,
  ): Promise<CategoryEntity | null> {
    const query = this.categoryRepository
      .createQueryBuilder('category')
      .where('category."userId" = :userId', { userId })
      .andWhere('category."normalizedPrimary" = :primary', {
        primary: normalizeCategoryKey(primary),
      })
      .andWhere('category."normalizedDetailed" = :detailed', {
        detailed: normalizeCategoryKey(detailed),
      });

    if (excludeId) {
      query.andWhere('category.id != :excludeId', { excludeId });
    }

    return query.getOne();
  }

  private buildConflictException(category: CategoryEntity): ConflictException {
    const conflict: CategoryConflict = {
      categoryId: category.id,
      label: formatCategoryPair(category.primary, category.detailed),
      primary: category.primary,
      detailed: category.detailed,
      color: category.color,
      archivedAt: category.archivedAt,
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

      const conflict = await this.findConflict(
        userId,
        primary,
        detailed,
        excludeId,
      );

      if (conflict) {
        throw this.buildConflictException(conflict);
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
      (constraint === 'UQ_category_user_normalized_pair' ||
        constraint === 'UQ_category_user_normalized_pair_all')
    );
  }

  private async findActiveCategoryEntities(
    userId: string,
  ): Promise<CategoryEntity[]> {
    return this.categoryRepository.find({
      where: { userId, archivedAt: IsNull() },
      order: { primary: 'ASC', detailed: 'ASC' },
    });
  }

  private async findUsage(
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
      .leftJoin('transaction.activity', 'activity')
      .select('transaction."categoryId"', 'categoryId')
      .addSelect('COUNT(*)', 'transactionCount')
      .addSelect(`MAX(${TRANSACTION_ACTIVITY_DATE_EXPRESSION})`, 'lastUsedAt')
      .where('activity."userId" = :userId', { userId })
      .andWhere('transaction."categoryId" IN (:...categoryIds)', {
        categoryIds,
      })
      .groupBy('transaction."categoryId"')
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
