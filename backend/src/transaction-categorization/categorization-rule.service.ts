import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { CategoryEntity } from '../category/category.entity';
import { TransactionEntity } from '../transaction/transaction.entity';
import type {
  ApplyCategorizationRuleResponse,
  CategorizationRuleCategoryView,
  CategorizationRuleCondition,
  CategorizationRuleConflict,
  CategorizationRuleView,
  CreateCategorizationRuleDto,
  UpdateCategorizationRuleDto,
} from '../types/CategorizationRule';
import { CategorizationRuleEntity } from './categorization-rule.entity';
import {
  CategorizationRuleMatch,
  RuleBasedCategorizationEngine,
} from './rule-based-categorization.engine';

type EditableRuleState = {
  name: string;
  priority: number;
  targetCategoryId: string;
  conditions: CategorizationRuleCondition[];
  archivedAt: Date | null;
};

@Injectable()
export class TransactionCategorizationService {
  private readonly logger = new Logger(TransactionCategorizationService.name);

  constructor(
    @InjectRepository(CategorizationRuleEntity)
    private readonly ruleRepository: Repository<CategorizationRuleEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    private readonly engine: RuleBasedCategorizationEngine,
  ) {}

  async findAll(
    userId: string,
    options: { archivedMode?: boolean } = {},
  ): Promise<CategorizationRuleView[]> {
    const rules = await this.ruleRepository.find({
      where: options.archivedMode
        ? { userId, archivedAt: Not(IsNull()) }
        : { userId, archivedAt: IsNull() },
      order: { priority: 'ASC', createdAt: 'ASC', id: 'ASC' },
    });

    return this.toViews(rules, userId);
  }

  async create(
    userId: string,
    dto: CreateCategorizationRuleDto,
  ): Promise<CategorizationRuleView> {
    const next = await this.normalizeCreateDto(userId, dto);
    await this.validateActiveTargetCategory(userId, next.targetCategoryId);
    await this.assertNoDuplicate(userId, next);

    const entity = this.ruleRepository.create({ userId, ...next });
    const saved = await this.ruleRepository.save(entity);
    return this.toView(saved, userId);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCategorizationRuleDto,
  ): Promise<CategorizationRuleView | null> {
    const entity = await this.ruleRepository.findOne({ where: { id, userId } });
    if (!entity) {
      return null;
    }

    const next = this.buildUpdatedState(entity, dto);
    if (next.archivedAt === null) {
      await this.validateActiveTargetCategory(userId, next.targetCategoryId);
    } else {
      await this.validateOwnedTargetCategory(userId, next.targetCategoryId);
    }

    const isRestoring = entity.archivedAt !== null && next.archivedAt === null;
    const mutatesIdentity =
      entity.targetCategoryId !== next.targetCategoryId ||
      this.engine.canonicalConditionsKey(entity.conditions) !==
        this.engine.canonicalConditionsKey(next.conditions);
    if (isRestoring || mutatesIdentity) {
      await this.assertNoDuplicate(userId, next, id);
    }

    entity.name = next.name;
    entity.priority = next.priority;
    entity.targetCategoryId = next.targetCategoryId;
    entity.conditions = next.conditions;
    entity.archivedAt = next.archivedAt;

    const saved = await this.ruleRepository.save(entity);
    return this.toView(saved, userId);
  }

  async findFirstMatch(
    userId: string,
    transaction: TransactionEntity,
  ): Promise<CategorizationRuleMatch | null> {
    const rules = await this.ruleRepository.find({
      where: { userId, archivedAt: IsNull() },
      order: { priority: 'ASC', createdAt: 'ASC', id: 'ASC' },
    });

    return this.engine.findFirstMatch(rules, transaction);
  }

  async applyRuleAssignmentIfEligible(
    userId: string,
    transaction: TransactionEntity,
  ): Promise<boolean> {
    if (transaction.categoryAssignmentSource === 'manual') {
      return false;
    }

    const match = await this.findFirstMatch(userId, transaction);
    this.applyMatch(transaction, match);
    return match !== null;
  }

