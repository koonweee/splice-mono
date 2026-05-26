import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThan, Not, Repository } from 'typeorm';
import { CategoryEntity } from '../../category/category.entity';
import { TransactionEntity } from '../../transaction/transaction.entity';
import { getTransactionActivityDate } from '../../transaction/transaction-date';
import type {
  CategorizationRuleCondition,
  CreateCategorizationRuleDto,
} from '../../types/CategorizationRule';
import type {
  CategorizationRuleRecommendationGenerationResponse,
  CategorizationRuleRecommendationListResponse,
  CategorizationRuleSuggestion,
  CategorizationRuleSuggestionGeneration,
} from '../../types/CategorizationRuleSuggestion';
import { CategorizationRuleEntity } from '../categorization-rule.entity';
import { TransactionCategorizationService } from '../categorization-rule.service';
import { RuleBasedCategorizationEngine } from '../rule-based-categorization.engine';
import type { CategorizationRuleSuggestionCandidate } from './categorization-rule-recommendation.agent';
import { CategorizationRuleSuggestionGenerationEntity } from './categorization-rule-recommendation-generation.entity';
import { CategorizationRuleSuggestionEntity } from './categorization-rule-recommendation.entity';

type ManualExampleSearch = {
  categoryId?: string;
  query?: string;
  limit?: number;
};

type RuleCandidatePatternField =
  | 'merchantName'
  | 'website'
  | 'merchantEntityId'
  | 'providerCategoryDetailed'
  | 'providerCategoryPrimary';

type RuleCandidatePatternSearch = {
  fields?: RuleCandidatePatternField[];
  minAgreement?: number;
  maxConflictRate?: number;
  limit?: number;
};

type RecommendationGenerationOptions = {
  ignoredCategoryIds?: string[];
};

type RuleCandidatePatternSuggestion = {
  field: RuleCandidatePatternField;
  operator: 'equals';
  value: string;
  targetCategoryId: string;
  targetCategory: {
    id: string;
    primary: string;
    detailed: string;
  };
  conditions: CategorizationRuleCondition[];
  agreement: number;
  conflicts: number;
  conflictRate: number;
  totalManualMatches: number;
  historicalCategoryHint: boolean;
  preview: {
    matched: number;
    updated: number;
    skippedManual: number;
    manualAgreement: number;
    manualConflicts: number;
    existingRuleOverlap: number;
  };
};

type CandidateRejectionReason =
  | 'duplicate-in-generation'
  | 'brittle-candidate'
  | 'duplicate-pending-suggestion'
  | 'ignored-target-category'
  | 'insufficient-manual-evidence'
  | 'manual-conflict-rate-too-high'
  | 'existing-rule-overlap-too-high'
  | 'invalid-draft';

const GENERIC_TEXT_VALUES = new Set([
  'sq',
  'tst',
  'paypal',
  'pos',
  'debit',
  'checkcard',
  'purchase',
  'card',
]);
const PROCESSING_STALE_MS = 15 * 60 * 1000;
const DEFAULT_PATTERN_FIELDS: RuleCandidatePatternField[] = [
  'merchantName',
  'website',
  'merchantEntityId',
  'providerCategoryDetailed',
  'providerCategoryPrimary',
];
const PATTERN_FIELD_RANK = new Map<RuleCandidatePatternField, number>(
  DEFAULT_PATTERN_FIELDS.map((field, index) => [field, index]),
);

@Injectable()
export class CategorizationRuleRecommendationService {
  private readonly logger = new Logger(
    CategorizationRuleRecommendationService.name,
  );

  constructor(
    @InjectRepository(CategorizationRuleSuggestionEntity)
    private readonly suggestionRepository: Repository<CategorizationRuleSuggestionEntity>,
    @InjectRepository(CategorizationRuleSuggestionGenerationEntity)
    private readonly generationRepository: Repository<CategorizationRuleSuggestionGenerationEntity>,
    @InjectRepository(CategorizationRuleEntity)
    private readonly ruleRepository: Repository<CategorizationRuleEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    private readonly categorizationService: TransactionCategorizationService,
    private readonly engine: RuleBasedCategorizationEngine,
  ) {}

