import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { TransactionSchema } from './Transaction';

/**
 * Query params for the transaction analysis endpoint
 */
export const TransactionAnalysisQuerySchema = registerSchema(
  'TransactionAnalysisQuery',
  z.object({
    /** Start date (YYYY-MM-DD, inclusive) */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    /** End date (YYYY-MM-DD, inclusive) */
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  }),
);
export type TransactionAnalysisQuery = z.infer<
  typeof TransactionAnalysisQuerySchema
>;

export const TransactionAnalysisTransactionsQuerySchema = registerSchema(
  'TransactionAnalysisTransactionsQuery',
  z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    categoryPrimary: z.string(),
    flowDirection: z.enum(['inflow', 'outflow']),
  }),
);
export type TransactionAnalysisTransactionsQuery = z.infer<
  typeof TransactionAnalysisTransactionsQuerySchema
>;

/**
 * Aggregated amount for a single primary category
 */
export const CategoryAggregateSchema = registerSchema(
  'CategoryAggregate',
  z.object({
    /** Primary category name (e.g., "FOOD_AND_DRINK") */
    primaryCategory: z.string(),
    /** Total amount in user's preferred currency (in smallest unit, e.g., cents) */
    totalAmount: z.number(),
    /** Currency code */
    currency: z.string(),
    /** Number of transactions in this category */
    transactionCount: z.number().int(),
  }),
);
export type CategoryAggregate = z.infer<typeof CategoryAggregateSchema>;

/**
 * Full response for the transaction analysis endpoint
 */
export const TransactionAnalysisResponseSchema = registerSchema(
  'TransactionAnalysisResponse',
  z.object({
    /** Start date of the analysis period */
    startDate: z.string(),
    /** End date of the analysis period */
    endDate: z.string(),
    /** Currency code for all amounts */
    currency: z.string(),
    /** Categories with net positive flow (income) */
    inflows: z.array(CategoryAggregateSchema),
    /** Categories with net negative flow (spending) */
    outflows: z.array(CategoryAggregateSchema),
    /** Total inflow amount (in smallest unit) */
    totalInflow: z.number(),
    /** Total outflow amount (in smallest unit) */
    totalOutflow: z.number(),
    /** Net flow = totalInflow - totalOutflow (in smallest unit) */
    netFlow: z.number(),
    /** Uncategorized inflow amount (in smallest unit) */
    uncategorizedInflow: z.number(),
    /** Uncategorized outflow amount (in smallest unit) */
    uncategorizedOutflow: z.number(),
  }),
);
export type TransactionAnalysisResponse = z.infer<
  typeof TransactionAnalysisResponseSchema
>;

export const TransactionAnalysisTransactionsResponseSchema = registerSchema(
  'TransactionAnalysisTransactionsResponse',
  z.array(TransactionSchema),
);