  applyMatch(
    transaction: TransactionEntity,
    match: CategorizationRuleMatch | null,
  ): void {
    if (!match) {
      transaction.categoryId = null;
      transaction.category = null;
      transaction.categoryAssignmentSource = null;
      transaction.categoryAssignmentRuleId = null;
      transaction.categoryUpdatedAt = null;
      return;
    }

    transaction.categoryId = match.targetCategoryId;
    transaction.categoryAssignmentSource = 'rule';
    transaction.categoryAssignmentRuleId = match.rule.id;
    transaction.categoryUpdatedAt = new Date();
  }

  async applyRuleToExisting(
    id: string,
    userId: string,
  ): Promise<ApplyCategorizationRuleResponse | null> {
    return this.transactionRepository.manager.transaction(async (manager) => {
      const result = await this.evaluateRuleApplication(id, userId, {
        manager,
        persist: true,
      });

      if (result) {
        this.logger.log(
          { userId, ruleId: id, ...result },
          'Applied categorization rule to existing transactions',
        );
      }

      return result;
    });
  }

  async previewRuleApplication(
    id: string,
    userId: string,
  ): Promise<ApplyCategorizationRuleResponse | null> {
    return this.evaluateRuleApplication(id, userId, { persist: false });
  }

  private async evaluateRuleApplication(
    id: string,
    userId: string,
    options: { persist: boolean; manager?: EntityManager },
  ): Promise<ApplyCategorizationRuleResponse | null> {
    const manager = options.manager ?? this.transactionRepository.manager;
    const rule = await manager.getRepository(CategorizationRuleEntity).findOne({
      where: { id, userId, archivedAt: IsNull() },
    });
    if (!rule) {
      return null;
    }

    const txnRepo = manager.getRepository(TransactionEntity);
    const transactions = await txnRepo.find({
      where: { activity: { userId } },
      relations: ['activity', 'activity.account', 'category'],
    });
    const category = await manager.getRepository(CategoryEntity).findOne({
      where: { id: rule.targetCategoryId, userId },
    });
    if (!category) {
      throw new BadRequestException('Target category not found');
    }

    let matched = 0;
    let updated = 0;
    let skippedManual = 0;
    const updates: TransactionEntity[] = [];

    for (const transaction of transactions) {
      const match = this.engine.findFirstMatch([rule], transaction);
      if (!match) {
        continue;
      }

      matched += 1;
      if (
        transaction.source === 'manual' ||
        transaction.categoryAssignmentSource === 'manual'
      ) {
        skippedManual += 1;
        continue;
      }

      updated += 1;
      if (!options.persist) {
        continue;
      }

      transaction.categoryId = category.id;
      transaction.category = category;
      transaction.categoryAssignmentSource = 'rule';
      transaction.categoryAssignmentRuleId = rule.id;
      transaction.categoryUpdatedAt = new Date();
      updates.push(transaction);
    }

    if (options.persist && updates.length > 0) {
      await txnRepo.save(updates);
    }

    return { matched, updated, skippedManual };
  }

  private async normalizeCreateDto(
    userId: string,
    dto: CreateCategorizationRuleDto,
  ): Promise<EditableRuleState> {
    return {
      name: dto.name.trim(),
      priority: dto.priority ?? (await this.getNextPriority(userId)),
      targetCategoryId: dto.targetCategoryId,
      conditions: this.engine.normalizeConditions(dto.conditions),
      archivedAt: null,
    };
  }

  private buildUpdatedState(
    entity: CategorizationRuleEntity,
    dto: UpdateCategorizationRuleDto,
  ): EditableRuleState {
    const archivedAt =
      dto.archived === undefined
        ? entity.archivedAt
        : dto.archived
          ? (entity.archivedAt ?? new Date())
          : null;

    return {
      name: (dto.name ?? entity.name).trim(),
      priority: dto.priority ?? entity.priority,
      targetCategoryId: dto.targetCategoryId ?? entity.targetCategoryId,
      conditions:
        dto.conditions === undefined
          ? entity.conditions
          : this.engine.normalizeConditions(dto.conditions),
      archivedAt,
    };
  }

