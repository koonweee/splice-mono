import { Injectable } from '@nestjs/common';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import {
  CategorizationRuleConditionSchema,
  CategorizationRuleDraftPreviewSchema,
} from '../../types/CategorizationRule';

const SearchManualCategorizedTransactionsInputSchema = z.object({
  categoryId: z.string().uuid().optional(),
  query: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const ListRuleCandidatePatternsInputSchema = z.object({
  fields: z
    .array(
      z.enum([
        'merchantName',
        'website',
        'merchantEntityId',
        'providerCategoryDetailed',
        'providerCategoryPrimary',
      ]),
    )
    .min(1)
    .optional(),
  minAgreement: z.number().int().min(1).max(50).optional(),
  maxConflictRate: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const PreviewDraftCategorizationRuleInputSchema = z.object({
  targetCategoryId: z.string().uuid(),
  priority: z.number().int().optional(),
  conditions: z.array(CategorizationRuleConditionSchema).min(1),
});

export type RecommendationToolHandlers = {
  listExistingCategorizationRules: () => Promise<unknown>;
  searchManualCategorizedTransactions: (
    input: z.infer<typeof SearchManualCategorizedTransactionsInputSchema>,
  ) => Promise<unknown>;
  listRuleCandidatePatterns: (
    input: z.infer<typeof ListRuleCandidatePatternsInputSchema>,
  ) => Promise<unknown>;
  previewDraftCategorizationRule: (
    input: z.infer<typeof PreviewDraftCategorizationRuleInputSchema>,
  ) => Promise<unknown>;
};

@Injectable()
export class CategorizationRuleRecommendationTools {
  createTools(handlers: RecommendationToolHandlers) {
    return {
      listExistingCategorizationRules: createTool({
        id: 'listExistingCategorizationRules',
        description:
          'List existing active categorization rules and categories for this user.',
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
        execute: () => handlers.listExistingCategorizationRules(),
      }),
      searchManualCategorizedTransactions: createTool({
        id: 'searchManualCategorizedTransactions',
        description:
          'Search manually categorized transaction examples for this user.',
        inputSchema: SearchManualCategorizedTransactionsInputSchema,
        outputSchema: z.unknown(),
        execute: (input) =>
          handlers.searchManualCategorizedTransactions(
            SearchManualCategorizedTransactionsInputSchema.parse(input),
          ),
      }),
      listRuleCandidatePatterns: createTool({
        id: 'listRuleCandidatePatterns',
        description:
          'List ranked atomic rule candidates mined from manually categorized transactions, including agreement/conflict counts and draft previews.',
        inputSchema: ListRuleCandidatePatternsInputSchema,
        outputSchema: z.unknown(),
        execute: (input) =>
          handlers.listRuleCandidatePatterns(
            ListRuleCandidatePatternsInputSchema.parse(input),
          ),
      }),
      previewDraftCategorizationRule: createTool({
        id: 'previewDraftCategorizationRule',
        description:
          'Preview an unsaved categorization rule draft without mutating data.',
        inputSchema: PreviewDraftCategorizationRuleInputSchema,
        outputSchema: CategorizationRuleDraftPreviewSchema,
        execute: (input) =>
          handlers.previewDraftCategorizationRule(
            PreviewDraftCategorizationRuleInputSchema.parse(input),
          ),
      }),
    };
  }
}
