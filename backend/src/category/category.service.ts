import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import {
  cleanCategoryLabel,
  formatCategoryDisplayPair,
  normalizeCategoryKey,
} from './category-normalization';
import {
  Category,
  CategoryConflict,
  CreateCustomCategoryDto,
  UpdateCustomCategoryDto,
} from '../types/Category';
import { CategoryEntity } from './category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
  ) {}

  async findAll(userId: string): Promise<Category[]> {
    const categories = await this.categoryRepository.find({
      where: [
        { source: 'plaid', archivedAt: IsNull() },
        { source: 'user', userId, archivedAt: IsNull() },
      ],
      order: { primary: 'ASC', detailed: 'ASC' },
    });

    return categories.map((category) => category.toObject());
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

    return categories.map((category) => category.toObject());
  }

  async createCustom(
    userId: string,
    dto: CreateCustomCategoryDto,
  ): Promise<Category> {
    const primary = cleanCategoryLabel(dto.primary);
    const detailed = cleanCategoryLabel(dto.detailed);
    const conflict = await this.findActiveConflict(userId, primary, detailed);

    if (conflict) {
      throw this.buildConflictException(conflict);
    }

    const category = new CategoryEntity();
    category.setLabels(primary, detailed);
    category.description = cleanCategoryLabel(dto.description ?? '');
    category.source = 'user';
    category.userId = userId;
    category.archivedAt = null;

    const saved = await this.categoryRepository.save(category);
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
        throw this.buildConflictException(conflict);
      }
    }

    category.setLabels(nextPrimary, nextDetailed);
    if (dto.description !== undefined) {
      category.description = cleanCategoryLabel(dto.description ?? '');
    }
    category.archivedAt = nextArchivedAt;

    const saved = await this.categoryRepository.save(category);
    return saved.toObject();
  }

  async findActiveAssignableCategory(
    id: string,
    userId: string,
  ): Promise<CategoryEntity | null> {
    return this.categoryRepository
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
      );

    if (excludeId) {
      query.andWhere('category.id != :excludeId', { excludeId });
    }

    return query.getOne();
  }

  private buildConflictException(category: CategoryEntity): ConflictException {
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
    };

    return new ConflictException({
      message: 'Category already exists',
      category: conflict,
    });
  }
}
