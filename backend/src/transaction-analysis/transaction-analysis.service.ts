import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { AnalysisRuleService } from '../analysis-rule/analysis-rule.service';
import { UNCATEGORIZED_CATEGORY_COLOR } from '../category/category-color';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import {
  getTransactionActivityDate,
  TRANSACTION_ACTIVITY_DATE_EXPRESSION,
} from '../transaction/transaction-date';
import { TransactionEntity } from '../transaction/transaction.entity';
import { MoneySign } from '../types/MoneyWithSign';
import type { Transaction } from '../types/Transaction';
import type {
  AnalysisAuditRow,
  AnalysisAuditTransaction,
  CategoryAggregate,
  TransactionAnalysisAuditResponse,
  TransactionAnalysisResponse,
} from '../types/TransactionAnalysis';
import { AnalysisRuleEntity } from '../analysis-rule/analysis-rule.entity';
import { UserService } from '../user/user.service';

interface CategoryCurrencyAggregate {
  amount: number;
  count: number;
}

type CategoryColorContributionMap = Map<
  string,
  Map<string, Map<string, number>>
>;

interface NeutralizationBucket {
  currency: string;
  absoluteAmount: number;
  positives: TransactionEntity[];
  negatives: TransactionEntity[];
}

interface NeutralizedPair {
  outflow: TransactionEntity;
  inflow: TransactionEntity;
}

interface AnalysisRuleApplicationResult {
  remainingReportTransactions: TransactionEntity[];
  auditRows: AnalysisAuditRow[];
}

@Injectable()
export class TransactionAnalysisService {
  private readonly logger = new Logger(TransactionAnalysisService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private transactionRepository: Repository<TransactionEntity>,
    private currencyConversionService: CurrencyConversionService,
    private analysisRuleService: AnalysisRuleService,
    private userService: UserService,
  ) {}

