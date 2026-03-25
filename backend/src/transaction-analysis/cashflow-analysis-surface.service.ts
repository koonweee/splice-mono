import { Injectable } from '@nestjs/common';
import type {
  AskCashflowAnalysisResult,
  AskCashflowAnalysisOptions,
  AskEvidenceAggregate,
} from '../ask/ask.types';
import { getDecimalPlaces } from '../types/MoneyWithSign';
import type { TransactionAnalysisResponse } from '../types/TransactionAnalysis';
import { TransactionAnalysisService } from './transaction-analysis.service';

@Injectable()
export class CashflowAnalysisSurfaceService {
  constructor(
    private readonly transactionAnalysisService: TransactionAnalysisService,
  ) {}

  async getCashflowAnalysis(
    userId: string,
    options: AskCashflowAnalysisOptions,
  ): Promise<AskCashflowAnalysisResult> {
    const analysis = await this.transactionAnalysisService.getAnalysis(
      options.startDate,
      options.endDate,
      userId,
    );

    const topCategories = this.buildTopCategories(analysis);
    const matchedCount = [...analysis.inflows, ...analysis.outflows].reduce(
      (sum, category) => sum + category.transactionCount,
      0,
    );

    return {
      totalInflow: this.toMajorUnits(analysis.totalInflow, analysis.currency),
      totalOutflow: this.toMajorUnits(analysis.totalOutflow, analysis.currency),
      netFlow: this.toMajorUnits(analysis.netFlow, analysis.currency),
      topCategories,
      semanticMetadata: {
        pendingIncluded: false,
        reconciliationApplied: true,
        comparisonIncluded: false,
      },
      matchedCount,
      truncated: false,
    };
  }

  private buildTopCategories(
    analysis: TransactionAnalysisResponse,
  ): AskEvidenceAggregate[] {
    const categoryTotals = new Map<string, number>();

    [...analysis.inflows, ...analysis.outflows].forEach((category) => {
      categoryTotals.set(
        category.primaryCategory,
        (categoryTotals.get(category.primaryCategory) ?? 0) +
          category.totalAmount,
      );
    });

    return Array.from(categoryTotals.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([rawLabel, amount]) => ({
        rawLabel,
        label: this.formatCategoryLabel(rawLabel),
        amount: this.toMajorUnits(amount, analysis.currency),
        currency: analysis.currency,
        kind: 'category' as const,
      }));
  }

  private formatCategoryLabel(rawLabel: string): string {
    return rawLabel
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private toMajorUnits(amount: number, currency: string): number {
    const decimals = getDecimalPlaces(currency);
    return Number((amount / Math.pow(10, decimals)).toFixed(decimals));
  }
}
