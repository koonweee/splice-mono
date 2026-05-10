import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { CategoryColorSchema } from './Category';
import { TimestampsSchema } from './Timestamps';

export const AnalysisRuleTypeSchema = registerSchema(
  'AnalysisRuleType',
  z.enum(['exclude', 'neutralize']),
);
export type AnalysisRuleType = z.infer<typeof AnalysisRuleTypeSchema>;

export const AnalysisCategoryScopeSchema = registerSchema(
  'AnalysisCategoryScope',
  z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('all'),
    }),
    z
      .object({
        mode: z.literal('selected'),
        categoryIds: z.array(z.string().uuid()).default([]),
        includeUncategorized: z.boolean().default(false),
      })
      .refine(
        (scope) => scope.categoryIds.length > 0 || scope.includeUncategorized,
        {
          message:
            'Selected scope must include at least one category or uncategorized',
        },
      ),
  ]),
);
export type AnalysisCategoryScope = z.infer<typeof AnalysisCategoryScopeSchema>;

export const AnalysisRuleCategoryViewSchema = registerSchema(
  'AnalysisRuleCategoryView',
  z.object({
    id: z.string().uuid(),
    primary: z.string(),
    detailed: z.string(),
    color: CategoryColorSchema,
    archivedAt: z.coerce.date().nullable().default(null),
  }),
);
export type AnalysisRuleCategoryView = z.infer<
  typeof AnalysisRuleCategoryViewSchema
>;

export const AnalysisCategoryScopeViewSchema = registerSchema(
  'AnalysisCategoryScopeView',
  z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('all'),
    }),
    z.object({
      mode: z.literal('selected'),
      includeUncategorized: z.boolean(),
      categories: z.array(AnalysisRuleCategoryViewSchema),
    }),
  ]),
);
export type AnalysisCategoryScopeView = z.infer<
  typeof AnalysisCategoryScopeViewSchema
>;

const ExcludeAnalysisRuleShape = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.literal('exclude'),
  excludeScope: AnalysisCategoryScopeSchema,
});

const NeutralizeAnalysisRuleShape = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.literal('neutralize'),
  inflowScope: AnalysisCategoryScopeSchema,
  outflowScope: AnalysisCategoryScopeSchema,
});

export const CreateAnalysisRuleDtoSchema = registerSchema(
  'CreateAnalysisRuleDto',
  z.discriminatedUnion('type', [
    ExcludeAnalysisRuleShape,
    NeutralizeAnalysisRuleShape,
  ]),
);
export type CreateAnalysisRuleDto = z.infer<typeof CreateAnalysisRuleDtoSchema>;

export const UpdateAnalysisRuleDtoSchema = registerSchema(
  'UpdateAnalysisRuleDto',
  z.object({
    name: z.string().trim().min(1).max(80).optional(),
    type: AnalysisRuleTypeSchema.optional(),
    excludeScope: AnalysisCategoryScopeSchema.optional(),
    inflowScope: AnalysisCategoryScopeSchema.optional(),
    outflowScope: AnalysisCategoryScopeSchema.optional(),
    archived: z.boolean().optional(),
  }),
);
export type UpdateAnalysisRuleDto = z.infer<typeof UpdateAnalysisRuleDtoSchema>;

export const AnalysisRuleViewSchema = registerSchema(
  'AnalysisRuleView',
  z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      type: AnalysisRuleTypeSchema,
      excludeScope: AnalysisCategoryScopeViewSchema.nullable(),
      inflowScope: AnalysisCategoryScopeViewSchema.nullable(),
      outflowScope: AnalysisCategoryScopeViewSchema.nullable(),
      archivedAt: z.coerce.date().nullable().default(null),
    })
    .merge(TimestampsSchema),
);
export type AnalysisRuleView = z.infer<typeof AnalysisRuleViewSchema>;

export const AnalysisRuleConflictSchema = registerSchema(
  'AnalysisRuleConflict',
  z.object({
    ruleId: z.string().uuid(),
    name: z.string(),
    type: AnalysisRuleTypeSchema,
    label: z.string(),
    archivedAt: z.coerce.date().nullable().default(null),
  }),
);
export type AnalysisRuleConflict = z.infer<typeof AnalysisRuleConflictSchema>;