  private async getNextPriority(userId: string): Promise<number> {
    const result = await this.ruleRepository
      .createQueryBuilder('rule')
      .select('MAX(rule.priority)', 'max')
      .where('rule."userId" = :userId', { userId })
      .andWhere('rule."archivedAt" IS NULL')
      .getRawOne<{ max: number | string | null }>();
    const maxPriority =
      typeof result?.max === 'string'
        ? parseInt(result.max, 10)
        : (result?.max ?? 0);
    return maxPriority + 10;
  }

  private async validateActiveTargetCategory(
    userId: string,
    targetCategoryId: string,
  ): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id: targetCategoryId, userId, archivedAt: IsNull() },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException(
        `Invalid targetCategoryId: ${targetCategoryId}`,
      );
    }
  }

  private async validateOwnedTargetCategory(
    userId: string,
    targetCategoryId: string,
  ): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id: targetCategoryId, userId },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException(
        `Invalid targetCategoryId: ${targetCategoryId}`,
      );
    }
  }

  private async assertNoDuplicate(
    userId: string,
    next: EditableRuleState,
    excludeId?: string,
  ): Promise<void> {
    const rules = await this.ruleRepository.find({
      where: { userId },
      order: { priority: 'ASC', createdAt: 'ASC', id: 'ASC' },
    });
    const nextConditionsKey = this.engine.canonicalConditionsKey(
      next.conditions,
    );
    const duplicate = rules.find(
      (rule) =>
        rule.id !== excludeId &&
        rule.targetCategoryId === next.targetCategoryId &&
        this.engine.canonicalConditionsKey(rule.conditions) ===
          nextConditionsKey,
    );

    if (!duplicate) {
      return;
    }

    throw new ConflictException({
      message: 'Categorization rule already exists',
      rule: this.toConflict(duplicate),
    });
  }

  private async toViews(
    rules: CategorizationRuleEntity[],
    userId: string,
  ): Promise<CategorizationRuleView[]> {
    const categoriesById = await this.getTargetCategoriesById(rules, userId);
    return rules.map((rule) =>
      this.toViewFromCategoryMap(rule, categoriesById),
    );
  }

  private async toView(
    rule: CategorizationRuleEntity,
    userId: string,
  ): Promise<CategorizationRuleView> {
    const categoriesById = await this.getTargetCategoriesById([rule], userId);
    return this.toViewFromCategoryMap(rule, categoriesById);
  }

  private async getTargetCategoriesById(
    rules: CategorizationRuleEntity[],
    userId: string,
  ): Promise<Map<string, CategoryEntity>> {
    const categoryIds = Array.from(
      new Set(rules.map((rule) => rule.targetCategoryId)),
    );
    if (categoryIds.length === 0) {
      return new Map();
    }

    const categories = await this.categoryRepository.find({
      where: { id: In(categoryIds), userId },
    });

    return new Map(categories.map((category) => [category.id, category]));
  }

  private toViewFromCategoryMap(
    rule: CategorizationRuleEntity,
    categoriesById: Map<string, CategoryEntity>,
  ): CategorizationRuleView {
    const category = categoriesById.get(rule.targetCategoryId);
    if (!category) {
      throw new BadRequestException('Rule target category not found');
    }

    return {
      id: rule.id,
      name: rule.name,
      priority: rule.priority,
      targetCategoryId: rule.targetCategoryId,
      targetCategory: this.toCategoryView(category),
      conditions: rule.conditions,
      archivedAt: rule.archivedAt,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    };
  }

  private toCategoryView(
    category: CategoryEntity,
  ): CategorizationRuleCategoryView {
    return {
      id: category.id,
      primary: category.primary,
      detailed: category.detailed,
      color: category.color,
      archivedAt: category.archivedAt,
    };
  }

  private toConflict(
    rule: CategorizationRuleEntity,
  ): CategorizationRuleConflict {
    return {
      ruleId: rule.id,
      name: rule.name,
      label: rule.name,
      archivedAt: rule.archivedAt,
    };
  }
}
