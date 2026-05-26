import { Logger } from '@nestjs/common';
import { CategorizationRuleSuggestionGenerationEntity } from '../../src/transaction-categorization/recommendations/categorization-rule-recommendation-generation.entity';
import type { CategorizationRuleRecommendationProcessor } from '../../src/transaction-categorization/recommendations/categorization-rule-recommendation.processor';

jest.mock(
  '../../src/transaction-categorization/recommendations/categorization-rule-recommendation.agent',
  () => ({ CategorizationRuleRecommendationAgent: jest.fn() }),
);

const userId = '11111111-1111-4111-8111-111111111111';
const generationId = '44444444-4444-4444-8444-444444444444';
const categoryId = '33333333-3333-4333-8333-333333333333';
const ignoredCategoryId = '66666666-6666-4666-8666-666666666666';

function buildGeneration(): CategorizationRuleSuggestionGenerationEntity {
  return {
    id: generationId,
    userId,
    status: 'processing',
    model: 'gpt-5.4-mini',
    ignoredCategoryIds: [ignoredCategoryId],
    startedAt: new Date('2026-02-14T00:00:00.000Z'),
    completedAt: null,
    failedAt: null,
    errorMessage: null,
    createdAt: new Date('2026-02-14T00:00:00.000Z'),
    updatedAt: new Date('2026-02-14T00:00:00.000Z'),
  } as CategorizationRuleSuggestionGenerationEntity;
}

describe('CategorizationRuleRecommendationProcessor', () => {
  let ProcessorClass: typeof CategorizationRuleRecommendationProcessor;
  let service: {
    acquirePendingGeneration: jest.Mock;
    getMaxToolSteps: jest.Mock;
    listExistingRulesForAgent: jest.Mock;
    searchManualExamples: jest.Mock;
    listRuleCandidatePatternsForAgent: jest.Mock;
    listDeterministicCandidatesForGeneration: jest.Mock;
    previewDraftForAgent: jest.Mock;
    completeGeneration: jest.Mock;
    failGeneration: jest.Mock;
  };
  let agent: {
    generateCandidates: jest.Mock;
  };
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;
  let processor: CategorizationRuleRecommendationProcessor;

  beforeAll(() => {
    ProcessorClass = jest.requireActual<
      typeof import('../../src/transaction-categorization/recommendations/categorization-rule-recommendation.processor')
    >(
      '../../src/transaction-categorization/recommendations/categorization-rule-recommendation.processor',
    ).CategorizationRuleRecommendationProcessor;
  });

  beforeEach(() => {
    service = {
      acquirePendingGeneration: jest.fn(),
      getMaxToolSteps: jest.fn().mockReturnValue(7),
      listExistingRulesForAgent: jest.fn().mockResolvedValue([]),
      searchManualExamples: jest.fn().mockResolvedValue([]),
      listRuleCandidatePatternsForAgent: jest.fn().mockResolvedValue([]),
      listDeterministicCandidatesForGeneration: jest.fn().mockResolvedValue([
        {
          name: 'Bilt transfer',
          targetCategoryId: categoryId,
          conditions: [
            {
              field: 'merchantName',
              operator: 'equals',
              value: 'bilt',
            },
          ],
          rationale: 'Deterministic transfer candidate.',
        },
      ]),
      previewDraftForAgent: jest.fn().mockResolvedValue({
        matched: 3,
        updated: 3,
        skippedManual: 0,
        manualAgreement: 3,
        manualConflicts: 0,
        existingRuleOverlap: 0,
        transactions: [],
      }),
      completeGeneration: jest.fn().mockResolvedValue([{ id: 'suggestion-1' }]),
      failGeneration: jest.fn().mockResolvedValue(undefined),
    };
    agent = {
      generateCandidates: jest.fn().mockResolvedValue([
        {
          name: 'Starbucks coffee',
          targetCategoryId: categoryId,
          conditions: [
            {
              field: 'merchantName',
              operator: 'contains',
              value: 'Starbucks',
            },
          ],
          rationale: 'Manual examples consistently use Coffee.',
        },
      ]),
    };
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    processor = new ProcessorClass(service as never, agent as never);
  });

  afterEach(() => {
    logSpy?.mockRestore();
    errorSpy?.mockRestore();
    jest.clearAllMocks();
  });

  it('runs pending generations through the agent and persists candidates', async () => {
    const generation = buildGeneration();
    service.acquirePendingGeneration
      .mockResolvedValueOnce(generation)
      .mockResolvedValueOnce(null);

    await processor.processPending();

    expect(agent.generateCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        model: 'gpt-5.4-mini',
        maxSteps: 7,
        handlers: expect.any(Object),
      }),
    );
    expect(service.completeGeneration).toHaveBeenCalledWith(
      generation,
      expect.arrayContaining([
        expect.objectContaining({ name: 'Bilt transfer' }),
        expect.objectContaining({ name: 'Starbucks coffee' }),
      ]),
    );
    expect(
      service.listDeterministicCandidatesForGeneration,
    ).toHaveBeenCalledWith(userId, {
      ignoredCategoryIds: [ignoredCategoryId],
    });
    const handlers = agent.generateCandidates.mock.calls[0][0].handlers;
    await handlers.listRuleCandidatePatterns({ minAgreement: 3 });
    expect(service.listRuleCandidatePatternsForAgent).toHaveBeenCalledWith(
      userId,
      { minAgreement: 3 },
      { ignoredCategoryIds: [ignoredCategoryId] },
    );
    expect(service.failGeneration).not.toHaveBeenCalled();
  });

  it('marks a generation failed when the agent throws', async () => {
    const generation = buildGeneration();
    const error = new Error('model unavailable');
    service.acquirePendingGeneration
      .mockResolvedValueOnce(generation)
      .mockResolvedValueOnce(null);
    agent.generateCandidates.mockRejectedValueOnce(error);

    await processor.processPending();

    expect(service.failGeneration).toHaveBeenCalledWith(generation, error);
    expect(service.completeGeneration).not.toHaveBeenCalled();
  });

  it('logs acquisition failures and allows the next run to proceed', async () => {
    service.acquirePendingGeneration
      .mockRejectedValueOnce(new Error('relation missing'))
      .mockResolvedValueOnce(null);

    await processor.processPending();
    await processor.processPending();

    expect(errorSpy).toHaveBeenCalledWith(
      { error: 'relation missing' },
      'Categorization rule recommendation processor run failed',
    );
    expect(service.acquirePendingGeneration).toHaveBeenCalledTimes(2);
  });
});
