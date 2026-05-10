import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { CategoryEntity } from '../category/category.entity';
import type {
  AnalysisCategoryScope,
  AnalysisCategoryScopeView,
  AnalysisRuleConflict,
  AnalysisRuleType,
  AnalysisRuleView,
  CreateAnalysisRuleDto,
  UpdateAnalysisRuleDto,
} from '../types/AnalysisRule';
import { AnalysisRuleEntity } from './analysis-rule.entity';

type EditableRuleState = {
  name: string;
  type: AnalysisRuleType;
  excludeScope: AnalysisCategoryScope | null;
  inflowScope: AnalysisCategoryScope | null;
  outflowScope: AnalysisCategoryScope | null;
  archivedAt: Date | null;
};

@Injectable()
export class AnalysisRuleService {
  constructor(
    @InjectRepository(AnalysisRuleEntity)
    private readonly analysisRuleRepository: Repository<AnalysisRuleEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
  ) {}

  async findAll(
    userId: string,
    options: { archivedMode?: boolean } = {},
  ): Promise<AnalysisRuleView[]> {
    const rules = await this.analysisRuleRepository.find({
      where: options.archivedMode
        ? { userId, archivedAt: Not(IsNull()) }
        : { userId, archivedAt: IsNull() },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return this.toViews(rules, userId);
  }

  async findActiveForAnalysis(userId: string): Promise<AnalysisRuleEntity[]> {
    return this.analysisRuleRepository.find({
      where: { userId, archivedAt: IsNull() },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
  }

  async create(
    userId: string,
    dto: CreateAnalysisRuleDto,
  ): Promise<AnalysisRuleView> {
    const next = this.normalizeCreateDto(dto);
    await this.validateCategoryScopeReferences(userId, [
      next.excludeScope,
      next.inflowScope,
      next.outflowScope,
    ]);
    await this.assertNoDuplicate(userId, next);

    const entity = this.analysisRuleRepository.create({
      userId,
      ...next,
    });
    const saved = await this.analysisRuleRepository.save(entity);

    return this.toView(saved, userId);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateAnalysisRuleDto,
  ): Promise<AnalysisRuleView | null> {
    const entity = await this.analysisRuleRepository.findOne({
      where: { id, userId },
    });

    if (!entity) {
      return null;
    }

    const next = this.buildUpdatedState(entity, dto);
    await this.validateCategoryScopeReferences(userId, [
      next.excludeScope,
      next.inflowScope,
      next.outflowScope,
    ]);

    const isRestoring = entity.archivedAt !== null && next.archivedAt === null;
    const mutatesIdentity =
      entity.type !== next.type ||
      !this.scopesEqual(entity.excludeScope, next.excludeScope) ||
      !this.scopesEqual(entity.inflowScope, next.inflowScope) ||
      !this.scopesEqual(entity.outflowScope, next.outflowScope);

    if (isRestoring || mutatesIdentity) {
      await this.assertNoDuplicate(userId, next, id);
    }

    entity.name = next.name;
    entity.type = next.type;
    entity.excludeScope = next.excludeScope;
    entity.inflowScope = next.inflowScope;
    entity.outflowScope = next.outflowScope;
    entity.archivedAt = next.archivedAt;

    const saved = await this.analysisRuleRepository.save(entity);
    return this.toView(saved, userId);
  }

  normalizeScope(scope: AnalysisCategoryScope): AnalysisCategoryScope {
    if (scope.mode === 'all') {
      return { mode: 'all' };
    }

    return {
      mode: 'selected',
      categoryIds: Array.from(new Set(scope.categoryIds)).sort(),
      includeUncategorized: scope.includeUncategorized,
    };
  }

  scopeMatchesTransactionCategory(
    scope: AnalysisCategoryScope,
    categoryId: string | null,
  ): boolean {
    if (scope.mode === 'all') {
      return true;
    }

    if (categoryId === null) {
      return scope.includeUncategorized;
    }

    return scope.categoryIds.includes(categoryId);
  }

  compareNeutralizationRules(
    left: AnalysisRuleEntity,
    right: AnalysisRuleEntity,
  ): number {
    // Product semantics: sort by smallest cancellation pool first so specific
    // user rules run before broad catch-all rules can consume the same rows.
    const scoreComparison =
      this.getNeutralizationRuleSpecificity(left) -
      this.getNeutralizationRuleSpecificity(right);
    if (scoreComparison !== 0) {
      return scoreComparison;
    }

    const allSideComparison =
      this.getAllSideCount(left) - this.getAllSideCount(right);
    if (allSideComparison !== 0) {
      return allSideComparison;
    }

    const createdAtComparison =
      left.createdAt.getTime() - right.createdAt.getTime();
    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }

    return left.id.localeCompare(right.id);
  }

  private normalizeCreateDto(dto: CreateAnalysisRuleDto): EditableRuleState {
    if (dto.type === 'exclude') {
      return {
        name: dto.name.trim(),
        type: dto.type,
        excludeScope: this.normalizeScope(dto.excludeScope),
        inflowScope: null,
        outflowScope: null,
        archivedAt: null,
      };
    }

    return {
      name: dto.name.trim(),
      type: dto.type,
      excludeScope: null,
      inflowScope: this.normalizeScope(dto.inflowScope),
      outflowScope: this.normalizeScope(dto.outflowScope),
      archivedAt: null,
    };
  }

  private buildUpdatedState(
    entity: AnalysisRuleEntity,
    dto: UpdateAnalysisRuleDto,
  ): EditableRuleState {
    const type = dto.type ?? entity.type;
    const archivedAt =
      dto.archived === undefined
        ? entity.archivedAt
        : dto.archived
          ? (entity.archivedAt ?? new Date())
          : null;

    if (type === 'exclude') {
      const excludeScope = dto.excludeScope ?? entity.excludeScope;
      if (!excludeScope) {
        throw new BadRequestException('excludeScope is required');
      }

      return {
        name: (dto.name ?? entity.name).trim(),
        type,
        excludeScope: this.normalizeScope(excludeScope),
        inflowScope: null,
        outflowScope: null,
        archivedAt,
      };
    }

    const inflowScope = dto.inflowScope ?? entity.inflowScope;
    const outflowScope = dto.outflowScope ?? entity.outflowScope;
    if (!inflowScope || !outflowScope) {
      throw new BadRequestException(
        'inflowScope and outflowScope are required',
      );
    }

    return {
      name: (dto.name ?? entity.name).trim(),
      type,
      excludeScope: null,
      inflowScope: this.normalizeScope(inflowScope),
      outflowScope: this.normalizeScope(outflowScope),
      archivedAt,
    };
  }

  private async validateCategoryScopeReferences(
    userId: string,
    scopes: Array<AnalysisCategoryScope | null>,
  ): Promise<void> {
    const categoryIds = Array.from(
      new Set(
        scopes.flatMap((scope) =>
          scope?.mode === 'selected' ? scope.categoryIds : [],
        ),
      ),
    );
    if (categoryIds.length === 0) {
      return;
    }

    const categories = await this.categoryRepository.find({
      where: { id: In(categoryIds), userId },
      select: { id: true },
    });
    const foundIds = new Set(categories.map((category) => category.id));
    const missingId = categoryIds.find(
      (categoryId) => !foundIds.has(categoryId),
    );
    if (missingId) {
      throw new BadRequestException(`Invalid categoryId: ${missingId}`);
    }
  }

  private async assertNoDuplicate(
    userId: string,
    next: EditableRuleState,
    excludeId?: string,
  ): Promise<void> {
    const rules = await this.analysisRuleRepository.find({
      where: { userId },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    const duplicate = rules.find(
      (rule) =>
        rule.id !== excludeId &&
        rule.type === next.type &&
        this.scopesEqual(rule.excludeScope, next.excludeScope) &&
        this.scopesEqual(rule.inflowScope, next.inflowScope) &&
        this.scopesEqual(rule.outflowScope, next.outflowScope),
    );

    if (!duplicate) {
      return;
    }

    throw new ConflictException({
      message: 'Analysis rule already exists',
      rule: this.toConflict(duplicate),
    });
  }

  private scopesEqual(
    left: AnalysisCategoryScope | null,
    right: AnalysisCategoryScope | null,
  ): boolean {
    if (left === null || right === null) {
      return left === right;
    }

    return (
      JSON.stringify(this.normalizeScope(left)) ===
      JSON.stringify(this.normalizeScope(right))
    );
  }

  private getNeutralizationRuleSpecificity(rule: AnalysisRuleEntity): number {
    return (
      this.getScopeSpecificity(rule.inflowScope) +
      this.getScopeSpecificity(rule.outflowScope)
    );
  }

  private getScopeSpecificity(scope: AnalysisCategoryScope | null): number {
    if (!scope || scope.mode === 'all') {
      return 1_000_000;
    }

    return scope.categoryIds.length + (scope.includeUncategorized ? 1 : 0);
  }

  private getAllSideCount(rule: AnalysisRuleEntity): number {
    return [rule.inflowScope, rule.outflowScope].filter(
      (scope) => !scope || scope.mode === 'all',
    ).length;
  }

  private async toViews(
    rules: AnalysisRuleEntity[],
    userId: string,
  ): Promise<AnalysisRuleView[]> {
    const categoriesById = await this.getReferencedCategoriesById(
      rules,
      userId,
    );

    return rules.map((rule) =>
      this.toViewFromCategoryMap(rule, categoriesById),
    );
  }

  private async toView(
    rule: AnalysisRuleEntity,
    userId: string,
  ): Promise<AnalysisRuleView> {
    const categoriesById = await this.getReferencedCategoriesById(
      [rule],
      userId,
    );
    return this.toViewFromCategoryMap(rule, categoriesById);
  }

  private async getReferencedCategoriesById(
    rules: AnalysisRuleEntity[],
    userId: string,
  ): Promise<Map<string, CategoryEntity>> {
    const categoryIds = Array.from(
      new Set(
        rules.flatMap((rule) => [
          ...this.getScopeCategoryIds(rule.excludeScope),
          ...this.getScopeCategoryIds(rule.inflowScope),
          ...this.getScopeCategoryIds(rule.outflowScope),
        ]),
      ),
    );
    if (categoryIds.length === 0) {
      return new Map();
    }

    const categories = await this.categoryRepository.find({
      where: { id: In(categoryIds), userId },
    });

    return new Map(categories.map((category) => [category.id, category]));
  }

  private getScopeCategoryIds(scope: AnalysisCategoryScope | null): string[] {
    return scope?.mode === 'selected' ? scope.categoryIds : [];
  }

  private toViewFromCategoryMap(
    rule: AnalysisRuleEntity,
    categoriesById: Map<string, CategoryEntity>,
  ): AnalysisRuleView {
    return {
      id: rule.id,
      name: rule.name,
      type: rule.type,
      excludeScope: this.toScopeView(rule.excludeScope, categoriesById),
      inflowScope: this.toScopeView(rule.inflowScope, categoriesById),
      outflowScope: this.toScopeView(rule.outflowScope, categoriesById),
      archivedAt: rule.archivedAt,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  private toScopeView(
    scope: AnalysisCategoryScope | null,
    categoriesById: Map<string, CategoryEntity>,
  ): AnalysisCategoryScopeView | null {
    if (!scope) {
      return null;
    }

    if (scope.mode === 'all') {
      return { mode: 'all' };
    }

    return {
      mode: 'selected',
      includeUncategorized: scope.includeUncategorized,
      categories: scope.categoryIds.flatMap((categoryId) => {
        const category = categoriesById.get(categoryId);
        if (!category) {
          return [];
        }

        return [
          {
            id: category.id,
            primary: category.primary,
            detailed: category.detailed,
            color: category.color,
            archivedAt: category.archivedAt,
          },
        ];
      }),
    };
  }

  private toConflict(rule: AnalysisRuleEntity): AnalysisRuleConflict {
    return {
      ruleId: rule.id,
      name: rule.name,
      type: rule.type,
      label: rule.name,
      archivedAt: rule.archivedAt,
    };
  }
}
