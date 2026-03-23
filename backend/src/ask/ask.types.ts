import { z } from 'zod';
import { MoneyWithSignSchema } from '../types/MoneyWithSign';

export const AskConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const AskQueryScopeSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  comparisonStartDate: z.string().optional(),
  comparisonEndDate: z.string().optional(),
  accountIds: z.array(z.string()).default([]),
  includePending: z.boolean().default(false),
  truncated: z.boolean().default(false),
});

export const AskEvidenceAccountSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  institutionName: z.string().nullable(),
  grouping: z.enum(['cash', 'credit', 'investment', 'liability']),
  balance: MoneyWithSignSchema,
});

export const AskEvidenceTransactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  merchantName: z.string().nullable(),
  pending: z.boolean(),
  date: z.string(),
  categoryPrimary: z.string().nullable(),
  amount: MoneyWithSignSchema,
  convertedAmount: MoneyWithSignSchema.optional(),
});

export const AskEvidenceAggregateSchema = z.object({
  label: z.string(),
  amount: z.number(),
  currency: z.string(),
  kind: z.enum(['category', 'merchant', 'account', 'summary']),
});

export const AskEvidenceSchema = z.object({
  accounts: z.array(AskEvidenceAccountSchema).default([]),
  transactions: z.array(AskEvidenceTransactionSchema).default([]),
  aggregates: z.array(AskEvidenceAggregateSchema).default([]),
  matchedCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export const AskAnswerSchema = z.object({
  answerText: z.string(),
  confidence: AskConfidenceSchema,
  queryScope: AskQueryScopeSchema,
  evidence: AskEvidenceSchema,
  followups: z.array(z.string()).default([]),
});

export type AskConfidence = z.infer<typeof AskConfidenceSchema>;
export type AskQueryScope = z.infer<typeof AskQueryScopeSchema>;
export type AskEvidenceAccount = z.infer<typeof AskEvidenceAccountSchema>;
export type AskEvidenceTransaction = z.infer<
  typeof AskEvidenceTransactionSchema
>;
export type AskEvidenceAggregate = z.infer<
  typeof AskEvidenceAggregateSchema
>;
export type AskEvidence = z.infer<typeof AskEvidenceSchema>;
export type AskAnswer = z.infer<typeof AskAnswerSchema>;

export interface AskTransactionSearchOptions {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  categoryPrimary?: string;
  merchantQuery?: string;
  minAmount?: number;
  maxAmount?: number;
  sign?: 'positive' | 'negative';
  includePending?: boolean;
  limit?: number;
}

export interface AskTransactionSearchResult {
  matchedCount: number;
  truncated: boolean;
  transactions: AskEvidenceTransaction[];
}

export interface AskTransactionSummaryOptions {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  includePending?: boolean;
  recurringOnly?: boolean;
}

export interface AskRecurringTransaction {
  merchantName: string;
  cadence: 'monthly' | 'weekly' | 'unknown';
  amount: number;
}

export interface AskTransactionSummaryResult {
  totalInflow: number;
  totalOutflow: number;
  net: number;
  transactionCount: number;
  topCategories: AskEvidenceAggregate[];
  topMerchants: AskEvidenceAggregate[];
  topAccounts: AskEvidenceAggregate[];
  recurringTransactions: AskRecurringTransaction[];
  matchedCount: number;
  truncated: boolean;
}

export interface AskComparePeriodsOptions {
  currentStartDate: string;
  currentEndDate: string;
  previousStartDate: string;
  previousEndDate: string;
  accountIds?: string[];
  includePending?: boolean;
}

export interface AskComparePeriodsResult {
  currentTotalOutflow: number;
  previousTotalOutflow: number;
  absoluteDelta: number;
  percentDelta: number;
  categoryDrivers: AskEvidenceAggregate[];
  merchantDrivers: AskEvidenceAggregate[];
  accountDrivers: AskEvidenceAggregate[];
  matchedCount: number;
  truncated: boolean;
}

export interface AskAccountsSnapshotResult {
  matchedCount: number;
  truncated: boolean;
  accounts: AskEvidenceAccount[];
}
