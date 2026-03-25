import { z } from 'zod';
import type { BalanceHistorySurfaceSummary } from '../balance-query/balance-history-surface.service';
import {
  MoneyWithSignSchema,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';

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

export const AskEvidenceBalanceHistoryPointSchema = z.object({
  date: z.string(),
  accountId: z.string(),
  accountName: z.string(),
  balance: MoneyWithSignSchema,
});

export const AskSemanticMetadataSchema = z.object({
  pendingIncluded: z.boolean().default(false),
  reconciliationApplied: z.boolean().default(false),
  comparisonIncluded: z.boolean().default(false),
});

export const AskEvidenceBalanceHistorySummarySchema = z.object({
  matchedCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  currentTotal: MoneyWithSignSchema,
  previousTotal: MoneyWithSignSchema.optional(),
  deltaPercent: z.number().optional(),
  pointCount: z.number().int().nonnegative(),
  semanticMetadata: AskSemanticMetadataSchema,
});

export const AskEvidenceAggregateSchema = z.object({
  label: z.string(),
  rawLabel: z.string().optional(),
  amount: z.number().describe('Amount in major currency units (e.g. dollars).'),
  currency: z.string(),
  kind: z.enum(['category', 'merchant', 'account', 'summary']),
});

export const AskEvidenceSchema = z.object({
  accounts: z.array(AskEvidenceAccountSchema).default([]),
  transactions: z.array(AskEvidenceTransactionSchema).default([]),
  balanceHistory: AskEvidenceBalanceHistorySummarySchema.optional(),
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
export type AskEvidenceBalanceHistoryPoint = z.infer<
  typeof AskEvidenceBalanceHistoryPointSchema
>;
export type AskSemanticMetadata = z.infer<typeof AskSemanticMetadataSchema>;
export type AskEvidenceBalanceHistorySummary = z.infer<
  typeof AskEvidenceBalanceHistorySummarySchema
>;
export type AskEvidenceAggregate = z.infer<typeof AskEvidenceAggregateSchema>;
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

export interface AskBalanceHistoryOptions {
  startDate: string;
  endDate: string;
  accountIds?: string[];
}

export type AskBalanceHistoryResult = BalanceHistorySurfaceSummary;

export interface AskCashflowAnalysisOptions {
  startDate: string;
  endDate: string;
}

export interface AskTransactionSummaryOptions {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  includePending?: boolean;
  recurringOnly?: boolean;
}

export interface AskCashflowAnalysisResult {
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  topCategories: AskEvidenceAggregate[];
  semanticMetadata: AskSemanticMetadata;
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

export interface AskAccountsSnapshotResult {
  matchedCount: number;
  truncated: boolean;
  accounts: AskEvidenceAccount[];
}