  /**
   * Aggregate unmatched transactions by primary category and sign over
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

    // 2. Load candidate transactions in the user lookaround window.
    // Out-of-range candidates can neutralize in-range rows, but never report
    // directly.
    const neutralizationLookaroundDays =
      await this.getNeutralizationLookaroundDays(userId);
    const { candidateStartDate, candidateEndDate } = this.getCandidateDateRange(
      startDate,
      endDate,
      neutralizationLookaroundDays,
    );
    const candidateTransactions = await this.getAnalysisTransactionsInRange(
      candidateStartDate,
      candidateEndDate,
      userId,
    );
    const reportTransactions = candidateTransactions.filter((transaction) =>
      this.isTransactionInDateRange(transaction, startDate, endDate),
    );
    const { remainingReportTransactions } = await this.applyAnalysisRules(
      candidateTransactions,
      userId,
      startDate,
      endDate,
    );

    this.logger.log(
      {
        candidateTransactionCount: candidateTransactions.length,
        reportTransactionCount: reportTransactions.length,
        unmatchedTransactionCount: remainingReportTransactions.length,
        preferredCurrency,
        neutralizationLookaroundDays,
      },
      'Transaction analysis rows loaded',
    );

    // 3. Identify currencies that need conversion and fetch rates
    const foreignCurrencies = [
      ...new Set(
        remainingReportTransactions
          .filter(
            (transaction) => this.getAmountInSmallestUnit(transaction) !== 0,
          )
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
      {
        inflow: Map<string, CategoryCurrencyAggregate>;
        outflow: Map<string, CategoryCurrencyAggregate>;
      }
    >();
    const colorContributions: Record<
      'inflow' | 'outflow',
      CategoryColorContributionMap
    > = {
      inflow: new Map(),
      outflow: new Map(),
    };

    remainingReportTransactions.forEach((transaction) => {
      const category = this.getEffectiveCategoryPrimary(transaction);
      const currency = transaction.amount.currency;
      const amount = this.getAmountInSmallestUnit(transaction);
      const isInflow = transaction.amount.sign === MoneySign.POSITIVE;
      const flowDirection = isInflow ? 'inflow' : 'outflow';
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
      this.appendCategoryColorContribution(
        colorContributions[flowDirection],
        category,
        transaction.category?.color ?? this.getFallbackCategoryColor(category),
        currency,
        amount,
      );
    });

    // 5. Convert aggregated totals to the preferred currency and group by category.
    const inflowMap = new Map<string, { amount: number; count: number }>();
    const outflowMap = new Map<string, { amount: number; count: number }>();
    const inflowColorByPrimary = this.resolveCategoryColors(
      colorContributions.inflow,
      preferredCurrency,
      rateMap,
    );
    const outflowColorByPrimary = this.resolveCategoryColors(
      colorContributions.outflow,
      preferredCurrency,
      rateMap,
    );

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
        color:
          inflowColorByPrimary.get(primaryCategory) ??
          this.getFallbackCategoryColor(primaryCategory),
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);

    const outflows: CategoryAggregate[] = Array.from(outflowMap.entries())
      .map(([primaryCategory, { amount, count }]) => ({
        primaryCategory,
        totalAmount: amount,
        currency: preferredCurrency,
        transactionCount: count,
        color:
          outflowColorByPrimary.get(primaryCategory) ??
          this.getFallbackCategoryColor(primaryCategory),
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

  async getCategoryTransactions(
    startDate: string,
    endDate: string,
    categoryPrimary: string,
    flowDirection: 'inflow' | 'outflow',
    userId: string,
  ): Promise<Transaction[]> {
    const neutralizationLookaroundDays =
      await this.getNeutralizationLookaroundDays(userId);
    const { candidateStartDate, candidateEndDate } = this.getCandidateDateRange(
      startDate,
      endDate,
      neutralizationLookaroundDays,
    );
    const candidateTransactions = await this.getAnalysisTransactionsInRange(
      candidateStartDate,
      candidateEndDate,
      userId,
    );
    const { remainingReportTransactions } = await this.applyAnalysisRules(
      candidateTransactions,
      userId,
      startDate,
      endDate,
    );
    const preferredCurrency =
      await this.currencyConversionService.getPreferredCurrency(userId);

    const filteredTransactions = remainingReportTransactions.filter(
      (transaction) => {
        const transactionCategory =
          this.getEffectiveCategoryPrimary(transaction);
        const matchesDirection =
          flowDirection === 'inflow'
            ? transaction.amount.sign === MoneySign.POSITIVE
            : transaction.amount.sign === MoneySign.NEGATIVE;

        return matchesDirection && transactionCategory === categoryPrimary;
      },
    );
    filteredTransactions.sort((left, right) => {
      const dateComparison = this.getActivityDate(right).localeCompare(
        this.getActivityDate(left),
      );
      if (dateComparison !== 0) {
        return dateComparison;
      }

      return right.id.localeCompare(left.id);
    });

    const foreignCurrencies = [
      ...new Set(
        filteredTransactions
          .filter(
            (transaction) => this.getAmountInSmallestUnit(transaction) !== 0,
          )
          .map((transaction) => transaction.amount.currency)
          .filter((currency) => currency !== preferredCurrency),
      ),
    ];
    const rateMap = await this.currencyConversionService.getRateMap(
      foreignCurrencies,
      preferredCurrency,
      endDate,
    );

    return filteredTransactions.map((transaction) =>
      this.toTransactionWithConvertedAmount(
        transaction,
        preferredCurrency,
        rateMap,
      ),
    );
  }

  async getAnalysisAudit(
    startDate: string,
    endDate: string,
    userId: string,
  ): Promise<TransactionAnalysisAuditResponse> {
    const neutralizationLookaroundDays =
      await this.getNeutralizationLookaroundDays(userId);
    const { candidateStartDate, candidateEndDate } = this.getCandidateDateRange(
      startDate,
      endDate,
      neutralizationLookaroundDays,
    );
    const candidateTransactions = await this.getAnalysisTransactionsInRange(
      candidateStartDate,
      candidateEndDate,
      userId,
    );
    const { auditRows } = await this.applyAnalysisRules(
      candidateTransactions,
      userId,
      startDate,
      endDate,
    );

    return {
      startDate,
      endDate,
      neutralizationLookaroundDays,
      rows: auditRows,
    };
  }

  private async getAnalysisTransactionsInRange(
    startDate: string,
    endDate: string,
    userId: string,
  ): Promise<TransactionEntity[]> {
    return this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.activity', 'activity')
      .leftJoinAndSelect('activity.account', 'account')
      .leftJoinAndSelect('transaction.category', 'category')
      .where('activity.userId = :userId', { userId })
      .andWhere(
        `${TRANSACTION_ACTIVITY_DATE_EXPRESSION} BETWEEN :startDate AND :endDate`,
        {
          startDate,
          endDate,
        },
      )
      .getMany();
  }

  private neutralizeTransactions(transactions: TransactionEntity[]): {
    unmatchedTransactions: TransactionEntity[];
    pairs: NeutralizedPair[];
  } {
    const buckets = new Map<string, NeutralizationBucket>();

    transactions.forEach((transaction) => {
      const currency = transaction.amount.currency;
      const absoluteAmount = this.getAmountInSmallestUnit(transaction);
      const key = this.getBucketKey(currency, absoluteAmount);
      const bucket = buckets.get(key) ?? {
        currency,
        absoluteAmount,
        positives: [],
        negatives: [],
      };
      if (transaction.amount.sign === MoneySign.POSITIVE) {
        bucket.positives.push(transaction);
      } else {
        bucket.negatives.push(transaction);
      }
      buckets.set(key, bucket);
    });

    const unmatchedTransactions: TransactionEntity[] = [];
    const pairs: NeutralizedPair[] = [];

    Array.from(buckets.values())
      .sort((left, right) => this.compareBuckets(left, right))
      .forEach((bucket) => {
        const positives = [...bucket.positives].sort((left, right) =>
          this.compareTransactions(left, right),
        );
        const negatives = [...bucket.negatives].sort((left, right) =>
          this.compareTransactions(left, right),
        );
        const matchedPositiveIds = new Set<string>();
        const matchedNegativeIds = new Set<string>();

        // Neutralization requires same currency and absolute amount by bucket,
        // then each inflow takes the closest earlier unmatched outflow.
        positives.forEach((positive) => {
          const match = negatives
            .filter(
              (negative) =>
                !matchedNegativeIds.has(negative.id) &&
                this.getActivityDate(negative) <=
                  this.getActivityDate(positive),
            )
            .sort((left, right) =>
              this.compareOutflowMatchCandidates(positive, left, right),
            )[0];

          if (!match) {
            return;
          }

          matchedPositiveIds.add(positive.id);
          matchedNegativeIds.add(match.id);
          pairs.push({
            outflow: match,
            inflow: positive,
          });
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

    return {
      unmatchedTransactions,
      pairs,
    };
  }

  private async applyAnalysisRules(
    transactions: TransactionEntity[],
    userId: string,
    reportStartDate: string,
    reportEndDate: string,
  ): Promise<AnalysisRuleApplicationResult> {
    const rules = await this.analysisRuleService.findActiveForAnalysis(userId);
    if (rules.length === 0) {
      return {
        remainingReportTransactions: transactions.filter((transaction) =>
          this.isTransactionInDateRange(
            transaction,
            reportStartDate,
            reportEndDate,
          ),
        ),
        auditRows: [],
      };
    }

    const exclusionRules = rules.filter((rule) => rule.type === 'exclude');
    const neutralizationRules = rules
      .filter((rule) => rule.type === 'neutralize')
      // Product semantics: run smaller, more specific cancellation pools before
      // broad catch-all pools so narrow user intent cannot be consumed first.
      .sort((left, right) =>
        this.analysisRuleService.compareNeutralizationRules(left, right),
      );
    const excludedTransactionsByRule = new Map<string, TransactionEntity[]>();
    let availableTransactions = transactions.filter((transaction) => {
      const rule = this.findExclusionRule(transaction, exclusionRules);
      if (!rule) {
        return true;
      }

      if (
        this.isTransactionInDateRange(
          transaction,
          reportStartDate,
          reportEndDate,
        )
      ) {
        const rows = excludedTransactionsByRule.get(rule.id) ?? [];
        rows.push(transaction);
        excludedTransactionsByRule.set(rule.id, rows);
      }

      return false;
    });
    const auditRows: AnalysisAuditRow[] = [];

    exclusionRules.forEach((rule) => {
      const excludedTransactions =
        excludedTransactionsByRule.get(rule.id) ?? [];
      excludedTransactions
        .sort((left, right) => this.compareTransactions(left, right))
        .forEach((transaction) => {
          auditRows.push(this.toExclusionAuditRow(rule, transaction));
        });
    });

    neutralizationRules.forEach((rule) => {
      const pool = availableTransactions.filter((transaction) =>
        this.isEligibleForNeutralizationRule(transaction, rule),
      );
      const { unmatchedTransactions, pairs } =
        this.neutralizeTransactions(pool);
      const unmatchedPoolIds = new Set(
        unmatchedTransactions.map((transaction) => transaction.id),
      );
      const matchedPoolIds = new Set(
        pool
          .filter((transaction) => !unmatchedPoolIds.has(transaction.id))
          .map((transaction) => transaction.id),
      );

      if (matchedPoolIds.size === 0) {
        return;
      }

      availableTransactions = availableTransactions.filter(
        (transaction) => !matchedPoolIds.has(transaction.id),
      );
      pairs
        .filter(
          (pair) =>
            this.isTransactionInDateRange(
              pair.outflow,
              reportStartDate,
              reportEndDate,
            ) ||
            this.isTransactionInDateRange(
              pair.inflow,
              reportStartDate,
              reportEndDate,
            ),
        )
        .forEach((pair) => {
          auditRows.push(this.toNeutralizationAuditRow(rule, pair));
        });
    });

    return {
      remainingReportTransactions: availableTransactions.filter((transaction) =>
        this.isTransactionInDateRange(
          transaction,
          reportStartDate,
          reportEndDate,
        ),
      ),
      auditRows,
    };
  }

  private findExclusionRule(
    transaction: TransactionEntity,
    rules: AnalysisRuleEntity[],
  ): AnalysisRuleEntity | undefined {
    return rules.find(
      (rule) =>
        rule.excludeScope &&
        this.analysisRuleService.scopeMatchesTransactionCategory(
          rule.excludeScope,
          this.getEffectiveCategoryId(transaction),
        ),
    );
  }

  private isEligibleForNeutralizationRule(
    transaction: TransactionEntity,
    rule: AnalysisRuleEntity,
  ): boolean {
    const scope =
      transaction.amount.sign === MoneySign.POSITIVE
        ? rule.inflowScope
        : rule.outflowScope;

    return scope
      ? this.analysisRuleService.scopeMatchesTransactionCategory(
          scope,
          this.getEffectiveCategoryId(transaction),
        )
      : false;
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

  private appendCategoryColorContribution(
    colorContributions: CategoryColorContributionMap,
    category: string,
    color: string,
    currency: string,
    amount: number,
  ): void {
    const colorTotals =
      colorContributions.get(category) ??
      new Map<string, Map<string, number>>();
    const currencyTotals = colorTotals.get(color) ?? new Map<string, number>();

    currencyTotals.set(currency, (currencyTotals.get(currency) ?? 0) + amount);
    colorTotals.set(color, currencyTotals);
    colorContributions.set(category, colorTotals);
  }

  private resolveCategoryColors(
    colorContributions: CategoryColorContributionMap,
    preferredCurrency: string,
    rateMap: Map<string, number>,
  ): Map<string, string> {
    return new Map(
      Array.from(colorContributions.entries()).map(
        ([category, colorTotals]) => {
          const rankedColors = Array.from(colorTotals.entries())
            .map(([color, totalsByCurrency]) => ({
              color,
              amount: this.getConvertedColorContribution(
                totalsByCurrency,
                preferredCurrency,
                rateMap,
              ),
            }))
            .sort(
              (left, right) =>
                right.amount - left.amount ||
                left.color.localeCompare(right.color),
            );

          return [
            category,
            rankedColors[0]?.color ?? this.getFallbackCategoryColor(category),
          ] as const;
        },
      ),
    );
  }

  private getConvertedColorContribution(
    totalsByCurrency: Map<string, number>,
    preferredCurrency: string,
    rateMap: Map<string, number>,
  ): number {
    return Array.from(totalsByCurrency.entries()).reduce(
      (total, [currency, amount]) =>
        total +
        this.convertAmountToPreferredCurrency(
          amount,
          currency,
          preferredCurrency,
          rateMap,
        ),
      0,
    );
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

    if (amount === 0) {
      return 0;
    }

    const rate = rateMap.get(sourceCurrency);
    if (!rate || !Number.isFinite(rate) || rate <= 0) {
      throw new ServiceUnavailableException(
        `Required exchange rate is unavailable for ${sourceCurrency} to ${preferredCurrency}`,
      );
    }

    return this.currencyConversionService.convertAmount(
      amount,
      sourceCurrency,
      preferredCurrency,
      rate,
    );
  }

  private toTransactionWithConvertedAmount(
    transaction: TransactionEntity,
    preferredCurrency: string,
    rateMap: Map<string, number>,
  ): Transaction {
    const transactionObject = transaction.toObject();
    const sourceCurrency = transaction.amount.currency;

    if (sourceCurrency === preferredCurrency) {
      return transactionObject;
    }

    const amount = this.getAmountInSmallestUnit(transaction);
    if (amount === 0) {
      return {
        ...transactionObject,
        convertedAmount: {
          money: { currency: preferredCurrency, amount: 0 },
          sign: transaction.amount.sign,
        },
      };
    }

    const rate = rateMap.get(sourceCurrency);
    if (!rate || !Number.isFinite(rate) || rate <= 0) {
      throw new ServiceUnavailableException(
        `Required exchange rate is unavailable for ${sourceCurrency} to ${preferredCurrency}`,
      );
    }

    return {
      ...transactionObject,
      convertedAmount: {
        money: {
          currency: preferredCurrency,
          amount: this.currencyConversionService.convertAmount(
            amount,
            sourceCurrency,
            preferredCurrency,
            rate,
          ),
        },
        sign: transaction.amount.sign,
      },
    };
  }

  private getBucketKey(currency: string, absoluteAmount: number): string {
    return `${currency}:${absoluteAmount}`;
  }

  private getAccountName(account: AccountEntity): string {
    return (
      account.customName?.trim() || account.name?.trim() || 'Unnamed account'
    );
  }

  private async getNeutralizationLookaroundDays(
    userId: string,
  ): Promise<number> {
    const user = await this.userService.findOne(userId);
    return user?.settings.neutralizationLookaroundDays ?? 60;
  }

  private getCandidateDateRange(
    startDate: string,
    endDate: string,
    lookaroundDays: number,
  ): { candidateStartDate: string; candidateEndDate: string } {
    return {
      candidateStartDate: this.shiftDateByDays(startDate, -lookaroundDays),
      candidateEndDate: this.shiftDateByDays(endDate, lookaroundDays),
    };
  }

  private shiftDateByDays(date: string, days: number): string {
    const shiftedDate = new Date(`${date}T00:00:00Z`);
    shiftedDate.setUTCDate(shiftedDate.getUTCDate() + days);
    return shiftedDate.toISOString().slice(0, 10);
  }

  private isTransactionInDateRange(
    transaction: TransactionEntity,
    startDate: string,
    endDate: string,
  ): boolean {
    const activityDate = this.getActivityDate(transaction);
    return activityDate >= startDate && activityDate <= endDate;
  }

  private toExclusionAuditRow(
    rule: AnalysisRuleEntity,
    transaction: TransactionEntity,
  ): AnalysisAuditRow {
    return {
      id: `excluded:${rule.id}:${transaction.id}`,
      type: 'excluded',
      groupKey: `exclude:${rule.id}`,
      groupLabel: `Excluded by "${rule.name}"`,
      ruleId: rule.id,
      ruleName: rule.name,
      transaction: this.toAuditTransaction(transaction),
    };
  }

  private toNeutralizationAuditRow(
    rule: AnalysisRuleEntity,
    pair: NeutralizedPair,
  ): AnalysisAuditRow {
    return {
      id: `neutralized:${rule.id}:${pair.outflow.id}:${pair.inflow.id}`,
      type: 'neutralized',
      groupKey: `neutralize:${rule.id}`,
      groupLabel: `Neutralized by "${rule.name}"`,
      ruleId: rule.id,
      ruleName: rule.name,
      outflow: this.toAuditTransaction(pair.outflow),
      inflow: this.toAuditTransaction(pair.inflow),
    };
  }

  private toAuditTransaction(
    transaction: TransactionEntity,
  ): AnalysisAuditTransaction {
    return {
      id: transaction.id,
      activityDate: this.getActivityDate(transaction),
      merchantName: transaction.merchantName,
      originalDescription: transaction.originalDescription,
      accountName: this.getAccountName(transaction.account),
      categoryPrimary: this.getEffectiveCategoryPrimary(transaction),
      categoryDetailed: transaction.category?.detailed ?? null,
      amount: {
        amount: this.getAmountInSmallestUnit(transaction),
        currency: transaction.amount.currency,
        sign: transaction.amount.sign,
      },
    };
  }

  private getAmountInSmallestUnit(transaction: TransactionEntity): number {
    return typeof transaction.amount.amount === 'string'
      ? parseInt(transaction.amount.amount, 10)
      : transaction.amount.amount;
  }

  private getEffectiveCategoryPrimary(transaction: TransactionEntity): string {
    return transaction.category?.primary ?? 'UNCATEGORIZED';
  }

  private getEffectiveCategoryId(
    transaction: TransactionEntity,
  ): string | null {
    return transaction.category?.id ?? transaction.categoryId ?? null;
  }

  private getFallbackCategoryColor(category: string): string {
    if (category === 'UNCATEGORIZED') {
      return UNCATEGORIZED_CATEGORY_COLOR;
    }

    return UNCATEGORIZED_CATEGORY_COLOR;
  }

  private getActivityDate(transaction: TransactionEntity): string {
    return getTransactionActivityDate(transaction);
  }

  private compareBuckets(
    left: NeutralizationBucket,
    right: NeutralizationBucket,
  ): number {
    const currencyComparison = left.currency.localeCompare(right.currency);
    if (currencyComparison !== 0) {
      return currencyComparison;
    }

    return left.absoluteAmount - right.absoluteAmount;
  }

  private compareTransactions(
    left: TransactionEntity,
    right: TransactionEntity,
  ): number {
    const dateComparison = this.getActivityDate(left).localeCompare(
      this.getActivityDate(right),
    );
    if (dateComparison !== 0) {
      return dateComparison;
    }

    return left.id.localeCompare(right.id);
  }

  private compareOutflowMatchCandidates(
    positive: TransactionEntity,
    left: TransactionEntity,
    right: TransactionEntity,
  ): number {
    const differenceComparison =
      this.getDateDifferenceInDays(
        this.getActivityDate(positive),
        this.getActivityDate(left),
      ) -
      this.getDateDifferenceInDays(
        this.getActivityDate(positive),
        this.getActivityDate(right),
      );
    if (differenceComparison !== 0) {
      return differenceComparison;
    }

    return this.compareTransactions(left, right);
  }

  private getDateDifferenceInDays(leftDate: string, rightDate: string): number {
    const leftTimestamp = Date.parse(`${leftDate}T00:00:00Z`);
    const rightTimestamp = Date.parse(`${rightDate}T00:00:00Z`);
    return Math.floor((leftTimestamp - rightTimestamp) / 86_400_000);
  }
}
