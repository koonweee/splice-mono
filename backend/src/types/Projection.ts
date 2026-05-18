import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';

const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const ProjectionAccountGroupingSchema = z.enum([
  'cash',
  'credit',
  'investment',
  'liability',
]);
export type ProjectionAccountGrouping = z.infer<
  typeof ProjectionAccountGroupingSchema
>;

export const ProjectionScopeSchema = registerSchema(
  'ProjectionScope',
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('netWorth'),
    }),
    z.object({
      kind: z.literal('accountGroups'),
      accountGroupings: z.array(ProjectionAccountGroupingSchema).min(1),
    }),
    z.object({
      kind: z.literal('accounts'),
      accountIds: z.array(z.string().uuid()).min(1),
    }),
  ]),
);
export type ProjectionScope = z.infer<typeof ProjectionScopeSchema>;

export const ProjectionAssumptionSchema = registerSchema(
  'ProjectionAssumption',
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    valueLabel: z.string().min(1),
    source: z.enum(['user_prompt', 'llm_inferred', 'default', 'system']),
    confidence: z.number().min(0).max(1).optional(),
    parameterPath: z.string().optional(),
  }),
);
export type ProjectionAssumption = z.infer<typeof ProjectionAssumptionSchema>;

const ControlBaseSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  parameterPath: z.string().min(1),
});

export const ProjectionControlSpecSchema = registerSchema(
  'ProjectionControlSpec',
  z.discriminatedUnion('kind', [
    ControlBaseSchema.extend({
      kind: z.literal('currencyAmount'),
      currency: z.string().min(3).max(10),
      min: z.number(),
      max: z.number(),
      step: z.number().positive(),
    }),
    ControlBaseSchema.extend({
      kind: z.literal('percentageSlider'),
      min: z.number(),
      max: z.number(),
      step: z.number().positive(),
    }),
    ControlBaseSchema.extend({
      kind: z.literal('segmentedSelect'),
      options: z.array(
        z.object({
          label: z.string().min(1),
          value: z.union([z.string(), z.number()]),
        }),
      ),
    }),
    ControlBaseSchema.extend({
      kind: z.literal('toggle'),
    }),
  ]),
);
export type ProjectionControlSpec = z.infer<typeof ProjectionControlSpecSchema>;

export const ProjectionChartAnnotationSchema = registerSchema(
  'ProjectionChartAnnotation',
  z.object({
    id: z.string().min(1),
    kind: z.enum(['milestone', 'assumption', 'contribution', 'risk']),
    label: z.string().min(1),
    description: z.string().optional(),
    date: DateStringSchema.optional(),
    value: z.number().optional(),
  }),
);
export type ProjectionChartAnnotation = z.infer<
  typeof ProjectionChartAnnotationSchema
>;

export const ProjectionAnnualContributionSchema = registerSchema(
  'ProjectionAnnualContribution',
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    amount: z.number(),
    currency: z.string().min(3).max(10),
    target: ProjectionScopeSchema,
    startDate: DateStringSchema.optional(),
    endDate: DateStringSchema.optional(),
    inflationAdjust: z.boolean().optional(),
  }),
);
export type ProjectionAnnualContribution = z.infer<
  typeof ProjectionAnnualContributionSchema
>;

export const ProjectionScenarioSchema = registerSchema(
  'ProjectionScenario',
  z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    prompt: z.string().optional(),
    currency: z.string().min(3).max(10),
    startDate: DateStringSchema,
    scope: ProjectionScopeSchema,
    horizonYears: z.number().int().min(1).max(50),
    cadence: z.enum(['monthly', 'yearly']),
    parameters: z.object({
      currentValue: z.number().optional(),
      annualContributions: z.array(ProjectionAnnualContributionSchema),
      expectedAnnualReturn: z.number().min(-0.5).max(0.5),
      inflationRate: z.number().min(0).max(0.25),
      taxDragRate: z.number().min(0).max(0.5),
      volatility: z.number().min(0).max(1),
    }),
    assumptions: z.array(ProjectionAssumptionSchema),
    controls: z.array(ProjectionControlSpecSchema),
    annotations: z.array(ProjectionChartAnnotationSchema),
  }),
);
export type ProjectionScenario = z.infer<typeof ProjectionScenarioSchema>;

