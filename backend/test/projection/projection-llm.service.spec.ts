import { ServiceUnavailableException } from '@nestjs/common';
import { ProjectionLlmService } from '../../src/projection/projection-llm.service';
import { MoneySign } from '../../src/types/MoneyWithSign';
import type { LLMProjectionPlanResponse } from '../../src/types/Projection';

describe('ProjectionLlmService', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const planningContext = {
    user: {
      id: 'user-1',
      email: 'user@example.com',
      currency: 'USD',
      timezone: 'UTC',
      today: '2026-01-01',
    },
    accounts: { matchedCount: 0, truncated: false, accounts: [] },
    history: {
      netWorth: {
        money: { amount: 0, currency: 'USD' },
        sign: MoneySign.POSITIVE,
      },
      chartData: [],
      assets: [],
      liabilities: [],
    },
  };

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it('throws a stable configuration error when OpenAI is not configured', async () => {
    delete process.env.OPENAI_API_KEY;
    const service = new ProjectionLlmService();

    await expect(
      service.createPlan({
        prompt: 'Project my future',
        planningContext,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns parsed structured output from the OpenAI Responses API', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const parsed: LLMProjectionPlanResponse = {
      version: 1,
      assistantMessage: 'Created a projection.',
      scenario: {
        id: 'scenario-1',
        title: 'Base case',
        currency: 'USD',
        startDate: '2026-01-01',
        scope: { kind: 'netWorth' },
        horizonYears: 10,
        cadence: 'monthly',
        parameters: {
          annualContributions: [],
          expectedAnnualReturn: 0.06,
          inflationRate: 0.02,
          taxDragRate: 0,
          volatility: 0.15,
        },
        assumptions: [],
        controls: [],
        annotations: [],
      },
      followUpQuestions: [],
      warnings: [],
    };
    const service = new ProjectionLlmService();
    const mockClient = {
      responses: {
        parse: jest.fn().mockResolvedValue({ output_parsed: parsed }),
      },
    };
    Object.defineProperty(service, 'client', { value: mockClient });

    const result = await service.createPlan({
      prompt: 'Project my future',
      planningContext,
    });

    expect(result).toStrictEqual(parsed);
    expect(mockClient.responses.parse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.4-mini',
        reasoning: { effort: 'xhigh' },
        input: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
          expect.objectContaining({ role: 'user' }),
        ]),
      }),
    );
  });

  it('wraps OpenAI API failures in a stable service error', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const service = new ProjectionLlmService();
    const mockClient = {
      responses: {
        parse: jest.fn().mockRejectedValue(new Error('upstream unavailable')),
      },
    };
    Object.defineProperty(service, 'client', { value: mockClient });

    await expect(
      service.createPlan({
        prompt: 'Project my future',
        planningContext,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('wraps malformed structured output in a stable service error', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const service = new ProjectionLlmService();
    const mockClient = {
      responses: {
        parse: jest.fn().mockResolvedValue({
          output_parsed: {
            version: 1,
            assistantMessage: 'Missing scenario',
            followUpQuestions: [],
            warnings: [],
          },
        }),
      },
    };
    Object.defineProperty(service, 'client', { value: mockClient });

    await expect(
      service.createPlan({
        prompt: 'Project my future',
        planningContext,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
