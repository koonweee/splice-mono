import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { AnalysisRuleEntity } from '../analysis-rule/analysis-rule.entity';
import { AnalysisRuleService } from '../analysis-rule/analysis-rule.service';
import { UNCATEGORIZED_CATEGORY_COLOR } from '../category/category-color';
import { canonicalMinorUnits, compareMinorUnits } from '../common/exact-money';
import { assertDateRange } from '../common/query-bounds';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import { fxRequestKey } from '../currency-exchange/currency-exchange.service';
import { TransactionQueryService } from '../transaction/transaction-query.service';
import { getTransactionActivityDate } from '../transaction/transaction-date';
import type { TransactionEntity } from '../transaction/transaction.entity';
import { MoneySign } from '../types/MoneyWithSign';
import type { Transaction } from '../types/Transaction';
import type {
  CategoryAggregate,
  TransactionAnalysisAuditResponse,
  TransactionAnalysisResponse,
} from '../types/TransactionAnalysis';
import { UserEntity } from '../user/user.entity';
import { CashFlowRuleEvaluator } from './cash-flow-rules';

export type EvaluatedCashFlowTransaction = {
  transaction: TransactionEntity;
  convertedMinorUnits: string;
};
export type CashFlowReport = {
  summary: TransactionAnalysisResponse;
  audit: TransactionAnalysisAuditResponse;
  /** Request-local rows retained only for deriving a drilldown; never return this context as an API payload. */
  evaluatedTransactions: readonly EvaluatedCashFlowTransaction[];
};

