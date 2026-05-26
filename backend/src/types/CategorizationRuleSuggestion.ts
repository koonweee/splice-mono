import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import {
  CategorizationRuleCategoryViewSchema,
  CategorizationRuleConditionSchema,
} from './CategorizationRule';
import { TimestampsSchema } from './Timestamps';
import { TransactionSchema } from './Transaction';

export const CategorizationRuleSuggestionStatusSchema = registerSchema(
  'CategorizationRuleSuggestionStatus',
  z.enum(['pending', 'accepted', 'dismissed', 'superseded']),
);
export type CategorizationRuleSuggestionStatus = z.infer<
  typeof CategorizationRuleSuggestionStatusSchema
>;

export const CategorizationRuleSuggestionGenerationStatusSchema =
  registerSchema(
    'CategorizationRuleSuggestionGenerationStatus',
    z.enum(['pending', 'processing', 'completed', 'failed']),
  );
export type CategorizationRuleSuggestionGenerationStatus = z.infer<
  typeof CategorizationRuleSuggestionGenerationStatusSchema
>;

export const CategorizationRuleSuggestionGenerationSchema = registerSchema(
  'CategorizationRuleSuggestionGeneration',
  z
    .object({
      id: z.string().uuid(),
      userId: z.string().uuid(),
      status: CategorizationRuleSuggestionGenerationStatusSchema,
      model: z.string(),
      ignoredCategoryIds: z.array(z.string().uuid()),
      startedAt: z.coerce.date().nullable(),
      completedAt: z.coerce.date().nullable(),
      failedAt: z.coerce.date().nullable(),
      errorMessage: z.string().nullable(),
    })
    .merge(TimestampsSchema),
);
export type CategorizationRuleSuggestionGeneration = z.infer<
  typeof CategorizationRuleSuggestionGenerationSchema
>;

export const CategorizationRuleSuggestionSchema = registerSchema(
  'CategorizationRuleSuggestion',
  z
    .object({
      id: z.string().uuid(),
      userId: z.string().uuid(),
      generationId: z.string().uuid(),
      name: z.string(),
      targetCategoryId: z.string().uuid(),
      targetCategory: CategorizationRuleCategoryViewSchema,
      priority: z.number().int(),
      conditions: z.array(CategorizationRuleConditionSchema),
      rationale: z.string(),
      status: CategorizationRuleSuggestionStatusSchema,
      acceptedRuleId: z.string().uuid().nullable(),
      matched: z.number().int(),
      updated: z.number().int(),
      skippedManual: z.number().int(),
      manualAgreement: z.number().int(),
      manualConflicts: z.number().int(),
      existingRuleOverlap: z.number().int(),
      previewTransactions: z.array(TransactionSchema),
      generatedBy: z.literal('mastra'),
      model: z.string(),
    })
    .merge(TimestampsSchema),
);
export type CategorizationRuleSuggestion = z.infer<
  typeof CategorizationRuleSuggestionSchema
>;

export const CategorizationRuleRecommendationListResponseSchema =
  registerSchema(
    'CategorizationRuleRecommendationListResponse',
    z.object({
      generation: CategorizationRuleSuggestionGenerationSchema.nullable(),
      suggestions: z.array(CategorizationRuleSuggestionSchema),
    }),
  );
export type CategorizationRuleRecommendationListResponse = z.infer<
  typeof CategorizationRuleRecommendationListResponseSchema
>;

export const CategorizationRuleRecommendationGenerationResponseSchema =
  registerSchema(
    'CategorizationRuleRecommendationGenerationResponse',
    z.object({
      generation: CategorizationRuleSuggestionGenerationSchema,
      suggestions: z.array(CategorizationRuleSuggestionSchema),
    }),
  );
export type CategorizationRuleRecommendationGenerationResponse = z.infer<
  typeof CategorizationRuleRecommendationGenerationResponseSchema
>;

export const GenerateCategorizationRuleRecommendationsDtoSchema =
  registerSchema(
    'GenerateCategorizationRuleRecommendationsDto',
    z
      .object({
        ignoredCategoryIds: z.array(z.string().uuid()).max(100).optional(),
      })
      .default({}),
  );
export type GenerateCategorizationRuleRecommendationsDto = z.infer<
  typeof GenerateCategorizationRuleRecommendationsDtoSchema
>;

export const AcceptCategorizationRuleSuggestionResponseSchema = registerSchema(
  'AcceptCategorizationRuleSuggestionResponse',
  z.object({
    suggestion: CategorizationRuleSuggestionSchema,
  }),
);
export type AcceptCategorizationRuleSuggestionResponse = z.infer<
  typeof AcceptCategorizationRuleSuggestionResponseSchema
>;

export const DismissCategorizationRuleSuggestionResponseSchema = registerSchema(
  'DismissCategorizationRuleSuggestionResponse',
  z.object({
    suggestion: CategorizationRuleSuggestionSchema,
  }),
);
export type DismissCategorizationRuleSuggestionResponse = z.infer<
  typeof DismissCategorizationRuleSuggestionResponseSchema
>;
