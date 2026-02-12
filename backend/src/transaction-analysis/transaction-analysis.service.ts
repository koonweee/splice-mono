import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from '../category/category.entity';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import { TransactionEntity } from '../transaction/transaction.entity';
import { MoneySign } from '../types/MoneyWithSign';
import type {
  CategoryAggregate,
  TransactionAnalysisResponse,
} from '../types/TransactionAnalysis';

interface RawAggregateRow {
  primary: string | null;
  amountSign: MoneySign;
  amountCurrency: string;
  totalAmount: string;
  count: string;
}

@Injectable()
export class TransactionAnalysisService {
  private readonly logger = new Logger(TransactionAnalysisService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(CategoryEntity)
    private categoryRepository: Repository<CategoryEntity>,
    private currencyConversionService: CurrencyConversionService,
  ) {}

  /**
   * Aggregate transactions by primary category and sign over a date range.
   * Excludes TRANSFER_IN and TRANSFER_OUT categories.
   * Converts all amounts to the user's preferred currency.
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

    // 2. Run aggregation query
    const rows: RawAggregateRow[] = await this.transactionRepository
      .createQueryBuilder('t')
      .select('c.primary', 'primary')
      .addSelect('t."amountSign"', 'amountSign')
      .addSelect('t."amountCurrency"', 'amountCurrency')
      .addSelect('SUM(t."amountAmount")', 'totalAmount')
      .addSelect('COUNT(*)::int', 'count')
      .leftJoin(CategoryEntity, 'c', 't."categoryId" = c.id')
      .where('t."userId" = :userId', { userId })
      .andWhere('t.date >= :startDate', { startDate })
      .andWhere('t.date <= :endDate', { endDate })
      .andWhere(
        '(c.primary IS NULL OR c.primary NOT IN (:...excludedCategories))',
        { excludedCategories: ['TRANSFER_IN', 'TRANSFER_OUT'] },
      )
      .groupBy('c.primary')
      .addGroupBy('t."amountSign"')
      .addGroupBy('t."amountCurrency"')
      .getRawMany();

    this.logger.log(
      { rowCount: rows.length, preferredCurrency },
      'Aggregation query complete',
    );

    // 3. Identify currencies that need conversion and fetch rates
    const foreignCurrencies = [
      ...new Set(
        rows
          .map((r) => r.amountCurrency)
          .filter((c) => c !== preferredCurrency),
      ),
    ];

    const rateMap = await this.currencyConversionService.getRateMap(
      foreignCurrencies,
      preferredCurrency,
      endDate,
    );

    // 4. Process rows: convert amounts and group by category+sign
    const inflowMap = new Map<string, { amount: number; count: number }>();
    const outflowMap = new Map<string, { amount: number; count: number }>();

    rows.forEach((row) => {
      const totalAmountSmallestUnit = parseInt(row.totalAmount, 10);
      const count = parseInt(row.count, 10);
      const category = row.primary ?? 'UNCATEGORIZED';

      // Convert to preferred currency if needed
      let convertedAmount = totalAmountSmallestUnit;
      if (row.amountCurrency !== preferredCurrency) {
        const rate = rateMap.get(row.amountCurrency);
        if (rate) {
          convertedAmount = this.currencyConversionService.convertAmount(
            totalAmountSmallestUnit,
            row.amountCurrency,
            preferredCurrency,
            rate,
          );
        }
      }

      const isInflow = row.amountSign === MoneySign.POSITIVE;
      const targetMap = isInflow ? inflowMap : outflowMap;

      const existing = targetMap.get(category);
      if (existing) {
        existing.amount += convertedAmount;
        existing.count += count;
      } else {
        targetMap.set(category, { amount: convertedAmount, count });
      }
    });

    // 5. Build response arrays, sorted by totalAmount descending
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

    // 6. Compute totals
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
}
