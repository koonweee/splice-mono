import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import { TransactionEntity } from '../transaction/transaction.entity';
import { MoneySign } from '../types/MoneyWithSign';
import type {
  CategoryAggregate,
  TransactionAnalysisResponse,
} from '../types/TransactionAnalysis';

interface CategoryCurrencyAggregate {
  amount: number;
  count: number;
}

@Injectable()
export class TransactionAnalysisService {
  private readonly logger = new Logger(TransactionAnalysisService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private transactionRepository: Repository<TransactionEntity>,
    private currencyConversionService: CurrencyConversionService,
  ) {}

  /**
   * Aggregate unmatched posted transactions by primary category and sign over
   * a date range, converting totals into the user's preferred currency.
   */
  async getAnalysis(
    startDate: string,
    endDate: string,
    userId: string,
  ): Promise<TransactionAnalysisResponse> {
    this.logger.log(
      { startDate, endDate, userId },
      'Getting transaction analysis',
    );

    // 1. Get user's preferred currency
    const preferredCurrency =
      await this.currencyConversionService.getPreferredCurrency(userId);

    // 2. Load posted transactions in the requested window and neutralize exact
    // equal-opposite pairs before any category aggregation.
    const transactions = await this.transactionRepository.find({
      where: {
        userId,
        pending: false,
        date: Between(startDate, endDate),
      },
      relations: ['category'],
    });
    const unmatchedTransactions = this.neutralizeTransactions(transactions);

    this.logger.log(
      {
        transactionCount: transactions.length,
        unmatchedTransactionCount: unmatchedTransactions.length,
        preferredCurrency,
      },
      'Posted transaction analysis rows loaded',
    );

    // 3. Identify currencies that need conversion and fetch rates
    const foreignCurrencies = [
      ...new Set(
        unmatchedTransactions
          .map((transaction) => transaction.amount.currency)
          .filter((c) => c !== preferredCurrency),
      ),
    ];

    const rateMap = await this.currencyConversionService.getRateMap(
      foreignCurrencies,
      preferredCurrency,
      endDate,
    );

    // 4. Aggregate unmatched transactions by category, sign, and currency.
    const aggregates = new Map<
      string,
      { inflow: Map<string, CategoryCurrencyAggregate>; outflow: Map<string, CategoryCurrencyAggregate> }
    >();

    unmatchedTransactions.forEach((transaction) => {
      const category = transaction.category?.primary ?? 'UNCATEGORIZED';
      const currency = transaction.amount.currency;
      const amount = this.getAmountInSmallestUnit(transaction);
      const isInflow = transaction.amount.sign === MoneySign.POSITIVE;
      const entry = aggregates.get(category) ?? {
        inflow: new Map<string, CategoryCurrencyAggregate>(),
        outflow: new Map<string, CategoryCurrencyAggregate>(),
      };
      const currencyMap = isInflow ? entry.inflow : entry.outflow;
      const aggregate = currencyMap.get(currency);

      if (aggregate) {
        aggregate.amount += amount;
        aggregate.count += 1;
      } else {
        currencyMap.set(currency, { amount, count: 1 });
      }

      aggregates.set(category, entry);
    });

    // 5. Convert aggregated totals to the preferred currency and group by category.
    const inflowMap = new Map<string, { amount: number; count: number }>();
    const outflowMap = new Map<string, { amount: number; count: number }>();

    aggregates.forEach(({ inflow, outflow }, category) => {
      this.appendConvertedCategoryTotals(
        category,
        inflow,
        inflowMap,
        preferredCurrency,
        rateMap,
      );
      this.appendConvertedCategoryTotals(
        category,
        outflow,
        outflowMap,
        preferredCurrency,
        rateMap,
      );
    });

    // 6. Build response arrays, sorted by totalAmount descending
    const inflows: CategoryAggregate[] = Array.from(inflowMap.entries())
      .map(([primaryCategory, { amount, count }]) => ({
        primaryCategory,
        totalAmount: amount,
        currency: preferredCurrency,
        transactionCount: count,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const outflows: CategoryAggregate[] = Array.from(outflowMap.entries())
      .map(([primaryCategory, { amount, count }]) => ({
        primaryCategory,
        totalAmount: amount,
        currency: preferredCurrency,
        transactionCount: count,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    // 7. Compute totals
    const totalInflow = inflows.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalOutflow = outflows.reduce((sum, c) => sum + c.totalAmount, 0);

    const uncategorizedInflow = inflowMap.get('UNCATEGORIZED')?.amount ?? 0;
    const uncategorizedOutflow = outflowMap.get('UNCATEGORIZED')?.amount ?? 0;

    return {
      startDate,
      endDate,
      currency: preferredCurrency,
      inflows,
      outflows,
      totalInflow,
      totalOutflow,
      netFlow: totalInflow - totalOutflow,
      uncategorizedInflow,
      uncategorizedOutflow,
    };
  }

  private neutralizeTransactions(
    transactions: TransactionEntity[],
  ): TransactionEntity[] {
    const buckets = new Map<
      string,
      { positives: TransactionEntity[]; negatives: TransactionEntity[] }
    >();

    transactions.forEach((transaction) => {
      const key = this.getBucketKey(transaction);
      const bucket = buckets.get(key) ?? { positives: [], negatives: [] };
      if (transaction.amount.sign === MoneySign.POSITIVE) {
        bucket.positives.push(transaction);
      } else {
        bucket.negatives.push(transaction);
      }
      buckets.set(key, bucket);
    });

    const unmatchedTransactions: TransactionEntity[] = [];

    Array.from(buckets.entries())
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .forEach(([, bucket]) => {
        const positives = bucket.positives;
        const negatives = bucket.negatives;
        const matchedPositiveIds = new Set<string>();
        const matchedNegativeIds = new Set<string>();

        negatives.forEach((negative) => {
          const match = positives
            .filter((positive) => !matchedPositiveIds.has(positive.id))
            .sort((left, right) =>
              this.comparePositiveMatchCandidates(negative, left, right),
            )[0];

          if (!match) {
            return;
          }

          matchedPositiveIds.add(match.id);
          matchedNegativeIds.add(negative.id);
        });

        positives.forEach((positive) => {
          if (!matchedPositiveIds.has(positive.id)) {
            unmatchedTransactions.push(positive);
          }
        });
        negatives.forEach((negative) => {
          if (!matchedNegativeIds.has(negative.id)) {
            unmatchedTransactions.push(negative);
          }
        });
      });

    return unmatchedTransactions;
  }

  private appendConvertedCategoryTotals(
    category: string,
    totalsByCurrency: Map<string, CategoryCurrencyAggregate>,
    targetMap: Map<string, { amount: number; count: number }>,
    preferredCurrency: string,
    rateMap: Map<string, number>,
  ): void {
    let totalAmount = 0;
    let totalCount = 0;

    totalsByCurrency.forEach(({ amount, count }, currency) => {
      totalAmount += this.convertAmountToPreferredCurrency(
        amount,
        currency,
        preferredCurrency,
        rateMap,
      );
      totalCount += count;
    });

    if (totalCount === 0) {
      return;
    }

    targetMap.set(category, { amount: totalAmount, count: totalCount });
  }

  private convertAmountToPreferredCurrency(
    amount: number,
    sourceCurrency: string,
    preferredCurrency: string,
    rateMap: Map<string, number>,
  ): number {
    if (sourceCurrency === preferredCurrency) {
      return amount;
    }

    const rate = rateMap.get(sourceCurrency);
    if (!rate) {
      return amount;
    }

    return this.currencyConversionService.convertAmount(
      amount,
      sourceCurrency,
      preferredCurrency,
      rate,
    );
  }

  private getBucketKey(transaction: TransactionEntity): string {
    return `${transaction.amount.currency}:${this.getAmountInSmallestUnit(transaction)}`;
  }

  private getAmountInSmallestUnit(transaction: TransactionEntity): number {
    return typeof transaction.amount.amount === 'string'
      ? parseInt(transaction.amount.amount, 10)
      : transaction.amount.amount;
  }

  private compareTransactions(
    left: TransactionEntity,
    right: TransactionEntity,
  ): number {
    const dateComparison = left.date.localeCompare(right.date);
    if (dateComparison !== 0) {
      return dateComparison;
    }

    return left.id.localeCompare(right.id);
  }

  private comparePositiveMatchCandidates(
    negative: TransactionEntity,
    left: TransactionEntity,
    right: TransactionEntity,
  ): number {
    const differenceComparison =
      this.getAbsoluteDateDifferenceInDays(negative.date, left.date) -
      this.getAbsoluteDateDifferenceInDays(negative.date, right.date);
    if (differenceComparison !== 0) {
      return differenceComparison;
    }

    return this.compareTransactions(left, right);
  }

  private getAbsoluteDateDifferenceInDays(
    leftDate: string,
    rightDate: string,
  ): number {
    const leftTimestamp = Date.parse(`${leftDate}T00:00:00Z`);
    const rightTimestamp = Date.parse(`${rightDate}T00:00:00Z`);
    return Math.abs(leftTimestamp - rightTimestamp);
  }
}
