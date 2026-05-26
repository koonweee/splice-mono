import type { JwtUser } from '../../src/auth/decorators/current-user.decorator';
import type { CategorizationRuleRecommendationController } from '../../src/transaction-categorization/recommendations/categorization-rule-recommendation.controller';

jest.mock(
  '../../src/transaction-categorization/recommendations/categorization-rule-recommendation.agent',
  () => ({ CategorizationRuleRecommendationAgent: jest.fn() }),
);

const userId = '11111111-1111-4111-8111-111111111111';
const suggestionId = '55555555-5555-4555-8555-555555555555';

function buildGenerationResponse() {
  return {
    generation: {
      id: '44444444-4444-4444-8444-444444444444',
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
    },
    suggestions: [],
  };
}

function buildSuggestion() {
  return {
    id: suggestionId,
    userId,
    generationId: '44444444-4444-4444-8444-444444444444',
    name: 'Coffee shops',
    targetCategoryId: '33333333-3333-4333-8333-333333333333',
    targetCategory: {
      id: '33333333-3333-4333-8333-333333333333',
      primary: 'Food',
      detailed: 'Coffee',
      color: '#228be6',
      archivedAt: null,
    },
    priority: 10,
    conditions: [
      { field: 'merchantName', operator: 'contains', value: 'starbucks' },
    ],
    rationale: 'Manual Starbucks examples use Coffee.',
    status: 'pending',
    acceptedRuleId: null,
    matched: 3,
    updated: 3,
    skippedManual: 0,
    manualAgreement: 3,
    manualConflicts: 0,
    existingRuleOverlap: 0,
    previewTransactions: [],
    generatedBy: 'mastra',
    model: 'gpt-5.4-mini',
    createdAt: new Date('2026-02-14T00:00:00.000Z'),
    updatedAt: new Date('2026-02-14T00:00:00.000Z'),
  };
}

describe('CategorizationRuleRecommendationController', () => {
  let ControllerClass: typeof CategorizationRuleRecommendationController;
  let controller: CategorizationRuleRecommendationController;
  const user: JwtUser = { userId, email: 'test@example.com' };
  let service: {
    list: jest.Mock;
    requestGeneration: jest.Mock;
    accept: jest.Mock;
    dismiss: jest.Mock;
  };
  let processor: {
    processPending: jest.Mock;
  };

  beforeAll(() => {
    ControllerClass = jest.requireActual<
      typeof import('../../src/transaction-categorization/recommendations/categorization-rule-recommendation.controller')
    >(
      '../../src/transaction-categorization/recommendations/categorization-rule-recommendation.controller',
    ).CategorizationRuleRecommendationController;
  });

  beforeEach(() => {
    service = {
      list: jest.fn().mockResolvedValue({ generation: null, suggestions: [] }),
      requestGeneration: jest.fn().mockResolvedValue(buildGenerationResponse()),
      accept: jest.fn().mockResolvedValue(buildSuggestion()),
      dismiss: jest.fn().mockResolvedValue({
        ...buildSuggestion(),
        status: 'dismissed',
      }),
    };
    processor = {
      processPending: jest.fn().mockResolvedValue(undefined),
    };
    controller = new ControllerClass(service as never, processor as never);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('lists recommendations scoped to the current user', async () => {
    const response = await controller.list(user);

    expect(response).toEqual({ generation: null, suggestions: [] });
    expect(service.list).toHaveBeenCalledWith(userId);
  });

  it('queues generation and triggers the async processor', async () => {
    const response = await controller.generate(user, {});

    expect(response).toEqual(buildGenerationResponse());
    expect(service.requestGeneration).toHaveBeenCalledWith(userId, {
      regenerate: false,
      ignoredCategoryIds: undefined,
    });
    expect(processor.processPending).toHaveBeenCalledTimes(1);
  });

  it('queues regeneration with supersede semantics', async () => {
    const response = await controller.regenerate(user, {
      ignoredCategoryIds: ['33333333-3333-4333-8333-333333333333'],
    });

    expect(response).toEqual(buildGenerationResponse());
    expect(service.requestGeneration).toHaveBeenCalledWith(userId, {
      regenerate: true,
      ignoredCategoryIds: ['33333333-3333-4333-8333-333333333333'],
    });
    expect(processor.processPending).toHaveBeenCalledTimes(1);
  });

  it('accepts and dismisses owned suggestions', async () => {
    const acceptResponse = await controller.accept(suggestionId, user);
    const dismissResponse = await controller.dismiss(suggestionId, user);

    expect(acceptResponse.suggestion.status).toBe('pending');
    expect(dismissResponse.suggestion.status).toBe('dismissed');
    expect(service.accept).toHaveBeenCalledWith(suggestionId, userId);
    expect(service.dismiss).toHaveBeenCalledWith(suggestionId, userId);
  });
});
