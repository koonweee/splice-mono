import type { AccountEntity } from '../account/account.entity';
import { AnalysisRuleService } from '../analysis-rule/analysis-rule.service';
import type { AnalysisRuleEntity } from '../analysis-rule/analysis-rule.entity';
import { canonicalMinorUnits, compareMinorUnits } from '../common/exact-money';
import { getTransactionActivityDate } from '../transaction/transaction-date';
import type { TransactionEntity } from '../transaction/transaction.entity';
import { MoneySign } from '../types/MoneyWithSign';
import type {
  AnalysisAuditRow,
  AnalysisAuditTransaction,
} from '../types/TransactionAnalysis';

type NeutralizationBucket = {
  currency: string;
  absoluteAmount: string;
  positives: TransactionEntity[];
  negatives: TransactionEntity[];
};
type NeutralizedPair = {
  outflow: TransactionEntity;
  inflow: TransactionEntity;
};
export type AnalysisRuleApplicationResult = {
  remainingReportTransactions: TransactionEntity[];
  auditRows: AnalysisAuditRow[];
};

/** Pure evaluation over one immutable request snapshot. */
export class CashFlowRuleEvaluator {
  constructor(
    private readonly analysisRuleService: Pick<
      AnalysisRuleService,
      'compareNeutralizationRules' | 'scopeMatchesTransactionCategory'
    >,
  ) {}

  neutralizeTransactions(transactions: TransactionEntity[]): {
    unmatchedTransactions: TransactionEntity[];
    pairs: NeutralizedPair[];
  } {
    const buckets = new Map<string, NeutralizationBucket>();
    for (const transaction of transactions) {
      const currency = transaction.amount.currency;
      const absoluteAmount = this.getAmountInSmallestUnit(transaction);
      const key = `${currency}:${absoluteAmount}`;
      const bucket = buckets.get(key) ?? {
        currency,
        absoluteAmount,
        positives: [],
        negatives: [],
      };
      if (transaction.amount.sign === MoneySign.POSITIVE)
        bucket.positives.push(transaction);
      else bucket.negatives.push(transaction);
      buckets.set(key, bucket);
    }
    const unmatchedTransactions: TransactionEntity[] = [];
    const pairs: NeutralizedPair[] = [];
    for (const bucket of [...buckets.values()].sort((left, right) =>
      this.compareBuckets(left, right),
    )) {
      const positives = bucket.positives.sort((left, right) =>
        this.compareTransactions(left, right),
      );
      const negatives = bucket.negatives.sort((left, right) =>
        this.compareTransactions(left, right),
      );
      const matchedNegativeIds = new Set<string>();
      // Monotone inflow dates make every newly eligible outflow available once.
      // Latest date wins; within that date preserve the original ascending-ID tie break.
      const eligibleDates: Array<{
        date: string;
        rows: TransactionEntity[];
        next: number;
      }> = [];
      let nextNegative = 0;
      for (const positive of positives) {
        const date = this.getActivityDate(positive);
        while (
          nextNegative < negatives.length &&
          this.getActivityDate(negatives[nextNegative]) <= date
        ) {
          const negative = negatives[nextNegative++];
          const negativeDate = this.getActivityDate(negative);
          let group = eligibleDates.at(-1);
          if (!group || group.date !== negativeDate) {
            group = { date: negativeDate, rows: [], next: 0 };
            eligibleDates.push(group);
          }
          group.rows.push(negative);
        }
        const group = eligibleDates.at(-1);
        if (!group) {
          unmatchedTransactions.push(positive);
          continue;
        }
        const match = group.rows[group.next++];
        if (group.next === group.rows.length) eligibleDates.pop();
        matchedNegativeIds.add(match.id);
        pairs.push({ outflow: match, inflow: positive });
      }
      unmatchedTransactions.push(
        ...negatives.filter((negative) => !matchedNegativeIds.has(negative.id)),
      );
    }
    return { unmatchedTransactions, pairs };
  }
  evaluate(
    transactions: TransactionEntity[],
    rules: AnalysisRuleEntity[],
    reportStartDate: string,
    reportEndDate: string,
  ): AnalysisRuleApplicationResult {
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

  private getAccountName(account: AccountEntity): string {
    return (
      account?.customName?.trim() || account?.name?.trim() || 'Unnamed account'
    );
  }
  private isTransactionInDateRange(
    transaction: TransactionEntity,
    startDate: string,
    endDate: string,
  ): boolean {
    const date = this.getActivityDate(transaction);
    return date >= startDate && date <= endDate;
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

  private getAmountInSmallestUnit(transaction: TransactionEntity): string {
    return canonicalMinorUnits(transaction.amount.amount);
  }

  private getEffectiveCategoryPrimary(transaction: TransactionEntity): string {
    return transaction.category?.primary ?? 'UNCATEGORIZED';
  }

  private getEffectiveCategoryId(
    transaction: TransactionEntity,
  ): string | null {
    return transaction.category?.id ?? transaction.categoryId ?? null;
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

    return compareMinorUnits(left.absoluteAmount, right.absoluteAmount);
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
}
