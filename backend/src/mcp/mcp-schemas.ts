import { z } from 'zod';
import { MoneySign } from '../types/MoneyWithSign';

const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

export const McpMoneySchema = z
  .object({
    amount: z.number(),
    currency: z.string(),
    sign: z.nativeEnum(MoneySign),
  })
  .passthrough();

export const McpPageInfoSchema = z
  .object({
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  })
  .passthrough();

export const McpQuerySchema = z.record(z.string(), z.unknown());
export const McpLooseObjectSchema = z.object({}).passthrough();

const MoneyLikeRecordSchema = z
  .object({
    amount: z.number().optional(),
    currency: z.string().optional(),
    sign: z.nativeEnum(MoneySign).optional(),
  })
  .passthrough();

export const GetUserContextOutputSchema = z
  .object({
    userId: z.string(),
    email: z.string(),
    currency: z.string(),
    timezone: z.string(),
    today: DateStringSchema,
  })
  .passthrough();

export const AccountsSnapshotOutputSchema = z
  .object({
    matchedCount: z.number().optional(),
    truncated: z.boolean().optional(),
    accounts: z.array(McpLooseObjectSchema),
  })
  .passthrough();

export const BalanceHistoryOutputSchema = z
  .object({
    netWorth: MoneyLikeRecordSchema.optional(),
    chartData: z.array(z.unknown()).optional(),
    assets: z.array(z.unknown()).optional(),
    liabilities: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const SearchTransactionsOutputSchema = z
  .object({
    matchedCount: z.number().optional(),
    truncated: z.boolean().optional(),
    transactions: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const PaginatedListOutputSchema = z
  .object({
    data: z.array(z.unknown()),
    pageInfo: McpPageInfoSchema,
    query: McpQuerySchema.optional(),
  })
  .passthrough();

export const CategoriesOutputSchema = z
  .object({
    data: z.array(z.unknown()),
    query: McpQuerySchema,
  })
  .passthrough();

export const InvestmentHoldingsOutputSchema = z
  .object({
    data: z.array(z.unknown()),
    query: z
      .object({
        latestOnly: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough();

export const RecurringSchedulesOutputSchema = z
  .object({
    data: z.array(z.unknown()),
    query: z
      .object({
        includePaused: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough();

export const RuleListOutputSchema = z
  .object({
    data: z.array(z.unknown()),
    query: z
      .object({
        archived: z.boolean(),
      })
      .passthrough(),
  })
  .passthrough();

export const CategorizationRecommendationsOutputSchema = z
  .object({
    generation: z.unknown().nullable().optional(),
    suggestions: z.array(z.unknown()).optional(),
  })
  .passthrough();

const CategorizationPreviewCountsSchema = z
  .object({
    matched: z.number().int(),
    updated: z.number().int(),
    skippedManual: z.number().int(),
    manualAgreement: z.number().int().optional(),
    manualConflicts: z.number().int().optional(),
    existingRuleOverlap: z.number().int().optional(),
  })
  .passthrough();

export const ManualCategorizedExamplesOutputSchema = z
  .object({
    transactions: z.array(z.unknown()),
  })
  .passthrough();

export const RuleCandidatePatternsOutputSchema = z
  .object({
    filters: z
      .object({
        fields: z.array(z.string()),
        minAgreement: z.number(),
        maxConflictRate: z.number(),
        limit: z.number(),
      })
      .passthrough(),
    candidates: z.array(z.unknown()),
  })
  .passthrough();

export const CategorizationRuleDraftPreviewOutputSchema =
  CategorizationPreviewCountsSchema.extend({
    transactions: z.array(z.unknown()),
    normalizedDraft: z
      .object({
        targetCategoryId: z.string().uuid(),
        priority: z.number().int().optional(),
        conditions: z.array(z.unknown()),
      })
      .passthrough(),
    previewToken: z.string(),
  }).passthrough();

export const CreateCategorizationRuleOutputSchema = z
  .object({
    rule: z.unknown(),
  })
  .passthrough();

export const CategorizationRuleApplicationPreviewOutputSchema =
  CategorizationPreviewCountsSchema.extend({
    transactions: z.array(z.unknown()),
    previewToken: z.string(),
  }).passthrough();

export const ApplyCategorizationRuleOutputSchema =
  CategorizationPreviewCountsSchema;

export const CashflowAnalysisOutputSchema = z
  .object({
    startDate: DateStringSchema,
    endDate: DateStringSchema,
    currency: z.string(),
    totals: z
      .object({
        totalInflow: McpMoneySchema,
        totalOutflow: McpMoneySchema,
        netFlow: McpMoneySchema,
        uncategorizedInflow: McpMoneySchema,
        uncategorizedOutflow: McpMoneySchema,
      })
      .passthrough(),
    inflows: z.array(z.unknown()),
    outflows: z.array(z.unknown()),
  })
  .passthrough();

const CashFlowCategoryAggregateSchema = z
  .object({
    primaryCategory: z.string(),
    totalAmount: McpMoneySchema,
    currency: z.string(),
    transactionCount: z.number().int().nonnegative(),
    color: z.string(),
  })
  .strict();

const CashFlowPresentationAnalysisSchema = CashflowAnalysisOutputSchema.extend({
  inflows: z.array(CashFlowCategoryAggregateSchema),
  outflows: z.array(CashFlowCategoryAggregateSchema),
}).strict();

export const CashFlowAdjustmentSummarySchema = z
  .object({
    affected: z.boolean(),
    excludedTransactionCount: z.number().int().nonnegative(),
    neutralizedPairCount: z.number().int().nonnegative(),
  })
  .strict();
export type CashFlowAdjustmentSummary = z.infer<
  typeof CashFlowAdjustmentSummarySchema
>;

export const CashFlowPeriodSchema = z
  .object({
    analysis: CashFlowPresentationAnalysisSchema,
    adjustments: CashFlowAdjustmentSummarySchema,
  })
  .strict();
export type CashFlowPeriod = z.infer<typeof CashFlowPeriodSchema>;

export const CashFlowVisualizationDataSchema = z
  .object({
    presentation: z
      .object({
        direction: z.enum(['outflow', 'inflow']),
        focusCategoryPrimary: z.string().optional(),
      })
      .strict(),
    current: CashFlowPeriodSchema,
    comparison: CashFlowPeriodSchema.optional(),
  })
  .strict();
export type CashFlowVisualizationData = z.infer<
  typeof CashFlowVisualizationDataSchema
>;

export const CashFlowVisualizationOutputSchema = z
  .object({
    app: z
      .object({
        id: z.literal('cash_flow'),
        title: z.literal('Cash Flow'),
        description: z.string(),
        resourceName: z.string(),
        resourceUri: z.literal('ui://splice/cash-flow/v3.html'),
        initialToolName: z.literal('visualize_cash_flow'),
      })
      .strict(),
    data: CashFlowVisualizationDataSchema,
    fallback: z.string(),
  })
  .strict();
export type CashFlowVisualizationOutput = z.infer<
  typeof CashFlowVisualizationOutputSchema
>;

export const CashflowCategoryTransactionsOutputSchema = z
  .object({
    data: z.array(z.unknown()),
    query: McpQuerySchema,
  })
  .passthrough();

export const CashflowAuditOutputSchema = z
  .object({
    rows: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const AppToolOutputSchema = z
  .object({
    app: z
      .object({
        id: z.string(),
        title: z.string(),
        resourceUri: z.string(),
      })
      .passthrough(),
    data: z.unknown().optional(),
    fallback: z.string(),
  })
  .passthrough();

export const ProjectionAssumptionsOutputSchema = z
  .object({
    source: z.enum(['elicited', 'fallback']),
    assumptions: z.unknown().optional(),
    inputRequired: z.unknown().optional(),
  })
  .passthrough();
