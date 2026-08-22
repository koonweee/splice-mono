import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { CategoryColorSchema } from './Category';
import { TimestampsSchema } from './Timestamps';
import { TransactionSchema } from './Transaction';

const TextRuleFieldSchema = z.enum([
  'merchantName',
  'providerTransactionName',
  'originalDescription',
  'merchantEntityId',
  'website',
  'providerCategoryPrimary',
  'providerCategoryDetailed',
]);

const TextRuleConditionSchema = z.object({
  field: TextRuleFieldSchema,
  operator: z.enum(['equals', 'contains', 'startsWith', 'endsWith']),
  value: z.string().trim().min(1),
});

const AccountRuleConditionSchema = z
  .object({
    field: z.literal('accountId'),
    operator: z.enum(['equals', 'in']),
    value: z.union([z.string().uuid(), z.array(z.string().uuid()).min(1)]),
  })
  .refine(
    (condition) =>
      condition.operator === 'in'
        ? Array.isArray(condition.value)
        : typeof condition.value === 'string',
    {
      message: 'accountId equals requires a single value; in requires an array',
    },
  );

const AmountSignRuleConditionSchema = z.object({
  field: z.literal('amountSign'),
  operator: z.literal('equals'),
  value: z.enum(['positive', 'negative']),
});

const AmountBetweenValueSchema = z
  .object({
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .refine((value) => value.min !== undefined || value.max !== undefined, {
    message: 'between requires at least a min or max',
  })
  .refine(
    (value) =>
      value.min === undefined ||
      value.max === undefined ||
      value.min <= value.max,
    { message: 'min must be less than or equal to max' },
  );

const AmountRuleConditionSchema = z
  .object({
    field: z.literal('amount'),
    operator: z.enum(['equals', 'greaterThan', 'lessThan', 'between']),
    value: z.union([z.number(), AmountBetweenValueSchema]),
  })
  .refine(
    (condition) =>
      condition.operator === 'between'
        ? typeof condition.value === 'object'
        : typeof condition.value === 'number',
    {
      message:
        'amount between requires a range; other operators require a number',
    },
  );

export const CategorizationRuleConditionSchema = registerSchema(
  'CategorizationRuleCondition',
  z.union([
    TextRuleConditionSchema,
    AccountRuleConditionSchema,
    AmountSignRuleConditionSchema,
    AmountRuleConditionSchema,
  ]),
);
export type CategorizationRuleCondition = z.infer<
  typeof CategorizationRuleConditionSchema
>;

export const CategorizationRuleCategoryViewSchema = registerSchema(
  'CategorizationRuleCategoryView',
  z.object({
    id: z.string().uuid(),
    primary: z.string(),
    detailed: z.string(),
    color: CategoryColorSchema,
    archivedAt: z.coerce.date().nullable().default(null),
  }),
);
export type CategorizationRuleCategoryView = z.infer<
  typeof CategorizationRuleCategoryViewSchema
>;

export const CreateCategorizationRuleDtoSchema = registerSchema(
  'CreateCategorizationRuleDto',
  z.object({
    name: z.string().trim().min(1).max(80),
    priority: z.number().int().optional(),
    targetCategoryId: z.string().uuid(),
    conditions: z.array(CategorizationRuleConditionSchema).min(1),
  }),
);
export type CreateCategorizationRuleDto = z.infer<
  typeof CreateCategorizationRuleDtoSchema
>;

export const UpdateCategorizationRuleDtoSchema = registerSchema(
  'UpdateCategorizationRuleDto',
  z.object({
    name: z.string().trim().min(1).max(80).optional(),
    priority: z.number().int().optional(),
    targetCategoryId: z.string().uuid().optional(),
    conditions: z.array(CategorizationRuleConditionSchema).min(1).optional(),
    archived: z.boolean().optional(),
  }),
);
export type UpdateCategorizationRuleDto = z.infer<
  typeof UpdateCategorizationRuleDtoSchema
>;

export const EditCategorizationRuleDtoSchema = registerSchema(
  'EditCategorizationRuleDto',
  UpdateCategorizationRuleDtoSchema.omit({ archived: true }),
);
export type EditCategorizationRuleDto = z.infer<
  typeof EditCategorizationRuleDtoSchema
>;

export const CategorizationRuleViewSchema = registerSchema(
  'CategorizationRuleView',
  z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      priority: z.number().int(),
      targetCategoryId: z.string().uuid(),
      targetCategory: CategorizationRuleCategoryViewSchema,
      conditions: z.array(CategorizationRuleConditionSchema),
      archivedAt: z.coerce.date().nullable().default(null),
      revision: z.number().int().positive(),
    })
    .merge(TimestampsSchema),
);
export type CategorizationRuleView = z.infer<
  typeof CategorizationRuleViewSchema
