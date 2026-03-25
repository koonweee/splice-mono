import { Injectable } from '@nestjs/common';
import type {
  AskEvidenceTransaction,
  AskTransactionSearchOptions,
  AskTransactionSearchResult,
} from '../ask/ask.types';
import { TransactionService } from './transaction.service';

export interface TransactionsSurfaceTransaction extends AskEvidenceTransaction {
  categoryPrimaryLabel: string;
}

export interface TransactionsSurfaceResult {
  matchedCount: number;
  truncated: boolean;
  transactions: TransactionsSurfaceTransaction[];
}

@Injectable()
export class TransactionsSurfaceService {
  constructor(private readonly transactionService: TransactionService) {}

  async findForAsk(
    userId: string,
    options: AskTransactionSearchOptions,
  ): Promise<TransactionsSurfaceResult> {
    const result: AskTransactionSearchResult =
      await this.transactionService.findForAsk(userId, options);

    return {
      matchedCount: result.matchedCount,
      truncated: result.truncated,
      transactions: result.transactions.map((transaction) => ({
        ...transaction,
        categoryPrimaryLabel: this.formatCategoryPrimaryLabel(
          transaction.categoryPrimary,
        ),
      })),
    };
  }

  private formatCategoryPrimaryLabel(categoryPrimary: string | null): string {
    const rawLabel = categoryPrimary ?? 'UNCATEGORIZED';

    return rawLabel
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}
