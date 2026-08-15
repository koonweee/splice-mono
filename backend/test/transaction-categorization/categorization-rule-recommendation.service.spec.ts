import { ServiceUnavailableException } from '@nestjs/common';
import { CategoryEntity } from '../../src/category/category.entity';
import { CategorizationRuleRecommendationService } from '../../src/transaction-categorization/recommendations/categorization-rule-recommendation.service';
import { CategorizationRuleSuggestionGenerationEntity } from '../../src/transaction-categorization/recommendations/categorization-rule-recommendation-generation.entity';
import { CategorizationRuleSuggestionEntity } from '../../src/transaction-categorization/recommendations/categorization-rule-recommendation.entity';
import { RuleBasedCategorizationEngine } from '../../src/transaction-categorization/rule-based-categorization.engine';

const userId = '11111111-1111-4111-8111-111111111111';
const categoryId = '33333333-3333-4333-8333-333333333333';
const generationId = '44444444-4444-4444-8444-444444444444';
const suggestionId = '55555555-5555-4555-8555-555555555555';

function buildCategory(): CategoryEntity {
  return {
    id: categoryId,
    userId,
    primary: 'Food',
    detailed: 'Coffee',
    color: '#228be6',
    archivedAt: null,
  } as CategoryEntity;
}

function buildSuggestion(
  overrides: Partial<CategorizationRuleSuggestionEntity> = {},
): CategorizationRuleSuggestionEntity {
  return {
    id: suggestionId,
    userId,
    generationId,
    name: 'Coffee shops',
    targetCategoryId: categoryId,
    priority: 10,
    conditions: [
      { field: 'merchantName', operator: 'contains', value: 'starbucks' },
    ],
    rationale: 'Manual Starbucks examples use Coffee.',
    status: 'pending',
    acceptedRuleId: null,
    matched: 3,
    updated: 2,
    skippedManual: 1,
    manualAgreement: 1,
    manualConflicts: 0,
    existingRuleOverlap: 0,
    previewTransactions: [],
    generatedBy: 'mastra',
    model: 'gpt-5.4-mini',
    createdAt: new Date('2026-02-14T00:00:00.000Z'),
    updatedAt: new Date('2026-02-14T00:00:00.000Z'),
    ...overrides,
  } as CategorizationRuleSuggestionEntity;
}

function buildGeneration(
  overrides: Partial<CategorizationRuleSuggestionGenerationEntity> = {},
): CategorizationRuleSuggestionGenerationEntity {
  return {
    id: generationId,
    userId,
    status: 'pending',
    model: 'gpt-5.4-mini',
    ignoredCategoryIds: [],
    startedAt: null,
    completedAt: null,
    failedAt: null,
    errorMessage: null,
    createdAt: new Date('2026-02-14T00:00:00.000Z'),
    updatedAt: new Date('2026-02-14T00:00:00.000Z'),
    ...overrides,
  } as CategorizationRuleSuggestionGenerationEntity;
}

function deterministicPatternCandidate(input: {
  value: string;
  targetCategoryId: string;
  targetCategory?: { primary: string; detailed: string };
  agreement: number;
}) {
  const targetCategory = input.targetCategory ?? {
    primary: 'Food',
    detailed: 'Coffee',
  };

  return {
    field: 'merchantName',
    operator: 'equals',
    value: input.value,
    targetCategoryId: input.targetCategoryId,
    targetCategory: {
      id: input.targetCategoryId,
      primary: targetCategory.primary,
      detailed: targetCategory.detailed,
    },
    conditions: [
      {
        field: 'merchantName',
        operator: 'equals',
        value: input.value.toLowerCase(),
      },
    ],
    agreement: input.agreement,
    conflicts: 0,
    conflictRate: 0,
    totalManualMatches: input.agreement,
    historicalCategoryHint: false,
    preview: {
      matched: input.agreement,
      updated: 0,
      skippedManual: input.agreement,
      manualAgreement: input.agreement,
      manualConflicts: 0,
      existingRuleOverlap: 0,
    },
  };
}

