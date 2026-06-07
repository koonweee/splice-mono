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
