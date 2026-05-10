import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { AccountType } from 'plaid';
import { Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { AnalysisRuleService } from '../analysis-rule/analysis-rule.service';
import { BalanceSnapshotEntity } from '../balance-snapshot/balance-snapshot.entity';
import {
  BALANCE_ADJUSTMENT_CATEGORY_COLOR,
  UNCATEGORIZED_CATEGORY_COLOR,
} from '../category/category-color';
import { calculateEffectiveBalance } from '../common/effective-balance';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import {
  getTransactionActivityDate,
  TRANSACTION_ACTIVITY_DATE_EXPRESSION,
} from '../transaction/transaction-date';
import { TransactionEntity } from '../transaction/transaction.entity';
import { MoneySign } from '../types/MoneyWithSign';
import type { Transaction } from '../types/Transaction';
import type {
  BalanceAdjustment,
  CategoryAggregate,
  TransactionAnalysisResponse,
} from '../types/TransactionAnalysis';
import { AnalysisRuleEntity } from '../analysis-rule/analysis-rule.entity';

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

interface SignedBalanceAmount {
  amount: number;
  currency: string;
}

interface BalanceAdjustmentRow {
  accountId: string;
  accountName: string;
  flowDirection: 'inflow' | 'outflow';
  sourceCurrency: string;
  rawDeltaAmount: number;
  startBalance: SignedBalanceAmount;
  endBalance: SignedBalanceAmount;
}

const BALANCE_ADJUSTMENT_CATEGORY = 'BALANCE_ADJUSTMENT';

@Injectable()
export class TransactionAnalysisService {
  private readonly logger = new Logger(TransactionAnalysisService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(AccountEntity)
    private accountRepository: Repository<AccountEntity>,
    @InjectRepository(BalanceSnapshotEntity)
    private balanceSnapshotRepository: Repository<BalanceSnapshotEntity>,
    private currencyConversionService: CurrencyConversionService,
    private analysisRuleService: AnalysisRuleService,
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
    const postedTransactions = await this.getPostedTransactionsInRange(
      startDate,
      endDate,
      userId,
    );
    const unmatchedTransactions = await this.applyAnalysisRules(
      postedTransactions,
      userId,
    );
    const { balanceAdjustmentRows, balanceAdjustments } =
      await this.getBalanceAdjustmentData(
        startDate,
        endDate,
        userId,
        preferredCurrency,
        new Set(postedTransactions.map((transaction) => transaction.accountId)),
      );

    this.logger.log(
      {
        postedTransactionCount: postedTransactions.length,
        unmatchedTransactionCount: unmatchedTransactions.length,
        rawBalanceAdjustmentCount: balanceAdjustmentRows.length,
        balanceAdjustmentCount: balanceAdjustments.length,
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

    unmatchedTransactions.forEach((transaction) => {
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
    this.appendBalanceAdjustments(balanceAdjustments, inflowMap, outflowMap);

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
      balanceAdjustments,
    };
  }

  async getCategoryTransactions(
    startDate: string,
    endDate: string,
    categoryPrimary: string,
    flowDirection: 'inflow' | 'outflow',
    userId: string,
  ): Promise<Transaction[]> {
    const postedTransactions = await this.getPostedTransactionsInRange(
      startDate,
      endDate,
      userId,
    );
    const unmatchedTransactions = await this.applyAnalysisRules(
      postedTransactions,
      userId,
    );
    const preferredCurrency =
      await this.currencyConversionService.getPreferredCurrency(userId);

    const filteredTransactions = unmatchedTransactions.filter((transaction) => {
      const transactionCategory = this.getEffectiveCategoryPrimary(transaction);
      const matchesDirection =
        flowDirection === 'inflow'
          ? transaction.amount.sign === MoneySign.POSITIVE
          : transaction.amount.sign === MoneySign.NEGATIVE;

      return matchesDirection && transactionCategory === categoryPrimary;
    });
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

  async getBalanceAdjustments(
    startDate: string,
    endDate: string,
    categoryPrimary: string,
    flowDirection: 'inflow' | 'outflow',
    userId: string,
  ): Promise<BalanceAdjustment[]> {
    if (categoryPrimary !== BALANCE_ADJUSTMENT_CATEGORY) {
      throw new BadRequestException(
        `Unsupported categoryPrimary: ${categoryPrimary}`,
      );
    }

    const preferredCurrency =
      await this.currencyConversionService.getPreferredCurrency(userId);
    const postedTransactions = await this.getPostedTransactionsInRange(
      startDate,
      endDate,
      userId,
    );
    const { balanceAdjustments } = await this.getBalanceAdjustmentData(
      startDate,
      endDate,
      userId,
      preferredCurrency,
      new Set(postedTransactions.map((transaction) => transaction.accountId)),
    );

    return balanceAdjustments.filter(
      (adjustment) => adjustment.flowDirection === flowDirection,
    );
  }

  private async getBalanceAdjustmentData(
    startDate: string,
    endDate: string,
    userId: string,
    preferredCurrency: string,
    excludedAccountIds: Set<string>,
  ): Promise<{
    balanceAdjustmentRows: BalanceAdjustmentRow[];
    balanceAdjustments: BalanceAdjustment[];
  }> {
    const balanceAdjustmentRows = await this.getBalanceAdjustmentRows(
      startDate,
      endDate,
      userId,
      excludedAccountIds,
    );
    const balanceAdjustments = await this.buildBalanceAdjustments(
      balanceAdjustmentRows,
      preferredCurrency,
      endDate,
    );

    return {
      balanceAdjustmentRows,
      balanceAdjustments,
    };
  }

  private async getPostedTransactionsInRange(
    startDate: string,
    endDate: string,
    userId: string,
  ): Promise<TransactionEntity[]> {
    return this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.account', 'account')
      .leftJoinAndSelect('transaction.category', 'category')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.pending = false')
      .andWhere(
        `${TRANSACTION_ACTIVITY_DATE_EXPRESSION} BETWEEN :startDate AND :endDate`,
        {
          startDate,
          endDate,
        },
      )
      .getMany();
  }

  private async getBalanceAdjustmentRows(
    startDate: string,
    endDate: string,
    userId: string,
    excludedAccountIds: Set<string>,
  ): Promise<BalanceAdjustmentRow[]> {
    const accounts = await this.accountRepository.find({
      where: { userId },
    });
    const eligibleAccounts = accounts.filter(
      (account) =>
        !excludedAccountIds.has(account.id) &&
        account.type === String(AccountType.Depository),
    );

    if (eligibleAccounts.length === 0) {
      return [];
    }

    const eligibleAccountIds = eligibleAccounts.map((account) => account.id);
    const startSnapshots = await this.findLatestSnapshotsAtOrBefore(
      eligibleAccountIds,
      startDate,
      userId,
    );
    const endSnapshots = await this.findLatestSnapshotsAtOrBefore(
      eligibleAccountIds,
      endDate,
      userId,
    );

    const rawAdjustments: BalanceAdjustmentRow[] = [];
    eligibleAccounts.forEach((account) => {
      const startSnapshot = startSnapshots.get(account.id);
      const endSnapshot = endSnapshots.get(account.id);

      if (!startSnapshot || !endSnapshot) {
        return;
      }

      const startBalance = this.getEffectiveBalanceAmount(
        account,
        startSnapshot,
      );
      const endBalance = this.getEffectiveBalanceAmount(account, endSnapshot);
      if (startBalance.currency !== endBalance.currency) {
        return;
      }

      const delta = endBalance.amount - startBalance.amount;
      if (delta === 0) {
        return;
      }

      rawAdjustments.push({
        accountId: account.id,
        accountName: this.getAccountName(account),
        flowDirection: delta > 0 ? 'inflow' : 'outflow',
        sourceCurrency: endBalance.currency,
        rawDeltaAmount: Math.abs(delta),
        startBalance,
        endBalance,
      });
    });

    return rawAdjustments
      .sort((left, right) => this.compareBalanceAdjustmentRows(left, right))
      .map((adjustment) => ({
        accountId: adjustment.accountId,
        accountName: adjustment.accountName,
        flowDirection: adjustment.flowDirection,
        sourceCurrency: adjustment.sourceCurrency,
        rawDeltaAmount: adjustment.rawDeltaAmount,
        startBalance: adjustment.startBalance,
        endBalance: adjustment.endBalance,
      }));
  }

  private async buildBalanceAdjustments(
    balanceAdjustmentRows: BalanceAdjustmentRow[],
    preferredCurrency: string,
    endDate: string,
  ): Promise<BalanceAdjustment[]> {
    if (balanceAdjustmentRows.length === 0) {
      return [];
    }

    const foreignCurrencies = [
      ...new Set(
        balanceAdjustmentRows
          .map((adjustment) => adjustment.sourceCurrency)
          .filter((currency) => currency !== preferredCurrency),
      ),
    ];
    const rateMap = await this.currencyConversionService.getRateMap(
      foreignCurrencies,
      preferredCurrency,
      endDate,
    );

    return balanceAdjustmentRows.flatMap((adjustment) => {
      if (
        adjustment.sourceCurrency !== preferredCurrency &&
        !rateMap.has(adjustment.sourceCurrency)
      ) {
        return [];
      }

      return [
        {
          accountId: adjustment.accountId,
          accountName: adjustment.accountName,
          flowDirection: adjustment.flowDirection,
          currency: preferredCurrency,
          deltaAmount: this.convertAmountToPreferredCurrency(
            adjustment.rawDeltaAmount,
            adjustment.sourceCurrency,
            preferredCurrency,
            rateMap,
          ),
          startBalance: this.convertBalanceToPreferredCurrency(
            adjustment.startBalance,
            preferredCurrency,
            rateMap,
          ),
          endBalance: this.convertBalanceToPreferredCurrency(
            adjustment.endBalance,
            preferredCurrency,
            rateMap,
          ),
        },
      ];
    });
  }

  private async findLatestSnapshotsAtOrBefore(
    accountIds: string[],
    boundaryDate: string,
    userId: string,
  ): Promise<Map<string, BalanceSnapshotEntity>> {
    if (accountIds.length === 0) {
      return new Map();
    }

    const snapshots = await this.balanceSnapshotRepository
      .createQueryBuilder('snapshot')
      .distinctOn(['snapshot.accountId'])
      .where('snapshot.accountId IN (:...accountIds)', { accountIds })
      .andWhere('snapshot.userId = :userId', { userId })
      .andWhere('snapshot.snapshotDate <= :boundaryDate', { boundaryDate })
      .orderBy('snapshot.accountId')
      .addOrderBy('snapshot.snapshotDate', 'DESC')
      .getMany();

    return new Map(
      snapshots.map((snapshot) => [snapshot.accountId, snapshot] as const),
    );
  }

  private getEffectiveBalanceAmount(
    account: AccountEntity,
    snapshot: BalanceSnapshotEntity,
  ): SignedBalanceAmount {
    const currentBalance = snapshot.currentBalance.toMoneyWithSign();
    const effectiveBalance = calculateEffectiveBalance(currentBalance);

    return {
      amount:
        effectiveBalance.sign === MoneySign.POSITIVE
          ? effectiveBalance.money.amount
          : -effectiveBalance.money.amount,
      currency: effectiveBalance.money.currency,
    };
  }

  private appendBalanceAdjustments(
    balanceAdjustments: BalanceAdjustment[],
    inflowMap: Map<string, { amount: number; count: number }>,
    outflowMap: Map<string, { amount: number; count: number }>,
  ): void {
    balanceAdjustments.forEach((adjustment) => {
      const targetMap =
        adjustment.flowDirection === 'inflow' ? inflowMap : outflowMap;
      const existing = targetMap.get(BALANCE_ADJUSTMENT_CATEGORY);

      if (existing) {
        existing.amount += adjustment.deltaAmount;
        existing.count += 1;
        return;
      }

      targetMap.set(BALANCE_ADJUSTMENT_CATEGORY, {
        amount: adjustment.deltaAmount,
        count: 1,
      });
    });
  }

  private neutralizeTransactions(
    transactions: TransactionEntity[],
  ): TransactionEntity[] {
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

    Array.from(buckets.values())
      .sort((left, right) => this.compareBuckets(left, right))
      .forEach((bucket) => {
        const positives = bucket.positives;
        const negatives = [...bucket.negatives].sort((left, right) =>
          this.compareTransactions(left, right),
        );
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

  private async applyAnalysisRules(
    transactions: TransactionEntity[],
    userId: string,
  ): Promise<TransactionEntity[]> {
    const rules = await this.analysisRuleService.findActiveForAnalysis(userId);
    if (rules.length === 0) {
      return transactions;
    }

    const exclusionRules = rules.filter((rule) => rule.type === 'exclude');
    const neutralizationRules = rules
      .filter((rule) => rule.type === 'neutralize')
      // Product semantics: run smaller, more specific cancellation pools before
      // broad catch-all pools so narrow user intent cannot be consumed first.
      .sort((left, right) =>
        this.analysisRuleService.compareNeutralizationRules(left, right),
      );
    let availableTransactions = transactions.filter(
      (transaction) => !this.isExcludedByRules(transaction, exclusionRules),
    );

    neutralizationRules.forEach((rule) => {
      const pool = availableTransactions.filter((transaction) =>
        this.isEligibleForNeutralizationRule(transaction, rule),
      );
      const unmatchedPoolIds = new Set(
        this.neutralizeTransactions(pool).map((transaction) => transaction.id),
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
    });

    return availableTransactions;
  }

  private isExcludedByRules(
    transaction: TransactionEntity,
    rules: AnalysisRuleEntity[],
  ): boolean {
    return rules.some(
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

  private convertBalanceToPreferredCurrency(
    balance: SignedBalanceAmount,
    preferredCurrency: string,
    rateMap: Map<string, number>,
  ): SignedBalanceAmount {
    return {
      amount: this.convertAmountToPreferredCurrency(
        balance.amount,
        balance.currency,
        preferredCurrency,
        rateMap,
      ),
      currency: preferredCurrency,
    };
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

    const rate = rateMap.get(sourceCurrency);
    if (!rate) {
      return transactionObject;
    }

    return {
      ...transactionObject,
      convertedAmount: {
        money: {
          currency: preferredCurrency,
          amount: this.currencyConversionService.convertAmount(
            this.getAmountInSmallestUnit(transaction),
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

  private compareBalanceAdjustmentRows(
    left: BalanceAdjustmentRow,
    right: BalanceAdjustmentRow,
  ): number {
    const nameComparison = left.accountName.localeCompare(right.accountName);
    if (nameComparison !== 0) {
      return nameComparison;
    }

    return left.accountId.localeCompare(right.accountId);
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

    if (category === BALANCE_ADJUSTMENT_CATEGORY) {
      return BALANCE_ADJUSTMENT_CATEGORY_COLOR;
    }

    return BALANCE_ADJUSTMENT_CATEGORY_COLOR;
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

  private comparePositiveMatchCandidates(
    negative: TransactionEntity,
    left: TransactionEntity,
    right: TransactionEntity,
  ): number {
    const differenceComparison =
      this.getAbsoluteDateDifferenceInDays(
        this.getActivityDate(negative),
        this.getActivityDate(left),
      ) -
      this.getAbsoluteDateDifferenceInDays(
        this.getActivityDate(negative),
        this.getActivityDate(right),
      );
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
