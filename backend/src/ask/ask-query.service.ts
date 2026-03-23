import { Injectable } from '@nestjs/common';
import { AccountType } from 'plaid';
import { AccountService } from '../account/account.service';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import { TransactionService } from '../transaction/transaction.service';
import type {
  AskAccountsSnapshotResult,
  AskComparePeriodsOptions,
  AskComparePeriodsResult,
  AskTransactionSearchOptions,
  AskTransactionSearchResult,
  AskTransactionSummaryOptions,
  AskTransactionSummaryResult,
} from './ask.types';

@Injectable()
export class AskQueryService {
  constructor(
    private readonly accountService: AccountService,
    private readonly transactionService: TransactionService,
    private readonly currencyConversionService: CurrencyConversionService,
  ) {}

  private classifyAccount(type: string): 'cash' | 'credit' | 'investment' | 'liability' {
    switch (type) {
      case AccountType.Credit:
        return 'credit';
      case AccountType.Investment:
      case AccountType.Brokerage:
        return 'investment';
      case AccountType.Loan:
      case AccountType.Other:
        return 'liability';
      default:
        return 'cash';
    }
  }

  async getAccountsSnapshot(userId: string): Promise<AskAccountsSnapshotResult> {
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
    void this.currencyConversionService.getPreferredCurrency(userId);
    return this.transactionService.summarizeForAsk(userId, options);
  }

  async comparePeriods(
    userId: string,
    options: AskComparePeriodsOptions,
  ): Promise<AskComparePeriodsResult> {
    void this.currencyConversionService.getPreferredCurrency(userId);
    return this.transactionService.compareForAsk(userId, options);
  }
}