export const ProjectionMetricSchema = registerSchema(
  'ProjectionMetric',
  z.object({
    id: z.string(),
    label: z.string(),
    value: z.number(),
    formattedValue: z.string(),
    description: z.string().optional(),
  }),
);
export type ProjectionMetric = z.infer<typeof ProjectionMetricSchema>;

export const ProjectionMilestoneSchema = registerSchema(
  'ProjectionMilestone',
  z.object({
    id: z.string(),
    label: z.string(),
    targetValue: z.number(),
    reachedAt: DateStringSchema.optional(),
  }),
);
export type ProjectionMilestone = z.infer<typeof ProjectionMilestoneSchema>;

export const ProjectionPointSchema = registerSchema(
  'ProjectionPoint',
  z.object({
    date: DateStringSchema,
    historical: z.number().optional(),
    projectedMedian: z.number().optional(),
    projectedLow: z.number().optional(),
    projectedHigh: z.number().optional(),
    totalContributions: z.number(),
  }),
);
export type ProjectionPoint = z.infer<typeof ProjectionPointSchema>;

export const ProjectionResultSchema = registerSchema(
  'ProjectionResult',
  z.object({
    scenarioId: z.string(),
    currency: z.string(),
    points: z.array(ProjectionPointSchema),
    metrics: z.array(ProjectionMetricSchema),
    milestones: z.array(ProjectionMilestoneSchema),
    annotations: z.array(ProjectionChartAnnotationSchema),
  }),
);
export type ProjectionResult = z.infer<typeof ProjectionResultSchema>;

export const LLMProjectionPlanResponseSchema = registerSchema(
  'LLMProjectionPlanResponse',
  z.object({
    version: z.literal(1),
    assistantMessage: z.string(),
    scenario: ProjectionScenarioSchema,
    followUpQuestions: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
);
export type LLMProjectionPlanResponse = z.infer<
  typeof LLMProjectionPlanResponseSchema
>;

export const ProjectionComputeRequestSchema = registerSchema(
  'ProjectionComputeRequest',
  z.object({
    scenario: ProjectionScenarioSchema,
    historyWindowYears: z.number().int().min(0).max(20).optional(),
  }),
);
export type ProjectionComputeRequest = z.infer<
  typeof ProjectionComputeRequestSchema
>;

export const ProjectionPlanRequestSchema = registerSchema(
  'ProjectionPlanRequest',
  z.object({
    prompt: z.string().min(1).max(4000),
    currentScenario: ProjectionScenarioSchema.optional(),
    historyWindowYears: z.number().int().min(0).max(20).optional(),
  }),
);
export type ProjectionPlanRequest = z.infer<typeof ProjectionPlanRequestSchema>;

export const ProjectionPlanResponseSchema = registerSchema(
  'ProjectionPlanResponse',
  z.object({
    plan: LLMProjectionPlanResponseSchema,
    result: ProjectionResultSchema,
  }),
);
export type ProjectionPlanResponse = z.infer<
  typeof ProjectionPlanResponseSchema
>;

export const ALLOWED_PROJECTION_PARAMETER_PATHS = [
  'horizonYears',
  'parameters.expectedAnnualReturn',
  'parameters.inflationRate',
  'parameters.taxDragRate',
  'parameters.volatility',
] as const;

export function isAllowedProjectionParameterPath(
  path: string,
  scenario: ProjectionScenario,
): boolean {
  if (
    ALLOWED_PROJECTION_PARAMETER_PATHS.includes(
      path as (typeof ALLOWED_PROJECTION_PARAMETER_PATHS)[number],
    )
  ) {
    return true;
  }

  return scenario.parameters.annualContributions.some(
    (contribution) =>
      path === `parameters.annualContributions.${contribution.id}.amount` ||
      path ===
        `parameters.annualContributions.${contribution.id}.inflationAdjust`,
  );
}