  async list(
    userId: string,
  ): Promise<CategorizationRuleRecommendationListResponse> {
    await this.failStaleProcessingGenerations(userId);
    const generation = await this.generationRepository.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const suggestions = await this.suggestionRepository.find({
      where: { userId, status: 'pending' },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return {
      generation: generation ? this.toGenerationView(generation) : null,
      suggestions: await this.toSuggestionViews(suggestions, userId),
    };
  }

  async requestGeneration(
    userId: string,
    options: { regenerate: boolean; ignoredCategoryIds?: string[] },
  ): Promise<CategorizationRuleRecommendationGenerationResponse> {
    this.assertGenerationConfigured();
    await this.failStaleProcessingGenerations(userId);
    const ignoredCategoryIds = await this.normalizeIgnoredCategoryIds(
      userId,
      options.ignoredCategoryIds,
    );

    const existingProcessing = await this.generationRepository.findOne({
      where: { userId, status: In(['pending', 'processing']) },
      order: { createdAt: 'DESC' },
    });
    if (existingProcessing && !options.regenerate) {
      return this.responseForGeneration(existingProcessing, userId);
    }

    if (!options.regenerate) {
      const pendingSuggestion = await this.suggestionRepository.findOne({
        where: { userId, status: 'pending' },
        order: { createdAt: 'ASC' },
      });
      if (pendingSuggestion) {
        const generation = await this.generationRepository.findOne({
          where: { id: pendingSuggestion.generationId, userId },
        });
        if (generation) {
          return this.responseForGeneration(generation, userId);
        }
      }
    }

    if (options.regenerate) {
      await this.suggestionRepository.update(
        { userId, status: 'pending' },
        { status: 'superseded' },
      );
      await this.generationRepository.update(
        { userId, status: In(['pending', 'processing']) },
        {
          status: 'failed',
          failedAt: new Date(),
          errorMessage: 'Superseded by a newer recommendation generation',
        },
      );
    }

    const generation = this.generationRepository.create({
      userId,
      status: 'pending',
      model: this.getModel(),
      ignoredCategoryIds,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      errorMessage: null,
    });
    const saved = await this.generationRepository.save(generation);
    return this.responseForGeneration(saved, userId);
  }

  async generate(
    userId: string,
  ): Promise<CategorizationRuleRecommendationGenerationResponse> {
    return this.requestGeneration(userId, { regenerate: false });
  }

  async regenerate(
    userId: string,
  ): Promise<CategorizationRuleRecommendationGenerationResponse> {
    return this.requestGeneration(userId, { regenerate: true });
  }

  async acquirePendingGeneration(): Promise<CategorizationRuleSuggestionGenerationEntity | null> {
    await this.failStaleProcessingGenerations();

    return this.generationRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(
        CategorizationRuleSuggestionGenerationEntity,
      );
      const generation = await repository
        .createQueryBuilder('generation')
        .where('generation.status = :status', { status: 'pending' })
        .orderBy('generation.createdAt', 'ASC')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .getOne();
      if (!generation) {
        return null;
      }

      generation.status = 'processing';
      generation.startedAt = new Date();
      generation.errorMessage = null;
      return repository.save(generation);
    });
  }

  async completeGeneration(
    generation: CategorizationRuleSuggestionGenerationEntity,
    candidates: CategorizationRuleSuggestionCandidate[],
  ): Promise<CategorizationRuleSuggestionEntity[]> {
    const completedAt = new Date();
    const claimed = await this.generationRepository.update(
      { id: generation.id, status: 'processing' },
      {
        status: 'completed',
        completedAt,
        failedAt: null,
        errorMessage: null,
      },
    );
    if (!claimed.affected) {
      return [];
    }

    generation.status = 'completed';
    generation.completedAt = completedAt;
    generation.failedAt = null;
    generation.errorMessage = null;

    const persisted = await this.validateAndPersistCandidates(
      generation,
      candidates,
      { ignoredCategoryIds: generation.ignoredCategoryIds },
    );
    return persisted;
  }

  async failGeneration(
    generation: CategorizationRuleSuggestionGenerationEntity,
    error: unknown,
  ): Promise<void> {
    generation.status = 'failed';
    generation.failedAt = new Date();
    generation.errorMessage =
      error instanceof Error ? error.message : String(error);
    await this.generationRepository.save(generation);
  }

