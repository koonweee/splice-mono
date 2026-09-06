import type { SerializedMoneyWithSign } from '../types/MoneyWithSign';

export interface TransactionSurfaceSearchOptions {
  startDate?: string;
  endDate?: string;
  accountIds?: string[];
  categoryPrimary?: string;
  merchantQuery?: string;
  minAmount?: string;
  maxAmount?: string;
  sign?: 'positive' | 'negative';
  includePending?: boolean;
  limit?: number;
}

export interface TransactionSurfaceSearchTransaction {
  id: string;
  accountId: string;
  accountName: string;
  merchantName: string | null;
  pending: boolean;
  activityDate: string;
  reportingDateOverride: string | null;
  providerDate: string;
  categoryPrimary: string | null;
  amount: SerializedMoneyWithSign;
}

export interface TransactionSurfaceSearchResult {
  matchedCount: number;
  truncated: boolean;
  transactions: TransactionSurfaceSearchTransaction[];
}