@Injectable()
export class CashFlowQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly transactionQueryService: TransactionQueryService,
    private readonly currencyConversionService: CurrencyConversionService,
    private readonly analysisRuleService: AnalysisRuleService,
  ) {}

  async report(
    userId: string,
    startDate: string,
    endDate: string,
    reportingCurrency?: string,
  ): Promise<CashFlowReport> {
    assertDateRange(startDate, endDate, { maxDays: 10000 });
    // Release the SQL snapshot before matching, aggregation and serialization.
    const input = await this.dataSource.transaction(
      'REPEATABLE READ',
      async (manager) => {
        const user = await manager.getRepository(UserEntity).findOne({
          where: { id: userId },
          select: { id: true, settings: true },
        });
        if (!user) throw new NotFoundException('User not found');
        const lookaroundDays = user.settings.neutralizationLookaroundDays ?? 60;
        const shift = (date: string, days: number) => {
          const value = new Date(`${date}T00:00:00Z`);
          value.setUTCDate(value.getUTCDate() + days);
          return value.toISOString().slice(0, 10);
        };
        const candidateStartDate = shift(startDate, -lookaroundDays);
        const candidateEndDate = shift(endDate, lookaroundDays);
        assertDateRange(candidateStartDate, candidateEndDate);
        const [transactions, rules] = await Promise.all([
          this.transactionQueryService.readAnalysis(
            userId,
            candidateStartDate,
            candidateEndDate,
            manager,
          ),
          manager.getRepository(AnalysisRuleEntity).find({
            where: { userId, archivedAt: IsNull() },
            order: { createdAt: 'ASC', id: 'ASC' },
          }),
        ]);
        const currency = reportingCurrency ?? user.settings.currency ?? 'USD';
        // Read optional candidate coverage in the same snapshot. Excluded rows need no quote.
        const requests = transactions
          .filter((transaction) => {
            const date = getTransactionActivityDate(transaction);
            return (
              date >= startDate &&
              date <= endDate &&
              transaction.amount.currency !== currency &&
              transaction.amount.amount !== '0'
            );
          })
          .map((transaction) => ({
            baseCurrency: transaction.amount.currency,
            targetCurrency: currency,
            requestedDate: getTransactionActivityDate(transaction),
          }));
        const rates = await this.currencyConversionService.getResolvedRates(
          requests,
          manager,
          { allowMissing: true },
        );
        return {
          transactions,
          rules,
          lookaroundDays,
          currency,
          rates,
        };
      },
    );
    const evaluated = new CashFlowRuleEvaluator(
      this.analysisRuleService,
    ).evaluate(input.transactions, input.rules, startDate, endDate);
    const evaluatedTransactions = evaluated.remainingReportTransactions.map(
      (transaction): EvaluatedCashFlowTransaction => {
        const amount = canonicalMinorUnits(transaction.amount.amount);
        if (transaction.amount.currency === input.currency || amount === '0')
          return { transaction, convertedMinorUnits: amount };
        const key = fxRequestKey({
          baseCurrency: transaction.amount.currency,
          targetCurrency: input.currency,
          requestedDate: getTransactionActivityDate(transaction),
        });
        const rate = input.rates.get(key);
        if (!rate)
          throw new ServiceUnavailableException(
            `Required exchange rate is unavailable for ${transaction.amount.currency} to ${input.currency}`,
          );
        return {
          transaction,
          convertedMinorUnits: this.currencyConversionService.convertAmount(
            amount,
            transaction.amount.currency,
            input.currency,
            rate.ratio,
          ),
        };
      },
    );
    return {
      summary: this.summarize(
        startDate,
        endDate,
        input.currency,
        evaluatedTransactions,
      ),
      audit: {
        startDate,
        endDate,
        neutralizationLookaroundDays: input.lookaroundDays,
        rows: evaluated.auditRows,
      },
      evaluatedTransactions,
    };
  }

  categoryTransactions(
    report: CashFlowReport,
    categoryPrimary: string,
    direction: 'inflow' | 'outflow',
  ): Transaction[] {
    return report.evaluatedTransactions
      .filter(
        ({ transaction }) =>
          (transaction.category?.primary ?? 'UNCATEGORIZED') ===
            categoryPrimary &&
          transaction.amount.sign ===
            (direction === 'inflow' ? MoneySign.POSITIVE : MoneySign.NEGATIVE),
      )
      .sort(
        (left, right) =>
          getTransactionActivityDate(right.transaction).localeCompare(
            getTransactionActivityDate(left.transaction),
          ) || right.transaction.id.localeCompare(left.transaction.id),
      )
      .map(({ transaction, convertedMinorUnits }) => {
        const result = transaction.toObject();
        if (transaction.amount.currency === report.summary.currency)
          return result;
        return {
          ...result,
          convertedAmount: {
            money: {
              currency: report.summary.currency,
              amount: convertedMinorUnits,
            },
            sign: transaction.amount.sign,
          },
        };
      });
  }

  private summarize(
    startDate: string,
    endDate: string,
    currency: string,
    rows: readonly EvaluatedCashFlowTransaction[],
  ): TransactionAnalysisResponse {
    type Aggregate = {
      amount: bigint;
      count: number;
      colors: Map<string, bigint>;
    };
    const inflows = new Map<string, Aggregate>();
    const outflows = new Map<string, Aggregate>();
    for (const { transaction, convertedMinorUnits } of rows) {
      const primary = transaction.category?.primary ?? 'UNCATEGORIZED';
      const amounts =
        transaction.amount.sign === MoneySign.POSITIVE ? inflows : outflows;
      const aggregate = amounts.get(primary) ?? {
        amount: 0n,
        count: 0,
        colors: new Map<string, bigint>(),
      };
      const amount = BigInt(convertedMinorUnits);
      const color = transaction.category?.color ?? UNCATEGORIZED_CATEGORY_COLOR;
      aggregate.amount += amount;
      aggregate.count++;
      aggregate.colors.set(color, (aggregate.colors.get(color) ?? 0n) + amount);
      amounts.set(primary, aggregate);
    }
    const categories = (amounts: Map<string, Aggregate>): CategoryAggregate[] =>
      [...amounts]
        .map(([primaryCategory, aggregate]) => ({
          primaryCategory,
          totalAmount: canonicalMinorUnits(aggregate.amount),
          currency,
          transactionCount: aggregate.count,
          color:
            [...aggregate.colors].sort(
              ([leftColor, leftAmount], [rightColor, rightAmount]) =>
                compareMinorUnits(rightAmount, leftAmount) ||
                leftColor.localeCompare(rightColor),
            )[0]?.[0] ?? UNCATEGORIZED_CATEGORY_COLOR,
        }))
        .sort((left, right) =>
          compareMinorUnits(right.totalAmount, left.totalAmount),
        );
    const total = (amounts: Map<string, Aggregate>) =>
      [...amounts.values()].reduce(
        (sum, aggregate) => sum + aggregate.amount,
        0n,
      );
    const totalInflow = total(inflows);
    const totalOutflow = total(outflows);
    return {
      startDate,
      endDate,
      currency,
      inflows: categories(inflows),
      outflows: categories(outflows),
      totalInflow: canonicalMinorUnits(totalInflow),
      totalOutflow: canonicalMinorUnits(totalOutflow),
      netFlow: (totalInflow - totalOutflow).toString(),
      uncategorizedInflow: canonicalMinorUnits(
        inflows.get('UNCATEGORIZED')?.amount ?? 0n,
      ),
      uncategorizedOutflow: canonicalMinorUnits(
        outflows.get('UNCATEGORIZED')?.amount ?? 0n,
      ),
    };
  }
}
