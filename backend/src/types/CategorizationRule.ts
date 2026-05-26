import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { CategoryColorSchema } from './Category';
import { TimestampsSchema } from './Timestamps';

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
