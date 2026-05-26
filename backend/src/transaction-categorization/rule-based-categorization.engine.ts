import { Injectable } from '@nestjs/common';
import { TransactionEntity } from '../transaction/transaction.entity';
import type { CategorizationRuleCondition } from '../types/CategorizationRule';
import { getDecimalPlaces, type MoneySign } from '../types/MoneyWithSign';
import type { CategorizationRuleEntity } from './categorization-rule.entity';

type RuleTextField =
  | 'merchantName'
  | 'providerTransactionName'
  | 'originalDescription'
  | 'merchantEntityId'
  | 'website'
  | 'providerCategoryPrimary'
  | 'providerCategoryDetailed';

type RuleTextCondition = {
  field: RuleTextField;
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith';
  value: string;
};

type TransactionCategorizationFeatures = {
  merchantName: string | null;
  providerTransactionName: string | null;
  originalDescription: string | null;
  merchantEntityId: string | null;
  website: string | null;
  providerCategoryPrimary: string | null;
  providerCategoryDetailed: string | null;
  accountId: string;
  amountSign: MoneySign;
  amount: number;
};

export type CategorizationRuleMatch = {
  rule: CategorizationRuleEntity;
  targetCategoryId: string;
};

@Injectable()
export class RuleBasedCategorizationEngine {
  findFirstMatch(
    rules: CategorizationRuleEntity[],
    transaction: TransactionEntity,
  ): CategorizationRuleMatch | null {
    const features = this.extractFeatures(transaction);
    const match = [...rules]
      .sort((left, right) => this.compareRules(left, right))
      .find((rule) =>
        rule.conditions.every((condition) =>
          this.conditionMatches(condition, features),
        ),
      );

    return match
      ? { rule: match, targetCategoryId: match.targetCategoryId }
      : null;
  }

  normalizeConditions(
    conditions: CategorizationRuleCondition[],
  ): CategorizationRuleCondition[] {
    return conditions.map((condition) => {
      if (this.isTextCondition(condition)) {
        return {
          ...condition,
          value: normalizeText(condition.value),
        };
      }

      if (condition.field === 'accountId' && Array.isArray(condition.value)) {
        return {
          ...condition,
          value: Array.from(new Set(condition.value)).sort(),
        };
      }

      return condition;
    });
  }

  canonicalConditionsKey(conditions: CategorizationRuleCondition[]): string {
    return JSON.stringify(
      this.normalizeConditions(conditions)
        .map((condition) => JSON.stringify(condition))
        .sort(),
    );
  }

  private extractFeatures(
    transaction: TransactionEntity,
  ): TransactionCategorizationFeatures {
    const amount = transaction.amount.toMoneyWithSign();
    return {
      merchantName: transaction.merchantName,
      providerTransactionName: transaction.providerTransactionName,
      originalDescription: transaction.originalDescription,
      merchantEntityId: transaction.merchantEntityId,
      website: transaction.website,
      providerCategoryPrimary: transaction.providerCategoryPrimary,
      providerCategoryDetailed: transaction.providerCategoryDetailed,
      accountId: transaction.accountId,
      amountSign: amount.sign,
      amount:
        amount.money.amount /
        Math.pow(10, getDecimalPlaces(amount.money.currency)),
    };
  }

  private conditionMatches(
    condition: CategorizationRuleCondition,
    features: TransactionCategorizationFeatures,
  ): boolean {
    if (this.isTextCondition(condition)) {
      return this.textConditionMatches(condition, features);
    }

    if (condition.field === 'accountId') {
      return condition.operator === 'in'
        ? Array.isArray(condition.value) &&
            condition.value.includes(features.accountId)
        : condition.value === features.accountId;
    }

    if (condition.field === 'amountSign') {
      return condition.value === String(features.amountSign);
    }

    const amount = features.amount;
    if (condition.operator === 'between') {
      if (typeof condition.value !== 'object') {
        return false;
      }

      const { min, max } = condition.value;
      return (
        (min === undefined || amount >= min) &&
        (max === undefined || amount <= max)
      );
    }

    if (typeof condition.value !== 'number') {
      return false;
    }

    switch (condition.operator) {
      case 'equals':
        return amount === condition.value;
      case 'greaterThan':
        return amount > condition.value;
      case 'lessThan':
        return amount < condition.value;
    }
  }

  private textConditionMatches(
    condition: RuleTextCondition,
    features: TransactionCategorizationFeatures,
  ): boolean {
    const actual = normalizeText(features[condition.field]);
    const expected = normalizeText(condition.value);
    if (!actual || !expected) {
      return false;
    }

    switch (condition.operator) {
      case 'equals':
        return actual === expected;
      case 'contains':
        return actual.includes(expected);
      case 'startsWith':
        return actual.startsWith(expected);
      case 'endsWith':
        return actual.endsWith(expected);
    }
  }

  private compareRules(
    left: CategorizationRuleEntity,
    right: CategorizationRuleEntity,
  ): number {
    const priorityComparison = left.priority - right.priority;
    if (priorityComparison !== 0) {
      return priorityComparison;
    }

    const createdAtComparison =
      left.createdAt.getTime() - right.createdAt.getTime();
    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }

    return left.id.localeCompare(right.id);
  }

  private isTextCondition(
    condition: CategorizationRuleCondition,
  ): condition is RuleTextCondition {
    return [
      'merchantName',
      'providerTransactionName',
      'originalDescription',
      'merchantEntityId',
      'website',
      'providerCategoryPrimary',
      'providerCategoryDetailed',
    ].includes(condition.field);
  }
}

function normalizeText(value: string | null): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}
