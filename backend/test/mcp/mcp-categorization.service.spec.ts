import { McpCategorizationService } from '../../src/mcp/mcp-categorization.service';
import { RuleBasedCategorizationEngine } from '../../src/transaction-categorization/rule-based-categorization.engine';
import type { CategorizationRuleCondition } from '../../src/types/CategorizationRule';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';
const categoryId = '33333333-3333-4333-8333-333333333333';
const otherCategoryId = '44444444-4444-4444-8444-444444444444';
const ruleId = '55555555-5555-4555-8555-555555555555';

const conditions: CategorizationRuleCondition[] = [
  { field: 'merchantName', operator: 'contains', value: ' UBER ' },
];

describe('McpCategorizationService', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const transactionCategorizationService = {
    previewDraftRuleApplication: jest.fn(),
    create: jest.fn(),
    previewRuleApplication: jest.fn(),
    applyRuleToExisting: jest.fn(),
  };
  const recommendationService = {
    searchManualExamples: jest.fn(),
    listRuleCandidatePatternsForAgent: jest.fn(),
  };
  let service: McpCategorizationService;

  beforeEach(() => {
    process.env.JWT_SECRET = 'mcp-categorization-test-secret';
    service = new McpCategorizationService(
      transactionCategorizationService as never,
      recommendationService as never,
      new RuleBasedCategorizationEngine(),
    );
  });

  afterEach(() => {
    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('passes evidence lookups through to the recommendation service', async () => {
    recommendationService.searchManualExamples.mockResolvedValue({
      transactions: [],
    });
    recommendationService.listRuleCandidatePatternsForAgent.mockResolvedValue({
      filters: {
        fields: ['merchantName'],
        minAgreement: 2,
        maxConflictRate: 0,
        limit: 10,
      },
      candidates: [],
    });

    await service.listManualCategorizedTransactionExamples(userId, {
      categoryId,
      query: 'uber',
      limit: 25,
      ignoredCategoryIds: [otherCategoryId],
    });
    await service.listRuleCandidatePatterns(userId, {
      fields: ['merchantName'],
      minAgreement: 2,
      maxConflictRate: 0,
      limit: 10,
      ignoredCategoryIds: [otherCategoryId],
    });

    expect(recommendationService.searchManualExamples).toHaveBeenCalledWith(
      userId,
      { categoryId, query: 'uber', limit: 25 },
      { ignoredCategoryIds: [otherCategoryId] },
    );
    expect(
      recommendationService.listRuleCandidatePatternsForAgent,
    ).toHaveBeenCalledWith(
      userId,
      {
        fields: ['merchantName'],
        minAgreement: 2,
        maxConflictRate: 0,
        limit: 10,
      },
      { ignoredCategoryIds: [otherCategoryId] },
    );
  });

  it('creates a rule only from the exact previewed normalized draft', async () => {
    transactionCategorizationService.previewDraftRuleApplication.mockResolvedValue(
      {
        matched: 2,
        updated: 1,
        skippedManual: 1,
        manualAgreement: 1,
        manualConflicts: 0,
        existingRuleOverlap: 0,
        transactions: [],
      },
    );
    transactionCategorizationService.create.mockResolvedValue({
      id: ruleId,
      name: 'Uber rides',
      priority: 10,
      targetCategoryId: categoryId,
      conditions: [
        { field: 'merchantName', operator: 'contains', value: 'uber' },
      ],
      targetCategory: {
        id: categoryId,
        primary: 'Transport',
        detailed: 'Rideshare',
        color: '#228be6',
        archivedAt: null,
      },
      archivedAt: null,
      createdAt: new Date('2026-02-14T00:00:00.000Z'),
      updatedAt: new Date('2026-02-14T00:00:00.000Z'),
    });

    const preview = await service.previewDraft(userId, {
      targetCategoryId: categoryId,
      conditions,
      ignoredManualCategoryIds: [otherCategoryId],
    });
    const created = await service.createRule(userId, {
      name: 'Uber rides',
      targetCategoryId: categoryId,
      conditions: [
        { field: 'merchantName', operator: 'contains', value: 'UBER' },
      ],
      previewToken: preview.previewToken,
    });

    expect(preview.normalizedDraft.conditions).toEqual([
      { field: 'merchantName', operator: 'contains', value: 'uber' },
    ]);
    expect(
      transactionCategorizationService.previewDraftRuleApplication,
    ).toHaveBeenCalledWith(
      userId,
      {
        targetCategoryId: categoryId,
        priority: undefined,
        conditions: [
          { field: 'merchantName', operator: 'contains', value: 'uber' },
        ],
      },
      { ignoredManualCategoryIds: [otherCategoryId] },
    );
    expect(transactionCategorizationService.create).toHaveBeenCalledWith(
      userId,
      {
        name: 'Uber rides',
        priority: undefined,
        targetCategoryId: categoryId,
        conditions: [
          { field: 'merchantName', operator: 'contains', value: 'uber' },
        ],
      },
    );
    expect(created.rule).toMatchObject({ id: ruleId });
  });

  it('accepts reordered normalized conditions and an omitted priority', async () => {
    const draftConditions: CategorizationRuleCondition[] = [
      {
        field: 'providerCategoryDetailed',
        operator: 'equals',
        value: ' FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR ',
      },
      { field: 'amountSign', operator: 'equals', value: 'negative' },
    ];
    transactionCategorizationService.previewDraftRuleApplication.mockResolvedValue(
      {
        matched: 4,
        updated: 4,
        skippedManual: 0,
        manualAgreement: 4,
        manualConflicts: 0,
        existingRuleOverlap: 0,
        transactions: [],
      },
    );
    transactionCategorizationService.create.mockResolvedValue({ id: ruleId });

    const preview = await service.previewDraft(userId, {
      targetCategoryId: categoryId,
      conditions: draftConditions,
    });
    await service.createRule(userId, {
      name: 'Eating out',
      targetCategoryId: categoryId,
      priority: undefined,
      conditions: [
        { field: 'amountSign', operator: 'equals', value: 'negative' },
        {
          field: 'providerCategoryDetailed',
          operator: 'equals',
          value: 'food_and_drink_beer_wine_and_liquor',
        },
      ],
      previewToken: preview.previewToken,
    });

    expect(transactionCategorizationService.create).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        priority: undefined,
        conditions: [
          { field: 'amountSign', operator: 'equals', value: 'negative' },
          {
            field: 'providerCategoryDetailed',
            operator: 'equals',
            value: 'food_and_drink_beer_wine_and_liquor',
          },
        ],
      }),
    );
  });

  it('accepts the same explicit priority used for the preview', async () => {
    transactionCategorizationService.previewDraftRuleApplication.mockResolvedValue(
      {
        matched: 1,
        updated: 1,
        skippedManual: 0,
        manualAgreement: 1,
        manualConflicts: 0,
        existingRuleOverlap: 0,
        transactions: [],
      },
    );
    transactionCategorizationService.create.mockResolvedValue({ id: ruleId });

    const preview = await service.previewDraft(userId, {
      targetCategoryId: categoryId,
      priority: 10,
      conditions,
    });
    await service.createRule(userId, {
      name: 'Explicit priority',
      targetCategoryId: categoryId,
      priority: 10,
      conditions,
      previewToken: preview.previewToken,
    });

    expect(transactionCategorizationService.create).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ priority: 10 }),
    );
  });

  it('rejects draft preview tokens for a different user, draft, or expiry', async () => {
    jest.useFakeTimers({
      now: new Date('2026-02-14T00:00:00.000Z'),
    });
    transactionCategorizationService.previewDraftRuleApplication.mockResolvedValue(
      {
        matched: 1,
        updated: 1,
        skippedManual: 0,
        manualAgreement: 0,
        manualConflicts: 0,
        existingRuleOverlap: 0,
        transactions: [],
      },
    );

    const preview = await service.previewDraft(userId, {
      targetCategoryId: categoryId,
      conditions,
    });

    await expect(
      service.createRule(userId, {
        name: 'Missing token',
        targetCategoryId: categoryId,
        conditions,
        previewToken: '',
      }),
    ).rejects.toThrow('Preview token is invalid or expired');
    await expect(
      service.createRule(userId, {
        name: 'Malformed token',
        targetCategoryId: categoryId,
        conditions,
        previewToken: 'not-a-preview-token',
      }),
    ).rejects.toThrow('Preview token is invalid or expired');
    await expect(
      service.createRule(otherUserId, {
        name: 'Wrong user',
        targetCategoryId: categoryId,
        conditions,
        previewToken: preview.previewToken,
      }),
    ).rejects.toThrow('Preview token is invalid or expired');
    await expect(
      service.createRule(userId, {
        name: 'Different category',
        targetCategoryId: otherCategoryId,
        conditions,
        previewToken: preview.previewToken,
      }),
    ).rejects.toThrow(
      'Preview token does not match the categorization rule draft',
    );
    await expect(
      service.createRule(userId, {
        name: 'Modified condition',
        targetCategoryId: categoryId,
        conditions: [
          { field: 'merchantName', operator: 'contains', value: 'lyft' },
        ],
        previewToken: preview.previewToken,
      }),
    ).rejects.toThrow(
      'Preview token does not match the categorization rule draft',
    );
    await expect(
      service.createRule(userId, {
        name: 'Changed priority',
        targetCategoryId: categoryId,
        priority: 10,
        conditions,
        previewToken: preview.previewToken,
      }),
    ).rejects.toThrow(
      'Preview token does not match the categorization rule draft',
    );

    jest.advanceTimersByTime(10 * 60 * 1000 + 1);

    await expect(
      service.createRule(userId, {
        name: 'Expired',
        targetCategoryId: categoryId,
        conditions,
        previewToken: preview.previewToken,
      }),
    ).rejects.toThrow('Preview token is invalid or expired');
    expect(transactionCategorizationService.create).not.toHaveBeenCalled();
  });

  it('applies a saved rule only with a matching application preview token', async () => {
    transactionCategorizationService.previewRuleApplication.mockResolvedValue({
      matched: 3,
      updated: 2,
      skippedManual: 1,
      transactions: [],
    });
    transactionCategorizationService.applyRuleToExisting.mockResolvedValue({
      matched: 3,
      updated: 2,
      skippedManual: 1,
    });

    const preview = await service.previewRuleApplication(userId, ruleId);
    await expect(
      service.applyRule(userId, {
        ruleId,
        previewToken: '',
      }),
    ).rejects.toThrow('Preview token is invalid or expired');

    const applied = await service.applyRule(userId, {
      ruleId,
      previewToken: preview.previewToken,
    });

    expect(
      transactionCategorizationService.previewRuleApplication,
    ).toHaveBeenCalledWith(ruleId, userId);
    expect(
      transactionCategorizationService.applyRuleToExisting,
    ).toHaveBeenCalledWith(ruleId, userId);
    expect(applied).toEqual({
      matched: 3,
      updated: 2,
      skippedManual: 1,
    });

    await expect(
      service.applyRule(userId, {
        ruleId: otherCategoryId,
        previewToken: preview.previewToken,
      }),
    ).rejects.toThrow('Preview token does not match the categorization rule');
  });

  it('rejects expired application preview tokens before applying a saved rule', async () => {
    jest.useFakeTimers({
      now: new Date('2026-02-14T00:00:00.000Z'),
    });
    transactionCategorizationService.previewRuleApplication.mockResolvedValue({
      matched: 1,
      updated: 1,
      skippedManual: 0,
      transactions: [],
    });

    const preview = await service.previewRuleApplication(userId, ruleId);

    jest.advanceTimersByTime(10 * 60 * 1000 + 1);

    await expect(
      service.applyRule(userId, {
        ruleId,
        previewToken: preview.previewToken,
      }),
    ).rejects.toThrow('Preview token is invalid or expired');
    expect(
      transactionCategorizationService.applyRuleToExisting,
    ).not.toHaveBeenCalled();
  });

  it('turns missing saved rules into MCP-facing not found errors', async () => {
    transactionCategorizationService.previewRuleApplication.mockResolvedValue(
      null,
    );
    transactionCategorizationService.applyRuleToExisting.mockResolvedValue(
      null,
    );

    await expect(
      service.previewRuleApplication(userId, ruleId),
    ).rejects.toThrow(`Categorization rule ${ruleId} not found`);

    const previewService = new McpCategorizationService(
      {
        ...transactionCategorizationService,
        previewRuleApplication: jest.fn().mockResolvedValue({
          matched: 0,
          updated: 0,
          skippedManual: 0,
          transactions: [],
        }),
      } as never,
      recommendationService as never,
      new RuleBasedCategorizationEngine(),
    );
    const preview = await previewService.previewRuleApplication(userId, ruleId);

    await expect(
      service.applyRule(userId, {
        ruleId,
        previewToken: preview.previewToken,
      }),
    ).rejects.toThrow(`Categorization rule ${ruleId} not found`);
  });
});
