import { Injectable } from '@nestjs/common';
import { AccountsSurfaceService } from '../account/accounts-surface.service';
import { BalanceHistorySurfaceService } from '../balance-query/balance-history-surface.service';
import { CashflowAnalysisSurfaceService } from '../transaction-analysis/cashflow-analysis-surface.service';
import { TransactionsSurfaceService } from '../transaction/transactions-surface.service';
import type {
  AskBalanceHistoryOptions,
  AskCashflowAnalysisOptions,
  AskCashflowAnalysisResult,
  AskTransactionSearchOptions,
} from './ask.types';

@Injectable()
export class AskQueryService {
  constructor(
    private readonly accountsSurfaceService: AccountsSurfaceService,
    private readonly balanceHistorySurfaceService: BalanceHistorySurfaceService,
    private readonly transactionsSurfaceService: TransactionsSurfaceService,
    private readonly cashflowAnalysisSurfaceService: CashflowAnalysisSurfaceService,
  ) {}

  async getAccountsSnapshot(userId: string) {
    return this.accountsSurfaceService.getAccountsSnapshot(userId);
  }

  async getBalanceHistory(userId: string, options: AskBalanceHistoryOptions) {
    return this.balanceHistorySurfaceService.getBalanceHistorySummary(
      userId,
      options,
    );
  }

  async searchTransactions(
    userId: string,
    options: AskTransactionSearchOptions,
  ) {
    return this.transactionsSurfaceService.findForAsk(userId, options);
  }

  async getCashflowAnalysis(
    userId: string,
    options: AskCashflowAnalysisOptions,
  ): Promise<AskCashflowAnalysisResult> {
    return this.cashflowAnalysisSurfaceService.getCashflowAnalysis(
      userId,
      options,
    );
  }
}
