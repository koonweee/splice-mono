import { Injectable } from '@nestjs/common';
import { AccountService } from '../account/account.service';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import { TransactionService } from '../transaction/transaction.service';
import type {
  AskAccountsSnapshotResult,
  AskComparePeriodsOptions,
  AskComparePeriodsResult,
  AskTransactionSummaryResult,
  AskTransactionSearchOptions,
  AskTransactionSearchResult,
  AskTransactionSummaryOptions,
} from './ask.types';

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
    summary: AskTransactionSummaryResult,
    preferredCurrency: string,
  ): AskTransactionSummaryResult {
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
  ): Promise<AskTransactionSummaryResult> {
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
  ): Promise<AskComparePeriodsResult> {
    void this.currencyConversionService.getPreferredCurrency(userId);
    return this.transactionService.compareForAsk(userId, options);
  }
}
