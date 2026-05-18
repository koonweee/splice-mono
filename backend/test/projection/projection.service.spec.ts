import { BadRequestException } from '@nestjs/common';
import { ProjectionService } from '../../src/projection/projection.service';
import type { ProjectionScenario } from '../../src/types/Projection';

const userId = 'user-1';

function scenario(
  overrides: Partial<ProjectionScenario> = {},
): ProjectionScenario {
  return {
    id: 'scenario-1',
    title: 'Base case',
    currency: 'USD',
    startDate: '2026-01-01',
    scope: { kind: 'netWorth' },
    horizonYears: 10,
    cadence: 'monthly',
    parameters: {
      annualContributions: [
        {
          id: 'brokerage',
          label: 'Brokerage contribution',
          amount: 12000,
          currency: 'USD',
          target: { kind: 'netWorth' },
        },
      ],
      expectedAnnualReturn: 0.06,
      inflationRate: 0.02,
      taxDragRate: 0.01,
      volatility: 0.15,
    },
    assumptions: [],
    controls: [],
    annotations: [],
    ...overrides,
  };
}

describe('ProjectionService', () => {
  const contextService = {
    getProjectionContext: jest.fn(),
    getPlanningContext: jest.fn(),
  };
  const engineService = {
    compute: jest.fn(),
  };
  const llmService = {
    createPlan: jest.fn(),
  };
  let service: ProjectionService;

  beforeEach(() => {
    service = new ProjectionService(
      contextService as never,
      engineService as never,
      llmService as never,
    );
    contextService.getProjectionContext.mockResolvedValue({
      historicalPoints: [{ date: '2026-01-01', value: 100000 }],
      startingValue: 100000,
    });
    contextService.getPlanningContext.mockResolvedValue({
      user: { today: '2026-01-01' },
      accounts: { accounts: [] },
      history: { chartData: [] },
    });
    engineService.compute.mockReturnValue({
      scenarioId: 'scenario-1',
      currency: 'USD',
      points: [],
      metrics: [],
      milestones: [],
      annotations: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads scoped context and computes deterministic results', async () => {
    await service.compute(userId, {
      scenario: scenario({
        controls: [
          {
            kind: 'currencyAmount',
            id: 'brokerage-amount',
            label: 'Brokerage contribution',
            parameterPath: 'parameters.annualContributions.brokerage.amount',
            currency: 'USD',
            min: 0,
            max: 100000,
            step: 1000,
          },
        ],
      }),
    });

    expect(contextService.getProjectionContext).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ id: 'scenario-1' }),
      undefined,
    );
    expect(engineService.compute).toHaveBeenCalledWith({
      scenario: expect.objectContaining({ id: 'scenario-1' }),
      historicalPoints: [{ date: '2026-01-01', value: 100000 }],
      startingValue: 100000,
    });
  });

  it('rejects unsafe generated control parameter paths', async () => {
    await expect(
      service.compute(userId, {
        scenario: scenario({
          controls: [
            {
              kind: 'toggle',
              id: 'unsafe',
              label: 'Unsafe',
              parameterPath: 'user.settings.currency',
            },
          ],
        }),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('plans through the LLM and recomputes final outputs deterministically', async () => {
    llmService.createPlan.mockResolvedValue({
      version: 1,
      assistantMessage: 'Created a projection.',
      scenario: scenario(),
      followUpQuestions: [],
      warnings: [],
    });

    const result = await service.plan(userId, {
      prompt: 'Project my net worth',
    });

    expect(contextService.getPlanningContext).toHaveBeenCalledWith(userId, 5);
    expect(llmService.createPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Project my net worth',
      }),
    );
    expect(result.plan.assistantMessage).toBe('Created a projection.');
    expect(engineService.compute).toHaveBeenCalled();
  });
});