>;

export const CategorizationRuleConflictSchema = registerSchema(
  'CategorizationRuleConflict',
  z.object({
    ruleId: z.string().uuid(),
    name: z.string(),
    label: z.string(),
    archivedAt: z.coerce.date().nullable().default(null),
  }),
);
export type CategorizationRuleConflict = z.infer<
  typeof CategorizationRuleConflictSchema
>;

export const ApplyCategorizationRuleResponseSchema = registerSchema(
  'ApplyCategorizationRuleResponse',
  z.object({
    matched: z.number().int(),
    updated: z.number().int(),
    skippedManual: z.number().int(),
  }),
);
export type ApplyCategorizationRuleResponse = z.infer<
  typeof ApplyCategorizationRuleResponseSchema
>;

export const PreviewCategorizationRuleApplicationResponseSchema =
  registerSchema(
    'PreviewCategorizationRuleApplicationResponse',
    ApplyCategorizationRuleResponseSchema.extend({
      transactions: z.array(TransactionSchema),
    }),
  );
export type PreviewCategorizationRuleApplicationResponse = z.infer<
  typeof PreviewCategorizationRuleApplicationResponseSchema
>;

export const PreviewCategorizationRuleDraftDtoSchema = registerSchema(
  'PreviewCategorizationRuleDraftDto',
  z.object({
    targetCategoryId: z.string().uuid(),
    priority: z.number().int().optional(),
    conditions: z.array(CategorizationRuleConditionSchema).min(1),
  }),
);
export type PreviewCategorizationRuleDraftDto = z.infer<
  typeof PreviewCategorizationRuleDraftDtoSchema
>;

export const CategorizationRuleDraftPreviewSchema = registerSchema(
  'CategorizationRuleDraftPreview',
  PreviewCategorizationRuleApplicationResponseSchema.extend({
    manualAgreement: z.number().int(),
    manualConflicts: z.number().int(),
    existingRuleOverlap: z.number().int(),
  }),
);
export type CategorizationRuleDraftPreview = z.infer<
  typeof CategorizationRuleDraftPreviewSchema
>;

export const CategorizationRuleChangeImpactSchema = registerSchema(
  'CategorizationRuleChangeImpact',
  z.object({
    matchedBefore: z.number().int(),
    matchedAfter: z.number().int(),
    newlyMatched: z.number().int(),
    noLongerMatched: z.number().int(),
    winningBefore: z.number().int(),
    winningAfter: z.number().int(),
    winnerChanged: z.number().int(),
    skippedManual: z.number().int(),
    historicalAssignments: z.number().int(),
    historicalAssignmentsUntouched: z.literal(true),
  }),
);
export type CategorizationRuleChangeImpact = z.infer<
  typeof CategorizationRuleChangeImpactSchema
>;

export const CategorizationRuleChangePreviewSchema = registerSchema(
  'CategorizationRuleChangePreview',
  z.object({
    action: z.enum(['edit', 'archive', 'restore']),
    currentRule: CategorizationRuleViewSchema,
    proposedRule: CategorizationRuleViewSchema,
    impact: CategorizationRuleChangeImpactSchema,
    transactions: z.array(TransactionSchema),
  }),
);
export type CategorizationRuleChangePreview = z.infer<
  typeof CategorizationRuleChangePreviewSchema
>;
