import { Injectable } from '@nestjs/common';
import { CashFlowQueryService } from './cash-flow-query.service';

/** HTTP and MCP adapters share one scoped report pipeline; combined callers reuse getReport. */
@Injectable()
export class TransactionAnalysisService {
  constructor(private readonly cashFlowQueryService: CashFlowQueryService) {}

  getReport(startDate: string, endDate: string, userId: string) {
    return this.cashFlowQueryService.report(userId, startDate, endDate);
  }

  async getAnalysis(startDate: string, endDate: string, userId: string) {
    return (await this.getReport(startDate, endDate, userId)).summary;
  }

  async getAnalysisAudit(startDate: string, endDate: string, userId: string) {
    return (await this.getReport(startDate, endDate, userId)).audit;
  }

  async getCategoryTransactions(
    startDate: string,
    endDate: string,
    categoryPrimary: string,
    flowDirection: 'inflow' | 'outflow',
    userId: string,
  ) {
    const report = await this.getReport(startDate, endDate, userId);
    return this.cashFlowQueryService.categoryTransactions(
      report,
      categoryPrimary,
      flowDirection,
    );
  }
}
