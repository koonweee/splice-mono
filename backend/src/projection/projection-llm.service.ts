import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import {
  LLMProjectionPlanResponse,
  LLMProjectionPlanResponseSchema,
  ProjectionScenario,
} from '../types/Projection';
import type { ProjectionContextService } from './projection-context.service';

type PlanningContext = Awaited<
  ReturnType<ProjectionContextService['getPlanningContext']>
>;

export interface ProjectionPlanInput {
  prompt: string;
  currentScenario?: ProjectionScenario;
  planningContext: PlanningContext;
}

const PROJECTION_MODEL = 'gpt-5.4-mini';
const PROJECTION_REASONING_EFFORT = 'xhigh';

const StrictProjectionScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('netWorth') }),
  z.object({
    kind: z.literal('accountGroups'),
    accountGroupings: z.array(
      z.enum(['cash', 'credit', 'investment', 'liability']),
    ),
  }),
  z.object({
    kind: z.literal('accounts'),
    accountIds: z.array(z.string()),
  }),
]);

const StrictProjectionAssumptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  valueLabel: z.string(),
  source: z.enum(['user_prompt', 'llm_inferred', 'default', 'system']),
  confidence: z.number().nullable(),
  parameterPath: z.string().nullable(),
});

const StrictProjectionControlSpecSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('currencyAmount'),
    id: z.string(),
    label: z.string(),
    parameterPath: z.string(),
    currency: z.string(),
    min: z.number(),
    max: z.number(),
    step: z.number(),
  }),
  z.object({
    kind: z.literal('percentageSlider'),
    id: z.string(),
    label: z.string(),
    parameterPath: z.string(),
    min: z.number(),
    max: z.number(),
    step: z.number(),
  }),
  z.object({
    kind: z.literal('segmentedSelect'),
    id: z.string(),
    label: z.string(),
    parameterPath: z.string(),
    options: z.array(
      z.object({
        label: z.string(),
        value: z.union([z.string(), z.number()]),
      }),
    ),
  }),
  z.object({
    kind: z.literal('toggle'),
    id: z.string(),
    label: z.string(),
    parameterPath: z.string(),
  }),
]);

const StrictProjectionChartAnnotationSchema = z.object({
  id: z.string(),
  kind: z.enum(['milestone', 'assumption', 'contribution', 'risk']),
  label: z.string(),
  description: z.string().nullable(),
  date: z.string().nullable(),
  value: z.number().nullable(),
});

const StrictProjectionAnnualContributionSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.number(),
  currency: z.string(),
  target: StrictProjectionScopeSchema,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  inflationAdjust: z.boolean().nullable(),
});

const StrictProjectionScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string().nullable(),
  currency: z.string(),
  startDate: z.string(),
  scope: StrictProjectionScopeSchema,
  horizonYears: z.number(),
  cadence: z.enum(['monthly', 'yearly']),
  parameters: z.object({
    currentValue: z.number().nullable(),
    annualContributions: z.array(StrictProjectionAnnualContributionSchema),
    expectedAnnualReturn: z.number(),
    inflationRate: z.number(),
    taxDragRate: z.number(),
    volatility: z.number(),
  }),
  assumptions: z.array(StrictProjectionAssumptionSchema),
  controls: z.array(StrictProjectionControlSpecSchema),
  annotations: z.array(StrictProjectionChartAnnotationSchema),
});

const StrictLLMProjectionPlanResponseSchema = z.object({
  version: z.literal(1),
  assistantMessage: z.string(),
  scenario: StrictProjectionScenarioSchema,
  followUpQuestions: z.array(z.string()),
  warnings: z.array(z.string()),
});

function removeNulls(value: unknown): unknown {
  if (value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map(removeNulls);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, removeNulls(entry)] as const)
        .filter(([, entry]) => entry !== undefined),
    );
  }
  return value;
}

@Injectable()
export class ProjectionLlmService {
  private readonly client: OpenAI | null;

  constructor() {
    this.client = process.env.OPENAI_API_KEY
      ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      : null;
  }

  async createPlan(
    input: ProjectionPlanInput,
  ): Promise<LLMProjectionPlanResponse> {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'OpenAI is not configured. Set OPENAI_API_KEY to generate projection plans.',
      );
    }

    try {
      const response = await this.client.responses.parse({
        model: PROJECTION_MODEL,
        reasoning: { effort: PROJECTION_REASONING_EFFORT },
        input: [
          {
            role: 'system',
            content:
              'You create structured financial projection scenarios for Splice. Return only the requested typed plan. Never calculate final projection metrics, CAGR, confidence bounds, or chart points. The deterministic projection engine computes final numbers. Use only safe controls that map to provided projection parameters. If the prompt is ambiguous, choose reasonable editable defaults and include concise follow-up questions.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              prompt: input.prompt,
              currentScenario: input.currentScenario,
              context: input.planningContext,
            }),
          },
        ],
        text: {
          format: zodTextFormat(
            StrictLLMProjectionPlanResponseSchema,
            'projection_plan',
          ),
        },
      });

      if (!response.output_parsed) {
        throw new Error('OpenAI returned an empty projection plan.');
      }

      return LLMProjectionPlanResponseSchema.parse(
        removeNulls(response.output_parsed),
      );
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new ServiceUnavailableException(
        'Could not generate a valid projection plan. Please refine the prompt or try again.',
      );
    }
  }
}