  async accept(
    id: string,
    userId: string,
  ): Promise<CategorizationRuleSuggestion> {
    const suggestion = await this.findPendingSuggestion(id, userId);
    const rule = await this.categorizationService.create(userId, {
      name: suggestion.name,
      priority: suggestion.priority,
      targetCategoryId: suggestion.targetCategoryId,
      conditions: suggestion.conditions,
    });

    suggestion.status = 'accepted';
    suggestion.acceptedRuleId = rule.id;
    const saved = await this.suggestionRepository.save(suggestion);
    return this.toSuggestionView(saved, userId);
  }

  async dismiss(
    id: string,
    userId: string,
  ): Promise<CategorizationRuleSuggestion> {
    const suggestion = await this.findPendingSuggestion(id, userId);
    suggestion.status = 'dismissed';
    const saved = await this.suggestionRepository.save(suggestion);
    return this.toSuggestionView(saved, userId);
  }

  async listExistingRulesForAgent(
    userId: string,
    options: RecommendationGenerationOptions = {},
  ): Promise<unknown> {
    const ignoredCategoryIds = this.toCategoryIdSet(options.ignoredCategoryIds);
    const rules = await this.categorizationService.findAll(userId);
    const categories = await this.categoryRepository.find({
      where: { userId, archivedAt: IsNull() },
      order: { primary: 'ASC', detailed: 'ASC' },
    });
    const pendingSuggestions = await this.suggestionRepository.find({
      where: { userId, status: 'pending' },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return {
      categories: categories
        .filter((category) => !ignoredCategoryIds.has(category.id))
        .map((category) => ({
          id: category.id,
          primary: category.primary,
          detailed: category.detailed,
        })),
      rules: rules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        priority: rule.priority,
        targetCategoryId: rule.targetCategoryId,
        conditions: rule.conditions,
      })),
      pendingSuggestions: pendingSuggestions.map((suggestion) => ({
        id: suggestion.id,
        name: suggestion.name,
        targetCategoryId: suggestion.targetCategoryId,
        conditions: suggestion.conditions,
      })),
    };
  }

  async searchManualExamples(
    userId: string,
    input: ManualExampleSearch,
    options: RecommendationGenerationOptions = {},
  ): Promise<unknown> {
    const ignoredCategoryIds = this.toCategoryIdSet(options.ignoredCategoryIds);
    if (input.categoryId && ignoredCategoryIds.has(input.categoryId)) {
      return { transactions: [] };
    }
    const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);
    const transactions = await this.transactionRepository.find({
      where: {
        activity: { userId },
        categoryAssignmentSource: 'manual',
        categoryId: input.categoryId ?? Not(IsNull()),
      },
      relations: ['activity', 'activity.account', 'category'],
      order: { createdAt: 'DESC' },
      take: 250,
    });
    const query = input.query?.trim().toLowerCase() ?? '';
    const filtered = transactions
      .filter((transaction) => {
        if (
          transaction.categoryId &&
          ignoredCategoryIds.has(transaction.categoryId)
        ) {
          return false;
        }
        if (!query) {
          return true;
        }
        return [
          transaction.merchantName,
          transaction.providerTransactionName,
          transaction.originalDescription,
          transaction.providerCategoryPrimary,
          transaction.providerCategoryDetailed,
          transaction.website,
          transaction.merchantEntityId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .slice(0, limit);

    return {
      transactions: filtered.map((transaction) => {
        const amount = transaction.amount.toMoneyWithSign();
        return {
          id: transaction.id,
          merchantName: transaction.merchantName,
          providerTransactionName: transaction.providerTransactionName,
          originalDescription: transaction.originalDescription,
          providerCategoryPrimary: transaction.providerCategoryPrimary,
          providerCategoryDetailed: transaction.providerCategoryDetailed,
          website: transaction.website,
          merchantEntityId: transaction.merchantEntityId,
          amount: amount.money.amount,
          amountCurrency: amount.money.currency,
          amountSign: amount.sign,
          activityDate: getTransactionActivityDate(transaction),
          accountLabel:
            transaction.account?.customName ??
            transaction.account?.name ??
            'Account',
          categoryId: transaction.categoryId,
          category: transaction.category
            ? {
                id: transaction.category.id,
                primary: transaction.category.primary,
                detailed: transaction.category.detailed,
              }
            : null,
        };
      }),
    };
  }

  async listRuleCandidatePatternsForAgent(
    userId: string,
    input: RuleCandidatePatternSearch,
    options: RecommendationGenerationOptions = {},
  ): Promise<unknown> {
    const ignoredCategoryIds = this.toCategoryIdSet(options.ignoredCategoryIds);
    const fields = Array.from(
      new Set(input.fields?.length ? input.fields : DEFAULT_PATTERN_FIELDS),
    );
    const minAgreement = Math.min(Math.max(input.minAgreement ?? 3, 1), 50);
    const maxConflictRate = Math.min(
      Math.max(input.maxConflictRate ?? 0.05, 0),
      1,
    );
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);

    const [transactions, categories, rules, pendingSuggestions] =
      await Promise.all([
        this.transactionRepository.find({
          where: {
            activity: { userId },
            categoryAssignmentSource: 'manual',
            categoryId: Not(IsNull()),
          },
          relations: ['activity', 'category'],
          order: { createdAt: 'DESC' },
          take: 5000,
        }),
        this.categoryRepository.find({
          where: { userId, archivedAt: IsNull() },
          order: { primary: 'ASC', detailed: 'ASC' },
        }),
        this.categorizationService.findAll(userId),
        this.suggestionRepository.find({
          where: { userId, status: 'pending' },
          order: { createdAt: 'ASC', id: 'ASC' },
        }),
      ]);

    const categoriesById = new Map(
      categories
        .filter((category) => !ignoredCategoryIds.has(category.id))
        .map((category) => [category.id, category]),
    );
    const occupiedKeys = new Set([
      ...rules.map(
        (rule) =>
          `${rule.targetCategoryId}:${this.engine.canonicalConditionsKey(rule.conditions)}`,
      ),
      ...pendingSuggestions.map(
        (suggestion) =>
          `${suggestion.targetCategoryId}:${this.engine.canonicalConditionsKey(suggestion.conditions)}`,
      ),
    ]);

    type PatternGroup = {
      field: RuleCandidatePatternField;
      value: string;
      countsByCategoryId: Map<string, number>;
      total: number;
    };

    const groups = new Map<string, PatternGroup>();
    for (const transaction of transactions) {
      if (
        !transaction.categoryId ||
        ignoredCategoryIds.has(transaction.categoryId)
      ) {
        continue;
      }
      for (const field of fields) {
        const value = this.getPatternFieldValue(transaction, field);
        if (!value) {
          continue;
        }
        const groupKey = `${field}:${this.normalizePatternValue(value)}`;
        const group =
          groups.get(groupKey) ??
          ({
            field,
            value,
            countsByCategoryId: new Map<string, number>(),
            total: 0,
          } satisfies PatternGroup);
        group.countsByCategoryId.set(
          transaction.categoryId,
          (group.countsByCategoryId.get(transaction.categoryId) ?? 0) + 1,
        );
        group.total += 1;
        groups.set(groupKey, group);
      }
    }

    const rawCandidates = Array.from(groups.values())
      .map((group) => {
        const [targetCategoryId, agreement] = Array.from(
          group.countsByCategoryId.entries(),
        ).sort((left, right) => right[1] - left[1])[0] ?? [null, 0];
        if (!targetCategoryId) {
          return null;
        }
        const category = categoriesById.get(targetCategoryId);
        const conflicts = group.total - agreement;
        const conflictRate = group.total > 0 ? conflicts / group.total : 1;
        return {
          field: group.field,
          value: group.value,
          targetCategoryId,
          category,
          agreement,
          conflicts,
          conflictRate,
          totalManualMatches: group.total,
        };
      })
      .filter((candidate) => {
        if (!candidate?.category) {
          return false;
        }
        return (
          candidate.agreement >= minAgreement &&
          candidate.conflictRate <= maxConflictRate
        );
      })
      .sort((left, right) => {
        if (!left || !right) {
          return 0;
        }
        return (
          left.conflictRate - right.conflictRate ||
          right.agreement - left.agreement ||
          (PATTERN_FIELD_RANK.get(left.field) ?? 99) -
            (PATTERN_FIELD_RANK.get(right.field) ?? 99) ||
          left.value.localeCompare(right.value)
        );
      })
      .slice(0, limit * 3);

    const candidates: RuleCandidatePatternSuggestion[] = [];
    for (const candidate of rawCandidates) {
      if (!candidate?.category) {
        continue;
      }
      const condition: CategorizationRuleCondition = {
        field: candidate.field,
        operator: 'equals',
        value: candidate.value,
      };
      const normalizedConditions = this.engine.normalizeConditions([condition]);
      const occupiedKey = `${candidate.targetCategoryId}:${this.engine.canonicalConditionsKey(normalizedConditions)}`;
      if (occupiedKeys.has(occupiedKey)) {
        continue;
      }

      const suggestionCandidate: CategorizationRuleSuggestionCandidate = {
        name: `${candidate.value} -> ${candidate.category.detailed}`,
        targetCategoryId: candidate.targetCategoryId,
        conditions: normalizedConditions,
        rationale: `${candidate.agreement} matching manual examples use ${candidate.category.primary} / ${candidate.category.detailed}.`,
      };
      if (this.isBrittleCandidate(suggestionCandidate)) {
        continue;
      }

      try {
        const preview =
          await this.categorizationService.previewDraftRuleApplication(
            userId,
            {
              targetCategoryId: candidate.targetCategoryId,
              conditions: normalizedConditions,
            },
            {
              ignoredManualCategoryIds: Array.from(ignoredCategoryIds),
            },
          );
        const rejection = this.getQualityGateRejection(preview);
        if (rejection) {
          continue;
        }

        candidates.push({
          field: candidate.field,
          operator: 'equals',
          value: candidate.value,
          targetCategoryId: candidate.targetCategoryId,
          targetCategory: {
            id: candidate.category.id,
            primary: candidate.category.primary,
            detailed: candidate.category.detailed,
          },
          conditions: normalizedConditions,
          agreement: candidate.agreement,
          conflicts: candidate.conflicts,
          conflictRate: candidate.conflictRate,
          totalManualMatches: candidate.totalManualMatches,
          historicalCategoryHint: this.isHistoricalCategory(candidate.category),
          preview: {
            matched: preview.matched,
            updated: preview.updated,
            skippedManual: preview.skippedManual,
            manualAgreement: preview.manualAgreement,
            manualConflicts: preview.manualConflicts,
            existingRuleOverlap: preview.existingRuleOverlap,
          },
        });
      } catch (error) {
        if (
          error instanceof BadRequestException ||
          error instanceof ConflictException
        ) {
          continue;
        }
        throw error;
      }

      if (candidates.length >= limit) {
        break;
      }
    }

    return {
      filters: {
        fields,
        minAgreement,
        maxConflictRate,
        limit,
      },
      candidates,
    };
  }

  async listDeterministicCandidatesForGeneration(
    userId: string,
    options: RecommendationGenerationOptions = {},
  ): Promise<CategorizationRuleSuggestionCandidate[]> {
    const result = (await this.listRuleCandidatePatternsForAgent(
      userId,
      {
        minAgreement: 3,
        maxConflictRate: 0.05,
        limit: 50,
      },
      options,
    )) as { candidates: RuleCandidatePatternSuggestion[] };
    const selected: CategorizationRuleSuggestionCandidate[] = [];
    const selectedByCategoryId = new Map<string, number>();
    const seenConditionKeys = new Set<string>();

    const rankedCandidates = [...result.candidates].sort(
      (left, right) =>
        left.conflictRate - right.conflictRate ||
        (PATTERN_FIELD_RANK.get(left.field) ?? 99) -
          (PATTERN_FIELD_RANK.get(right.field) ?? 99) ||
        right.agreement - left.agreement ||
        left.value.localeCompare(right.value),
    );

    for (const candidate of rankedCandidates) {
      if (selected.length >= 8) {
        break;
      }
      const selectedForCategory =
        selectedByCategoryId.get(candidate.targetCategoryId) ?? 0;
      if (selectedForCategory >= 2) {
        continue;
      }
      const conditionKey = `${candidate.targetCategoryId}:${this.engine.canonicalConditionsKey(candidate.conditions)}`;
      if (seenConditionKeys.has(conditionKey)) {
        continue;
      }

      selected.push({
        name: this.buildDeterministicCandidateName(candidate),
        targetCategoryId: candidate.targetCategoryId,
        conditions: candidate.conditions,
        rationale: [
          `${candidate.agreement} matching manual examples use ${candidate.targetCategory.primary} / ${candidate.targetCategory.detailed}.`,
          candidate.conflicts === 0
            ? 'No manual conflicts were found after ignored categories were excluded.'
            : `${candidate.conflicts} manual conflicts were found after ignored categories were excluded.`,
          'This deterministic candidate passed backend preview validation.',
        ].join(' '),
      });
      selectedByCategoryId.set(
        candidate.targetCategoryId,
        selectedForCategory + 1,
      );
      seenConditionKeys.add(conditionKey);
    }

    return selected;
  }

  async previewDraftForAgent(
    userId: string,
    candidate: Pick<
      CreateCategorizationRuleDto,
      'targetCategoryId' | 'priority' | 'conditions'
    >,
    options: RecommendationGenerationOptions = {},
  ): Promise<unknown> {
    return this.categorizationService.previewDraftRuleApplication(
      userId,
      {
        targetCategoryId: candidate.targetCategoryId,
        priority: candidate.priority,
        conditions: candidate.conditions,
      },
      { ignoredManualCategoryIds: options.ignoredCategoryIds },
    );
  }

  getModel(): string {
    return process.env.CATEGORIZATION_RULE_RECOMMENDER_MODEL ?? 'gpt-5.4-mini';
  }

  getMaxToolSteps(): number {
    const parsed = Number(
      process.env.CATEGORIZATION_RULE_RECOMMENDER_MAX_TOOL_STEPS ?? 30,
    );
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 30;
  }

  private async normalizeIgnoredCategoryIds(
    userId: string,
    categoryIds: string[] | undefined,
  ): Promise<string[]> {
    const uniqueIds = Array.from(new Set(categoryIds ?? []));
    if (uniqueIds.length === 0) {
      return [];
    }

    const ownedCount = await this.categoryRepository.count({
      where: { userId, id: In(uniqueIds) },
    });
    if (ownedCount !== uniqueIds.length) {
      throw new BadRequestException(
        'Ignored categories must belong to the user',
      );
    }

    return uniqueIds.sort();
  }

  private toCategoryIdSet(categoryIds: string[] | undefined): Set<string> {
    return new Set(categoryIds ?? []);
  }

  private assertGenerationConfigured(): void {
    if (!process.env.OPENAI_API_KEY) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is required to generate categorization rule recommendations',
      );
    }
  }

  private async failStaleProcessingGenerations(userId?: string): Promise<void> {
    await this.generationRepository.update(
      {
        ...(userId ? { userId } : {}),
        status: 'processing',
        startedAt: LessThan(new Date(Date.now() - PROCESSING_STALE_MS)),
      },
      {
        status: 'failed',
        failedAt: new Date(),
        errorMessage: 'Recommendation generation timed out',
      },
    );
  }

  private async validateAndPersistCandidates(
    generation: CategorizationRuleSuggestionGenerationEntity,
    candidates: CategorizationRuleSuggestionCandidate[],
    options: RecommendationGenerationOptions,
  ): Promise<CategorizationRuleSuggestionEntity[]> {
    const persisted: CategorizationRuleSuggestionEntity[] = [];
    const seen = new Set<string>();
    const ignoredCategoryIds = this.toCategoryIdSet(options.ignoredCategoryIds);
    for (const candidate of candidates) {
      const normalized: CategorizationRuleSuggestionCandidate = {
        ...candidate,
        name: candidate.name.trim().slice(0, 80),
        rationale: candidate.rationale.trim().slice(0, 1000),
        priority:
          candidate.priority ?? (await this.getNextPriority(generation.userId)),
        conditions: this.engine.normalizeConditions(candidate.conditions),
      };
      const key = `${normalized.targetCategoryId}:${this.engine.canonicalConditionsKey(normalized.conditions)}`;
      if (seen.has(key)) {
        this.logCandidateRejected(generation, normalized, {
          reason: 'duplicate-in-generation',
        });
        continue;
      }
      if (this.isBrittleCandidate(normalized)) {
        this.logCandidateRejected(generation, normalized, {
          reason: 'brittle-candidate',
        });
        continue;
      }
      if (ignoredCategoryIds.has(normalized.targetCategoryId)) {
        this.logCandidateRejected(generation, normalized, {
          reason: 'ignored-target-category',
        });
        continue;
      }
      seen.add(key);

      const duplicatePending = await this.suggestionRepository.findOne({
        where: {
          userId: generation.userId,
          targetCategoryId: normalized.targetCategoryId,
          status: 'pending',
        },
      });
      if (
        duplicatePending &&
        this.engine.canonicalConditionsKey(duplicatePending.conditions) ===
          this.engine.canonicalConditionsKey(normalized.conditions)
      ) {
        this.logCandidateRejected(generation, normalized, {
          reason: 'duplicate-pending-suggestion',
        });
        continue;
      }

      try {
        const preview =
          await this.categorizationService.previewDraftRuleApplication(
            generation.userId,
            {
              targetCategoryId: normalized.targetCategoryId,
              priority: normalized.priority,
              conditions: normalized.conditions,
            },
            { ignoredManualCategoryIds: Array.from(ignoredCategoryIds) },
          );
        const qualityRejection = this.getQualityGateRejection(preview);
        if (qualityRejection) {
          this.logCandidateRejected(generation, normalized, {
            reason: qualityRejection,
            preview,
          });
          continue;
        }

        const entity = this.suggestionRepository.create({
          userId: generation.userId,
          generationId: generation.id,
          name: normalized.name,
          targetCategoryId: normalized.targetCategoryId,
          priority: normalized.priority,
          conditions: normalized.conditions,
          rationale: normalized.rationale,
          status: 'pending',
          acceptedRuleId: null,
          matched: preview.matched,
          updated: preview.updated,
          skippedManual: preview.skippedManual,
          manualAgreement: preview.manualAgreement,
          manualConflicts: preview.manualConflicts,
          existingRuleOverlap: preview.existingRuleOverlap,
          previewTransactions: preview.transactions,
          generatedBy: 'mastra',
          model: generation.model,
        });
        persisted.push(await this.suggestionRepository.save(entity));
      } catch (error) {
        if (
          error instanceof BadRequestException ||
          error instanceof ConflictException
        ) {
          this.logCandidateRejected(generation, normalized, {
            reason: 'invalid-draft',
            error,
          });
          continue;
        }
        throw error;
      }
    }

    return persisted;
  }

  private getQualityGateRejection(preview: {
    matched: number;
    updated: number;
    skippedManual: number;
    manualAgreement: number;
    manualConflicts: number;
    existingRuleOverlap: number;
  }): CandidateRejectionReason | null {
    if (preview.manualAgreement < 3) {
      return 'insufficient-manual-evidence';
    }
    const manualTotal = preview.manualAgreement + preview.manualConflicts;
    if (manualTotal > 0 && preview.manualConflicts / manualTotal > 0.05) {
      return 'manual-conflict-rate-too-high';
    }
    if (
      preview.matched > 0 &&
      preview.existingRuleOverlap / preview.matched > 0.8
    ) {
      return 'existing-rule-overlap-too-high';
    }
    return null;
  }

  private isBrittleCandidate(
    candidate: CategorizationRuleSuggestionCandidate,
  ): boolean {
    const hasOnlyAmount = candidate.conditions.every(
      (condition) => condition.field === 'amount',
    );
    if (hasOnlyAmount) {
      return true;
    }

    return candidate.conditions.some((condition) => {
      if (
        ![
          'merchantName',
          'providerTransactionName',
          'originalDescription',
          'merchantEntityId',
          'website',
          'providerCategoryPrimary',
          'providerCategoryDetailed',
        ].includes(condition.field)
      ) {
        return false;
      }
      if (typeof condition.value !== 'string') {
        return false;
      }
      const value = condition.value.trim().toLowerCase();
      return value.length < 3 || GENERIC_TEXT_VALUES.has(value);
    });
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

  private logCandidateRejected(
    generation: CategorizationRuleSuggestionGenerationEntity,
    candidate: CategorizationRuleSuggestionCandidate,
    details: {
      reason: CandidateRejectionReason;
      preview?: {
        matched: number;
        updated: number;
        skippedManual: number;
        manualAgreement: number;
        manualConflicts: number;
        existingRuleOverlap: number;
      };
      error?: unknown;
    },
  ): void {
    this.logger.log(
      {
        userId: generation.userId,
        generationId: generation.id,
        candidateName: candidate.name,
        targetCategoryId: candidate.targetCategoryId,
        conditionFields: candidate.conditions.map((condition) => ({
          field: condition.field,
          operator: condition.operator,
        })),
        reason: details.reason,
        preview: details.preview
          ? {
              matched: details.preview.matched,
              updated: details.preview.updated,
              skippedManual: details.preview.skippedManual,
              manualAgreement: details.preview.manualAgreement,
              manualConflicts: details.preview.manualConflicts,
              existingRuleOverlap: details.preview.existingRuleOverlap,
            }
          : undefined,
        error:
          details.error === undefined
            ? undefined
            : this.formatUnknownError(details.error),
      },
      'Rejected categorization rule recommendation candidate',
    );
  }

  private getPatternFieldValue(
    transaction: TransactionEntity,
    field: RuleCandidatePatternField,
  ): string | null {
    const value = transaction[field];
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim().replace(/\s+/g, ' ');
    return normalized.length > 0 ? normalized : null;
  }

  private normalizePatternValue(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private isHistoricalCategory(
    category: Pick<CategoryEntity, 'primary' | 'detailed'>,
  ): boolean {
    return (
      category.primary.trim().toLowerCase() === 'others' &&
      category.detailed.trim().toLowerCase() === 'pre 2026'
    );
  }

  private buildDeterministicCandidateName(
    candidate: RuleCandidatePatternSuggestion,
  ): string {
    const value =
      candidate.value.length > 42
        ? `${candidate.value.slice(0, 39).trim()}...`
        : candidate.value;
    return `${value} ${candidate.targetCategory.detailed}`.slice(0, 80);
  }

  private formatUnknownError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (
      typeof error === 'number' ||
      typeof error === 'boolean' ||
      typeof error === 'bigint'
    ) {
      return error.toString();
    }
    try {
      return JSON.stringify(error) ?? 'Unknown error';
    } catch {
      return 'Unserializable error';
    }
  }

  private async responseForGeneration(
    generation: CategorizationRuleSuggestionGenerationEntity,
    userId: string,
  ): Promise<CategorizationRuleRecommendationGenerationResponse> {
    const suggestions = await this.suggestionRepository.find({
      where: { userId, generationId: generation.id, status: 'pending' },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return {
      generation: this.toGenerationView(generation),
      suggestions: await this.toSuggestionViews(suggestions, userId),
    };
  }

  private async findPendingSuggestion(
    id: string,
    userId: string,
  ): Promise<CategorizationRuleSuggestionEntity> {
    const suggestion = await this.suggestionRepository.findOne({
      where: { id, userId, status: 'pending' },
    });
    if (!suggestion) {
      throw new NotFoundException(`Recommendation ${id} not found`);
    }
    return suggestion;
  }

  private async toSuggestionViews(
    suggestions: CategorizationRuleSuggestionEntity[],
    userId: string,
  ): Promise<CategorizationRuleSuggestion[]> {
    return Promise.all(
      suggestions.map((suggestion) =>
        this.toSuggestionView(suggestion, userId),
      ),
    );
  }

  private async toSuggestionView(
    suggestion: CategorizationRuleSuggestionEntity,
    userId: string,
  ): Promise<CategorizationRuleSuggestion> {
    const category = await this.categoryRepository.findOne({
      where: { id: suggestion.targetCategoryId, userId },
    });
    if (!category) {
      throw new BadRequestException('Suggestion target category not found');
    }
    return {
      id: suggestion.id,
      userId: suggestion.userId,
      generationId: suggestion.generationId,
      name: suggestion.name,
      targetCategoryId: suggestion.targetCategoryId,
      targetCategory: {
        id: category.id,
        primary: category.primary,
        detailed: category.detailed,
        color: category.color,
        archivedAt: category.archivedAt,
      },
      priority: suggestion.priority,
      conditions: suggestion.conditions,
      rationale: suggestion.rationale,
      status: suggestion.status,
      acceptedRuleId: suggestion.acceptedRuleId,
      matched: suggestion.matched,
      updated: suggestion.updated,
      skippedManual: suggestion.skippedManual,
      manualAgreement: suggestion.manualAgreement,
      manualConflicts: suggestion.manualConflicts,
      existingRuleOverlap: suggestion.existingRuleOverlap,
      previewTransactions: suggestion.previewTransactions,
      generatedBy: suggestion.generatedBy,
      model: suggestion.model,
      createdAt: suggestion.createdAt,
      updatedAt: suggestion.updatedAt,
    };
  }

  private toGenerationView(
    generation: CategorizationRuleSuggestionGenerationEntity,
  ): CategorizationRuleSuggestionGeneration {
    return {
      id: generation.id,
      userId: generation.userId,
      status: generation.status,
      model: generation.model,
      ignoredCategoryIds: generation.ignoredCategoryIds ?? [],
      startedAt: generation.startedAt,
      completedAt: generation.completedAt,
      failedAt: generation.failedAt,
      errorMessage: generation.errorMessage,
      createdAt: generation.createdAt,
      updatedAt: generation.updatedAt,
    };
  }
}
