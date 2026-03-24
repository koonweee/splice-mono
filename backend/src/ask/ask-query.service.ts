import { Injectable } from '@nestjs/common';
import { AccountService } from '../account/account.service';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import { TransactionService } from '../transaction/transaction.service';
import type {
  AskAccountsSnapshotResult,
  AskComparePeriodsOptions,
  AskTransactionSearchOptions,
  AskTransactionSearchResult,
  AskTransactionSummaryOptions,
  AskEvidenceAggregate,
} from './ask.types';

interface LegacyAskRecurringTransaction {
  merchantName: string;
  cadence: 'monthly' | 'weekly' | 'unknown';
  amount: number;
  currency: string;
}

interface LegacyAskTransactionSummaryResult {
  totalInflow: number;
  totalOutflow: number;
  net: number;
  transactionCount: number;
  topCategories: AskEvidenceAggregate[];
  topMerchants: AskEvidenceAggregate[];
  topAccounts: AskEvidenceAggregate[];
  recurringTransactions: LegacyAskRecurringTransaction[];
  matchedCount: number;
  truncated: boolean;
}

interface LegacyAskComparePeriodsResult {
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

@Injectable()
export class AskQueryService {
  constructor(
    private readonly accountService: AccountService,
    private readonly transactionService: TransactionService,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {}

  private classifyAccount(
    type: string,
  ): 'cash' | 'credit' | 'investment' | 'liability' {
    switch (type.toLowerCase()) {
      case 'credit':
        return 'credit';
      case 'investment':
      case 'brokerage':
        return 'investment';
      case 'loan':
      case 'other':
        return 'liability';
      default:
        return 'cash';
    }
  }

  private ensureRecurringTransactionCurrencies(
    summary: LegacyAskTransactionSummaryResult,
    preferredCurrency: string,
  ): LegacyAskTransactionSummaryResult {
    const aggregateCurrency =
      summary.topCategories[0]?.currency ??
      summary.topMerchants[0]?.currency ??
      summary.topAccounts[0]?.currency ??
      preferredCurrency;

    return {
      ...summary,
      recurringTransactions: summary.recurringTransactions.map(
        (transaction) => ({
          ...transaction,
          currency: transaction.currency ?? aggregateCurrency,
        }),
      ),
    };
  }

  async getAccountsSnapshot(
    userId: string,
  ): Promise<AskAccountsSnapshotResult> {
    const accounts = await this.accountService.findAll(userId);

    return {
      matchedCount: accounts.length,
      truncated: false,
      accounts: accounts.slice(0, 10).map((account) => ({
        id: account.id,
        displayName: account.customName ?? account.name ?? 'Account',
        institutionName: account.bankLink?.institutionName ?? null,
        grouping: this.classifyAccount(String(account.type)),
        balance: account.currentBalance,
      })),
    };
  }

  async searchTransactions(
    userId: string,
    options: AskTransactionSearchOptions,
  ): Promise<AskTransactionSearchResult> {
    void this.currencyConversionService.getPreferredCurrency(userId);
    return this.transactionService.findForAsk(userId, options);
  }

  async summarizeTransactions(
    userId: string,
    options: AskTransactionSummaryOptions,
  ): Promise<LegacyAskTransactionSummaryResult> {
    const preferredCurrency =
      await this.currencyConversionService.getPreferredCurrency(userId);
    const summary = await this.transactionService.summarizeForAsk(
      userId,
      options,
    );
    return this.ensureRecurringTransactionCurrencies(
      summary,
      preferredCurrency,
    );
  }

  async comparePeriods(
    userId: string,
    options: AskComparePeriodsOptions,
  ): Promise<LegacyAskComparePeriodsResult> {
    void this.currencyConversionService.getPreferredCurrency(userId);
    return this.transactionService.compareForAsk(userId, options);
  }
}