describe('CategorizationRuleRecommendationService', () => {
  let previousOpenAiApiKey: string | undefined;
  let service: CategorizationRuleRecommendationService;
  let suggestionRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
    manager: { transaction: jest.Mock };
  };
  let generationRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    manager: {
      transaction: jest.Mock;
    };
  };
  let ruleRepository: {
    createQueryBuilder: jest.Mock;
  };
  let categoryRepository: {
    count: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let transactionRepository: { find: jest.Mock };
  let categorizationService: {
    findAll: jest.Mock;
    create: jest.Mock;
    previewDraftRuleApplication: jest.Mock;
  };

  beforeEach(() => {
    previousOpenAiApiKey = process.env.OPENAI_API_KEY;
    suggestionRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((dto: Partial<CategorizationRuleSuggestionEntity>) =>
        buildSuggestion(dto),
      ),
      save: jest.fn(async (entity: unknown) => entity),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
      manager: {
        transaction: jest.fn(),
      },
    };
    suggestionRepository.manager.transaction.mockImplementation(
      async (callback: (manager: unknown) => unknown) =>
        callback({ getRepository: () => suggestionRepository }),
    );
    generationRepository = {
      findOne: jest.fn(),
      create: jest.fn(
        (dto: Partial<CategorizationRuleSuggestionGenerationEntity>) =>
          buildGeneration(dto),
      ),
      save: jest.fn(async (entity: unknown) => entity),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: {
        transaction: jest.fn(async (callback: (manager: unknown) => unknown) =>
          callback({
            getRepository: jest.fn(() => ({
              createQueryBuilder: jest.fn(() => ({
                where: jest.fn().mockReturnThis(),
                orderBy: jest.fn().mockReturnThis(),
                setLock: jest.fn().mockReturnThis(),
                setOnLocked: jest.fn().mockReturnThis(),
                getOne: jest.fn().mockResolvedValue(null),
              })),
              save: jest.fn(async (entity: unknown) => entity),
            })),
          }),
        ),
      },
    };
    ruleRepository = {
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: 0 }),
      })),
    };
    categoryRepository = {
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([buildCategory()]),
      findOne: jest.fn().mockResolvedValue(buildCategory()),
    };
    transactionRepository = { find: jest.fn().mockResolvedValue([]) };
    categorizationService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest
        .fn()
        .mockResolvedValue({ id: '66666666-6666-4666-8666-666666666666' }),
      previewDraftRuleApplication: jest.fn().mockResolvedValue({
        matched: 3,
        updated: 3,
        skippedManual: 3,
        manualAgreement: 3,
        manualConflicts: 0,
        existingRuleOverlap: 0,
        transactions: [],
      }),
    };

    service = new CategorizationRuleRecommendationService(
      suggestionRepository as never,
      generationRepository as never,
      ruleRepository as never,
      categoryRepository as never,
      transactionRepository as never,
      categorizationService as never,
      new RuleBasedCategorizationEngine(),
    );
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = previousOpenAiApiKey;
    jest.clearAllMocks();
  });

  it('fails generate gracefully when OPENAI_API_KEY is missing', async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(service.generate(userId)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(generationRepository.save).not.toHaveBeenCalled();
  });

  it('supersedes pending suggestions before regeneration', async () => {
    process.env.OPENAI_API_KEY = 'test-key';

    await service.regenerate(userId);

    expect(suggestionRepository.update).toHaveBeenCalledWith(
      { userId, status: 'pending' },
      { status: 'superseded' },
    );
    expect(generationRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId, status: 'pending' }),
    );
  });

  it('expires only a bounded batch of pending suggestions older than thirty days', async () => {
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockResolvedValue([
          buildSuggestion({ id: suggestionId }),
          buildSuggestion({ id: '66666666-6666-4666-8666-666666666667' }),
        ]),
    };
    suggestionRepository.createQueryBuilder.mockReturnValueOnce(queryBuilder);
    suggestionRepository.update.mockResolvedValueOnce({ affected: 2 });

    await expect(
      service.expireOldPendingSuggestions(new Date('2026-03-16T00:00:00.000Z')),
    ).resolves.toBe(2);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'suggestion.createdAt < :cutoff',
      { cutoff: new Date('2026-02-14T00:00:00.000Z') },
    );
    expect(queryBuilder.take).toHaveBeenCalledWith(500);
    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(queryBuilder.setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(suggestionRepository.update).toHaveBeenCalledWith(
      {
        id: expect.objectContaining({ _type: 'in' }),
        status: 'pending',
      },
      { status: 'expired' },
    );
  });

  it('returns pending suggestions instead of starting a duplicate generation', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const suggestion = buildSuggestion();
    const generation = buildGeneration({ status: 'completed' });
    generationRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(generation);
    suggestionRepository.findOne.mockResolvedValueOnce(suggestion);
    suggestionRepository.find.mockResolvedValueOnce([suggestion]);

    const result = await service.generate(userId);

    expect(result.generation.id).toBe(generation.id);
    expect(result.suggestions).toHaveLength(1);
    expect(generationRepository.save).not.toHaveBeenCalled();
  });

  it('recovers stale processing generations before atomically acquiring pending work', async () => {
    const generation = buildGeneration({ status: 'pending' });
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      setOnLocked: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(generation),
    };
    const scopedRepository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      save: jest.fn(async (entity: unknown) => entity),
    };
    generationRepository.manager.transaction.mockImplementationOnce(
      async (callback: (manager: unknown) => unknown) =>
        callback({
          getRepository: jest.fn(() => scopedRepository),
        }),
    );

    const result = await service.acquirePendingGeneration();

    expect(generationRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing' }),
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'Recommendation generation timed out',
      }),
    );
    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(queryBuilder.setOnLocked).toHaveBeenCalledWith('skip_locked');
    expect(scopedRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processing' }),
    );
    expect(result?.status).toBe('processing');
  });

  it('accepts a pending suggestion by creating a normal rule', async () => {
    const suggestion = buildSuggestion();
    suggestionRepository.findOne.mockResolvedValueOnce(suggestion);

    const result = await service.accept(suggestion.id, userId);

    expect(categorizationService.create).toHaveBeenCalledWith(userId, {
      name: suggestion.name,
      priority: suggestion.priority,
      targetCategoryId: suggestion.targetCategoryId,
      conditions: suggestion.conditions,
    });
    expect(suggestionRepository.findOne).toHaveBeenCalledWith({
      where: { id: suggestion.id, userId, status: 'pending' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(suggestionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'accepted',
        acceptedRuleId: '66666666-6666-4666-8666-666666666666',
      }),
    );
    expect(result.status).toBe('accepted');
  });

  it('filters broad candidates and persists backend-scored suggestions', async () => {
    const generation = buildGeneration({ status: 'processing' });

    const result = await service.completeGeneration(generation, [
      {
        name: 'Broad processor',
        targetCategoryId: categoryId,
        conditions: [
          {
            field: 'providerTransactionName',
            operator: 'contains',
            value: 'SQ',
          },
        ],
        rationale: 'Too broad.',
      },
      {
        name: 'Starbucks coffee',
        targetCategoryId: categoryId,
        conditions: [
          { field: 'merchantName', operator: 'contains', value: 'Starbucks' },
        ],
        rationale: 'Manual examples consistently use Coffee.',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(suggestionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Starbucks coffee',
        status: 'pending',
        matched: 3,
        updated: 3,
        manualAgreement: 3,
        manualConflicts: 0,
      }),
    );
    expect(generationRepository.update).toHaveBeenCalledWith(
      { id: generation.id, status: 'processing' },
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('persists learned rules with enough manual evidence even when no existing transactions update', async () => {
    const generation = buildGeneration({ status: 'processing' });
    categorizationService.previewDraftRuleApplication.mockResolvedValueOnce({
      matched: 5,
      updated: 0,
      skippedManual: 5,
      manualAgreement: 5,
      manualConflicts: 0,
      existingRuleOverlap: 0,
      transactions: [],
    });

    const result = await service.completeGeneration(generation, [
      {
        name: 'Starbucks coffee',
        targetCategoryId: categoryId,
        conditions: [
          { field: 'merchantName', operator: 'contains', value: 'Starbucks' },
        ],
        rationale: 'Manual examples consistently use Coffee.',
      },
    ]);

    expect(result).toHaveLength(1);
    expect(suggestionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Starbucks coffee',
        updated: 0,
        manualAgreement: 5,
      }),
    );
  });

  it('rejects learned rules without enough manual evidence', async () => {
    const generation = buildGeneration({ status: 'processing' });
    categorizationService.previewDraftRuleApplication.mockResolvedValueOnce({
      matched: 2,
      updated: 8,
      skippedManual: 2,
      manualAgreement: 2,
      manualConflicts: 0,
      existingRuleOverlap: 0,
      transactions: [],
    });

    const result = await service.completeGeneration(generation, [
      {
        name: 'Weak evidence',
        targetCategoryId: categoryId,
        conditions: [
          { field: 'merchantName', operator: 'contains', value: 'Cafe' },
        ],
        rationale: 'Only two manual examples use Coffee.',
      },
    ]);

    expect(result).toEqual([]);
    expect(suggestionRepository.save).not.toHaveBeenCalled();
  });

  it('lists ranked rule candidate patterns from manual labels', async () => {
    transactionRepository.find.mockResolvedValueOnce([
      {
        categoryId,
        merchantName: 'Bilt',
        website: 'bilt.com',
        merchantEntityId: null,
        providerCategoryDetailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
        providerCategoryPrimary: 'TRANSFER_OUT',
        createdAt: new Date('2026-02-14T00:00:00.000Z'),
      },
      {
        categoryId,
        merchantName: 'Bilt',
        website: 'bilt.com',
        merchantEntityId: null,
        providerCategoryDetailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
        providerCategoryPrimary: 'TRANSFER_OUT',
        createdAt: new Date('2026-02-13T00:00:00.000Z'),
      },
      {
        categoryId,
        merchantName: 'Bilt',
        website: 'bilt.com',
        merchantEntityId: null,
        providerCategoryDetailed: 'TRANSFER_OUT_ACCOUNT_TRANSFER',
        providerCategoryPrimary: 'TRANSFER_OUT',
        createdAt: new Date('2026-02-12T00:00:00.000Z'),
      },
    ]);
    categorizationService.previewDraftRuleApplication.mockResolvedValue({
      matched: 3,
      updated: 0,
      skippedManual: 3,
      manualAgreement: 3,
      manualConflicts: 0,
      existingRuleOverlap: 0,
      transactions: [],
    });

    const result = (await service.listRuleCandidatePatternsForAgent(userId, {
      fields: ['merchantName'],
      minAgreement: 3,
      limit: 10,
    })) as { candidates: Array<{ value: string; agreement: number }> };

    expect(result.candidates).toEqual([
      expect.objectContaining({
        field: 'merchantName',
        operator: 'equals',
        value: 'Bilt',
        agreement: 3,
        conflicts: 0,
        targetCategoryId: categoryId,
      }),
    ]);
    expect(
      categorizationService.previewDraftRuleApplication,
    ).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        targetCategoryId: categoryId,
        conditions: [
          { field: 'merchantName', operator: 'equals', value: 'bilt' },
        ],
      }),
      { ignoredManualCategoryIds: [] },
    );
  });

  it('excludes ignored categories from mined manual label candidates', async () => {
    const ignoredCategoryId = '77777777-7777-4777-8777-777777777777';
    categoryRepository.find.mockResolvedValue([
      buildCategory(),
      {
        ...buildCategory(),
        id: ignoredCategoryId,
        primary: 'Others',
        detailed: 'Pre 2026',
      },
    ]);
    transactionRepository.find.mockResolvedValue([
      {
        categoryId: ignoredCategoryId,
        merchantName: 'Amazon',
      },
      {
        categoryId: ignoredCategoryId,
        merchantName: 'Amazon',
      },
      {
        categoryId: ignoredCategoryId,
        merchantName: 'Amazon',
      },
      {
        categoryId,
        merchantName: 'Bilt',
      },
      {
        categoryId,
        merchantName: 'Bilt',
      },
      {
        categoryId,
        merchantName: 'Bilt',
      },
    ]);

    const result = (await service.listRuleCandidatePatternsForAgent(
      userId,
      {
        fields: ['merchantName'],
        minAgreement: 3,
        limit: 10,
      },
      { ignoredCategoryIds: [ignoredCategoryId] },
    )) as { candidates: Array<{ value: string }> };

    expect(result.candidates.map((candidate) => candidate.value)).toEqual([
      'Bilt',
    ]);
  });

  it('promotes a diverse deterministic candidate set before LLM selection', async () => {
    const transferCategoryId = '77777777-7777-4777-8777-777777777777';
    const transportCategoryId = '88888888-8888-4888-8888-888888888888';
    jest.spyOn(service, 'listRuleCandidatePatternsForAgent').mockResolvedValue({
      candidates: [
        deterministicPatternCandidate({
          value: 'Food broad',
          targetCategoryId: categoryId,
          agreement: 40,
        }),
        deterministicPatternCandidate({
          value: 'Coffee broad',
          targetCategoryId: categoryId,
          agreement: 30,
        }),
        deterministicPatternCandidate({
          value: 'Restaurant broad',
          targetCategoryId: categoryId,
          agreement: 20,
        }),
        deterministicPatternCandidate({
          value: 'Lyft',
          targetCategoryId: transportCategoryId,
          targetCategory: { primary: 'Transport', detailed: 'Ride-hailing' },
          agreement: 13,
        }),
        deterministicPatternCandidate({
          value: 'Bilt',
          targetCategoryId: transferCategoryId,
          targetCategory: { primary: 'Transfer', detailed: 'Transfer' },
          agreement: 8,
        }),
      ],
    });

    const result = await service.listDeterministicCandidatesForGeneration(
      userId,
      { ignoredCategoryIds: ['99999999-9999-4999-8999-999999999999'] },
    );

    expect(result.map((candidate) => candidate.name)).toEqual([
      'Food broad Coffee',
      'Coffee broad Coffee',
      'Lyft Ride-hailing',
      'Bilt Transfer',
    ]);
    expect(service.listRuleCandidatePatternsForAgent).toHaveBeenCalledWith(
      userId,
      {
        minAgreement: 3,
        maxConflictRate: 0.05,
        limit: 50,
      },
      { ignoredCategoryIds: ['99999999-9999-4999-8999-999999999999'] },
    );
  });

  it('does not persist candidates when completion loses a regenerate race', async () => {
    const generation = buildGeneration({ status: 'processing' });
    generationRepository.update.mockResolvedValueOnce({ affected: 0 });

    const result = await service.completeGeneration(generation, [
      {
        name: 'Starbucks coffee',
        targetCategoryId: categoryId,
        conditions: [
          { field: 'merchantName', operator: 'contains', value: 'Starbucks' },
        ],
        rationale: 'Manual examples consistently use Coffee.',
      },
    ]);

    expect(result).toEqual([]);
    expect(
      categorizationService.previewDraftRuleApplication,
    ).not.toHaveBeenCalled();
    expect(suggestionRepository.save).not.toHaveBeenCalled();
  });
});
