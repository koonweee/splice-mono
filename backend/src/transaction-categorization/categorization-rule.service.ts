import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { CategoryEntity } from '../category/category.entity';
import { TransactionEntity } from '../transaction/transaction.entity';
import { getTransactionActivityDate } from '../transaction/transaction-date';
import type {
  ApplyCategorizationRuleResponse,
  CategorizationRuleCategoryView,
  CategorizationRuleCondition,
  CategorizationRuleConflict,
  CategorizationRuleChangePreview,
  CategorizationRuleDraftPreview,
  CategorizationRuleView,
  CreateCategorizationRuleDto,
  EditCategorizationRuleDto,
  PreviewCategorizationRuleDraftDto,
  PreviewCategorizationRuleApplicationResponse,
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

type RuleApplicationEvaluation = ApplyCategorizationRuleResponse & {
  manualAgreement: number;
  manualConflicts: number;
  existingRuleOverlap: number;
  previewTransactions?: TransactionEntity[];
};

@Injectable()
export class TransactionCategorizationService {
  private readonly logger = new Logger(TransactionCategorizationService.name);

  constructor(
    @InjectRepository(CategorizationRuleEntity)
    private readonly ruleRepository: Repository<CategorizationRuleEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
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

  async findOne(
    id: string,
    userId: string,
  ): Promise<CategorizationRuleView | null> {
    const rule = await this.ruleRepository.findOne({ where: { id, userId } });
    return rule ? this.toView(rule, userId) : null;
  }

  async create(
    userId: string,
    dto: CreateCategorizationRuleDto,
  ): Promise<CategorizationRuleView> {
    const next = await this.normalizeCreateDto(userId, dto);
    await this.validateActiveTargetCategory(userId, next.targetCategoryId);
    await this.validateOwnedAccountConditions(userId, next.conditions);
    await this.assertNoDuplicate(userId, next);

    const entity = this.ruleRepository.create({ userId, ...next });
    const saved = await this.ruleRepository.save(entity);
    return this.toView(saved, userId);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCategorizationRuleDto,
    options: { expectedRevision?: number } = {},
  ): Promise<CategorizationRuleView | null> {
    const entity = await this.ruleRepository.findOne({ where: { id, userId } });
    if (!entity) {
      return null;
    }

    if (
      options.expectedRevision !== undefined &&
      entity.revision !== options.expectedRevision
    ) {
      throw this.staleRuleConflict(id);
    }

    const next = this.buildUpdatedState(entity, dto);
    if (next.archivedAt === null) {
      await this.validateActiveTargetCategory(userId, next.targetCategoryId);
    } else {
      await this.validateOwnedTargetCategory(userId, next.targetCategoryId);
    }
    await this.validateOwnedAccountConditions(userId, next.conditions);

    const isRestoring = entity.archivedAt !== null && next.archivedAt === null;
    const mutatesIdentity =
      entity.targetCategoryId !== next.targetCategoryId ||
      this.engine.canonicalConditionsKey(entity.conditions) !==
        this.engine.canonicalConditionsKey(next.conditions);
    if (isRestoring || mutatesIdentity) {
      await this.assertNoDuplicate(userId, next, id);
    }

    if (options.expectedRevision !== undefined) {
      const updateResult = await this.ruleRepository.update(
        { id, userId, revision: options.expectedRevision },
        next,
      );
      if (updateResult.affected !== 1) {
        throw this.staleRuleConflict(id);
      }

      const saved = await this.ruleRepository.findOne({
        where: { id, userId },
      });
      if (!saved) {
        return null;
      }
      return this.toView(saved, userId);
    }

    Object.assign(entity, next);
    const saved = await this.ruleRepository.save(entity);
    return this.toView(saved, userId);
  }

  async previewRuleEdit(
    id: string,
    userId: string,
    dto: EditCategorizationRuleDto,
  ): Promise<CategorizationRuleChangePreview | null> {
    return this.previewRuleChange(id, userId, 'edit', dto);
  }

  async previewRuleArchive(
    id: string,
    userId: string,
  ): Promise<CategorizationRuleChangePreview | null> {
    return this.previewRuleChange(id, userId, 'archive', { archived: true });
  }

  async previewRuleRestore(
    id: string,
    userId: string,
  ): Promise<CategorizationRuleChangePreview | null> {
    return this.previewRuleChange(id, userId, 'restore', { archived: false });
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

  async previewDraftRuleApplication(
    userId: string,
    dto: PreviewCategorizationRuleDraftDto,
    options: { ignoredManualCategoryIds?: string[] } = {},
  ): Promise<CategorizationRuleDraftPreview> {
    const next = await this.normalizeDraftDto(userId, dto);
    await this.validateActiveTargetCategory(userId, next.targetCategoryId);
    await this.validateOwnedAccountConditions(userId, next.conditions);
    await this.assertNoActiveDuplicate(userId, next);

    const draftRule = this.ruleRepository.create({
      id: '00000000-0000-4000-8000-000000000000',
      userId,
      ...next,
    });
    const result = await this.evaluateRuleLikeApplication(draftRule, userId, {
      persist: false,
      previewLimit: 10,
      includeExistingRuleOverlap: true,
      ignoredManualCategoryIds: options.ignoredManualCategoryIds,
    });

    return {
      matched: result.matched,
      updated: result.updated,
      skippedManual: result.skippedManual,
      manualAgreement: result.manualAgreement,
      manualConflicts: result.manualConflicts,
      existingRuleOverlap: result.existingRuleOverlap,
      transactions: (result.previewTransactions ?? []).map((transaction) =>
        transaction.toObject(),
      ),
    };
  }

  async applyRuleAssignmentIfEligible(
    userId: string,
    transaction: TransactionEntity,
  ): Promise<boolean> {
    if (
      transaction.categoryAssignmentSource === 'manual' ||
      transaction.categoryAssignmentSource === 'rule'
    ) {
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
    options: { expectedRevision?: number } = {},
  ): Promise<ApplyCategorizationRuleResponse | null> {
    return this.transactionRepository.manager.transaction(async (manager) => {
      const result = await this.evaluateRuleApplication(id, userId, {
        manager,
        persist: true,
        expectedRevision: options.expectedRevision,
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
  ): Promise<PreviewCategorizationRuleApplicationResponse | null> {
    const result = await this.evaluateRuleApplication(id, userId, {
      persist: false,
      previewLimit: 10,
    });
    if (!result) {
      return null;
    }

    return {
      matched: result.matched,
      updated: result.updated,
      skippedManual: result.skippedManual,
      transactions: (result.previewTransactions ?? []).map((transaction) =>
        transaction.toObject(),
      ),
    };
  }

  private async evaluateRuleApplication(
    id: string,
    userId: string,
    options: {
      persist: boolean;
      manager?: EntityManager;
      previewLimit?: number;
      expectedRevision?: number;
    },
  ): Promise<RuleApplicationEvaluation | null> {
    const manager = options.manager ?? this.transactionRepository.manager;
    const rule = await manager.getRepository(CategorizationRuleEntity).findOne({
      where: { id, userId, archivedAt: IsNull() },
      ...(options.persist ? { lock: { mode: 'pessimistic_read' } } : {}),
    });
    if (!rule) {
      return null;
    }
    if (
      options.expectedRevision !== undefined &&
      rule.revision !== options.expectedRevision
    ) {
      throw this.staleRuleConflict(id);
    }

    return this.evaluateRuleLikeApplication(rule, userId, {
      ...options,
      respectActiveRulePrecedence: true,
    });
  }

  private async previewRuleChange(
    id: string,
    userId: string,
    action: 'edit' | 'archive' | 'restore',
    dto: UpdateCategorizationRuleDto,
  ): Promise<CategorizationRuleChangePreview | null> {
    const current = await this.ruleRepository.findOne({
      where: { id, userId },
    });
    if (!current) {
      return null;
    }
    if (action === 'archive' && current.archivedAt !== null) {
      throw new BadRequestException('Categorization rule is already archived');
    }
    if (action === 'restore' && current.archivedAt === null) {
      throw new BadRequestException('Categorization rule is already active');
    }

    const next = this.buildUpdatedState(current, dto);
    if (next.archivedAt === null) {
      await this.validateActiveTargetCategory(userId, next.targetCategoryId);
    } else {
      await this.validateOwnedTargetCategory(userId, next.targetCategoryId);
    }
    await this.validateOwnedAccountConditions(userId, next.conditions);
    const isRestoring = current.archivedAt !== null && next.archivedAt === null;
    const mutatesIdentity =
      current.targetCategoryId !== next.targetCategoryId ||
      this.engine.canonicalConditionsKey(current.conditions) !==
        this.engine.canonicalConditionsKey(next.conditions);
    if (isRestoring || mutatesIdentity) {
      await this.assertNoDuplicate(userId, next, id);
    }

    const proposed = this.ruleRepository.create({
      ...current,
      ...next,
    });
    const [currentRule, proposedRule, activeRules, transactions] =
      await Promise.all([
        this.toView(current, userId),
        this.toView(proposed, userId),
        this.ruleRepository.find({
          where: { userId, archivedAt: IsNull() },
          order: { priority: 'ASC', createdAt: 'ASC', id: 'ASC' },
        }),
        this.transactionRepository.find({
          where: { activity: { userId } },
          relations: ['activity', 'activity.account', 'category'],
        }),
      ]);
    const activeRulesWithoutCurrent = activeRules.filter(
      (rule) => rule.id !== current.id,
    );
    const rulesAfter =
      proposed.archivedAt === null
        ? [...activeRulesWithoutCurrent, proposed]
        : activeRulesWithoutCurrent;

    let matchedBefore = 0;
    let matchedAfter = 0;
    let newlyMatched = 0;
    let noLongerMatched = 0;
    let winningBefore = 0;
    let winningAfter = 0;
    let winnerChanged = 0;
    let skippedManual = 0;
    let historicalAssignments = 0;
    const changedTransactions: TransactionEntity[] = [];

    transactions.forEach((transaction) => {
      const matchesBefore =
        current.archivedAt === null &&
        this.engine.findFirstMatch([current], transaction) !== null;
      const matchesAfter =
        proposed.archivedAt === null &&
        this.engine.findFirstMatch([proposed], transaction) !== null;
      const before = this.engine.findFirstMatch(activeRules, transaction);
      const after = this.engine.findFirstMatch(rulesAfter, transaction);
      const isManual =
        transaction.source === 'manual' ||
        transaction.categoryAssignmentSource === 'manual';
      const outcomeChanged =
        before?.rule.id !== after?.rule.id ||
        before?.targetCategoryId !== after?.targetCategoryId;

      matchedBefore += matchesBefore ? 1 : 0;
      matchedAfter += matchesAfter ? 1 : 0;
      newlyMatched += !matchesBefore && matchesAfter ? 1 : 0;
      noLongerMatched += matchesBefore && !matchesAfter ? 1 : 0;
      winningBefore += before?.rule.id === current.id ? 1 : 0;
      winningAfter += after?.rule.id === current.id ? 1 : 0;
      historicalAssignments +=
        transaction.categoryAssignmentRuleId === current.id ? 1 : 0;

      if (!outcomeChanged) {
        return;
      }
      if (isManual) {
        skippedManual += 1;
        return;
      }

      winnerChanged += 1;
      changedTransactions.push(transaction);
    });

    return {
      action,
      currentRule,
      proposedRule,
      impact: {
        matchedBefore,
        matchedAfter,
        newlyMatched,
        noLongerMatched,
        winningBefore,
        winningAfter,
        winnerChanged,
        skippedManual,
        historicalAssignments,
        historicalAssignmentsUntouched: true,
      },
      transactions: changedTransactions
        .sort(compareTransactionsByActivityDateDesc)
        .slice(0, 10)
        .map((transaction) => transaction.toObject()),
    };
  }

  private async evaluateRuleLikeApplication(
    rule: CategorizationRuleEntity,
    userId: string,
    options: {
      persist: boolean;
      manager?: EntityManager;
      previewLimit?: number;
      includeExistingRuleOverlap?: boolean;
      respectActiveRulePrecedence?: boolean;
      ignoredManualCategoryIds?: string[];
    },
  ): Promise<RuleApplicationEvaluation> {
    const manager = options.manager ?? this.transactionRepository.manager;
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
    let manualAgreement = 0;
    let manualConflicts = 0;
    let existingRuleOverlap = 0;
    const updates: TransactionEntity[] = [];
    const previewTransactions: TransactionEntity[] = [];
    const ignoredManualCategoryIds = new Set(
      options.ignoredManualCategoryIds ?? [],
    );
    const activeRules =
      options.includeExistingRuleOverlap || options.respectActiveRulePrecedence
        ? await manager.getRepository(CategorizationRuleEntity).find({
            where: { userId, archivedAt: IsNull() },
            order: { priority: 'ASC', createdAt: 'ASC', id: 'ASC' },
          })
        : [];

    for (const transaction of transactions) {
      const match = this.engine.findFirstMatch([rule], transaction);
      if (!match) {
        continue;
      }

      matched += 1;
      if (
        options.includeExistingRuleOverlap &&
        this.engine.findFirstMatch(activeRules, transaction)
      ) {
        existingRuleOverlap += 1;
      }

      if (
        transaction.source === 'manual' ||
        transaction.categoryAssignmentSource === 'manual'
      ) {
        skippedManual += 1;
        if (
          transaction.categoryId &&
          ignoredManualCategoryIds.has(transaction.categoryId)
        ) {
          continue;
        }
        if (transaction.categoryId === rule.targetCategoryId) {
          manualAgreement += 1;
        } else {
          manualConflicts += 1;
        }
        continue;
      }

      if (
        options.respectActiveRulePrecedence &&
        this.engine.findFirstMatch(activeRules, transaction)?.rule.id !==
          rule.id
      ) {
        continue;
      }

      const alreadyAssigned =
        transaction.categoryId === category.id &&
        transaction.categoryAssignmentSource === 'rule' &&
        transaction.categoryAssignmentRuleId === rule.id;
      if (alreadyAssigned) {
        continue;
      }

      updated += 1;
      if (options.previewLimit !== undefined) {
        previewTransactions.push(transaction);
      }

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

    const sortedPreviewTransactions = previewTransactions
      .sort(compareTransactionsByActivityDateDesc)
      .slice(0, options.previewLimit);

    return {
      matched,
      updated,
      skippedManual,
      manualAgreement,
      manualConflicts,
      existingRuleOverlap,
      ...(options.previewLimit !== undefined
        ? { previewTransactions: sortedPreviewTransactions }
        : {}),
    };
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

  private async normalizeDraftDto(
    userId: string,
    dto: PreviewCategorizationRuleDraftDto,
  ): Promise<EditableRuleState> {
    return {
      name: 'Draft categorization rule',
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

  private async validateOwnedAccountConditions(
    userId: string,
    conditions: CategorizationRuleCondition[],
  ): Promise<void> {
    const accountIds = Array.from(
      new Set(
        conditions.flatMap((condition) => {
          if (condition.field !== 'accountId') {
            return [];
          }

          return Array.isArray(condition.value)
            ? condition.value
            : [condition.value];
        }),
      ),
    );
    if (accountIds.length === 0) {
      return;
    }

    const accounts = await this.accountRepository.find({
      where: { id: In(accountIds), userId },
      select: { id: true },
    });
    if (accounts.length !== accountIds.length) {
      throw new BadRequestException(
        'One or more accountId conditions are not valid for this user',
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

  private async assertNoActiveDuplicate(
    userId: string,
    next: EditableRuleState,
  ): Promise<void> {
    const rules = await this.ruleRepository.find({
      where: { userId, archivedAt: IsNull() },
      order: { priority: 'ASC', createdAt: 'ASC', id: 'ASC' },
    });
    const nextConditionsKey = this.engine.canonicalConditionsKey(
      next.conditions,
    );
    const duplicate = rules.find(
      (rule) =>
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
      revision: rule.revision,
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

  private staleRuleConflict(id: string): ConflictException {
    return new ConflictException({
      message:
        'Categorization rule changed after it was previewed; inspect and preview it again',
      ruleId: id,
    });
  }
}

function compareTransactionsByActivityDateDesc(
  left: TransactionEntity,
  right: TransactionEntity,
): number {
  const activityDateComparison = getTransactionActivityDate(
    right,
  ).localeCompare(getTransactionActivityDate(left));
  if (activityDateComparison !== 0) {
    return activityDateComparison;
  }

  return right.id.localeCompare(left.id);
}
