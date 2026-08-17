export type CashFlowDirection = 'outflow' | 'inflow';

export interface CashFlowMoney {
  readonly amount: number;
  readonly currency: string;
  readonly sign?: 'positive' | 'negative';
}

export interface CashFlowCategory {
  readonly primaryCategory: string;
  readonly label: string;
  readonly totalAmount: CashFlowMoney;
  readonly transactionCount: number;
  readonly transactionCountKnown?: boolean;
  readonly color?: string;
  readonly comparisonAmount?: number;
  readonly delta?: number;
}

export interface CashFlowAdjustmentSummary {
  readonly affected: boolean;
  readonly excludedTransactionCount: number;
  readonly neutralizedPairCount: number;
}

export interface CashFlowPeriodView {
  readonly startDate: string;
  readonly endDate: string;
  readonly currency: string;
  readonly totalInflow: CashFlowMoney;
  readonly totalOutflow: CashFlowMoney;
  readonly netFlow: CashFlowMoney;
  readonly adjustments: CashFlowAdjustmentSummary;
}

export interface CashFlowPresentation {
  readonly direction: CashFlowDirection;
  readonly current: CashFlowPeriodView;
  readonly comparison?: CashFlowPeriodView;
  readonly netDelta?: number;
  readonly inflowDelta?: number;
  readonly outflowDelta?: number;
  readonly topCategories: readonly CashFlowCategory[];
  readonly remainingCategories: readonly CashFlowCategory[];
  readonly otherAmount: number;
  readonly otherTransactionCount: number;
  readonly uncategorized?: CashFlowCategory;
  readonly focusedCategory?: CashFlowCategory;
  readonly maxCategoryAmount: number;
  readonly isEmpty: boolean;
}

export interface CashFlowTransaction {
  readonly [key: string]: unknown;
  readonly activityDate?: string;
  readonly merchantName?: string | null;
  readonly originalDescription?: string | null;
  readonly amount?: CashFlowMoney;
  readonly convertedAmount?: CashFlowMoney;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
}

export function moneySignedAmount(value: unknown): number {
  if (!isRecord(value)) return finiteNumber(value) ?? 0;
  const amount = finiteNumber(value.amount) ?? 0;
  return value.sign === 'negative' ? -Math.abs(amount) : Math.abs(amount);
}

export function moneyMagnitude(value: unknown): number {
  return Math.abs(moneySignedAmount(value));
}

function parseMoney(value: unknown, fallbackCurrency: string): CashFlowMoney {
  const record = isRecord(value) ? value : {};
  const signed = moneySignedAmount(value);
  return {
    amount: Math.abs(signed),
    currency:
      typeof record.currency === 'string' && record.currency.length > 0
        ? record.currency
        : fallbackCurrency,
    sign: signed < 0 ? 'negative' : 'positive',
  };
}

export function formatCashFlowCategory(value: unknown): string {
  const label = typeof value === 'string' ? value : 'Uncategorized';
  return label
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function categoryIdentity(value: unknown): string {
  return typeof value === 'string' && value.length > 0
    ? value
    : 'UNCATEGORIZED';
}

function isUncategorized(value: string): boolean {
  return value.toUpperCase() === 'UNCATEGORIZED';
}

function parseAdjustmentSummary(value: unknown): CashFlowAdjustmentSummary {
  const record = isRecord(value) ? value : {};
  return {
    affected: record.affected === true,
    excludedTransactionCount: Math.max(
      0,
      Math.trunc(finiteNumber(record.excludedTransactionCount) ?? 0),
    ),
    neutralizedPairCount: Math.max(
      0,
      Math.trunc(finiteNumber(record.neutralizedPairCount) ?? 0),
    ),
  };
}

interface ParsedPeriod {
  readonly view: CashFlowPeriodView;
  readonly categories: readonly CashFlowCategory[];
  readonly uncategorizedMoney: CashFlowMoney;
}

function parsePeriod(
  value: unknown,
  direction: CashFlowDirection,
): ParsedPeriod | null {
  if (!isRecord(value) || !isRecord(value.analysis)) return null;
  const analysis = value.analysis;
  const startDate = analysis.startDate;
  const endDate = analysis.endDate;
  const currency = analysis.currency;
  if (
    typeof startDate !== 'string' ||
    typeof endDate !== 'string' ||
    typeof currency !== 'string' ||
    !isRecord(analysis.totals)
  ) {
    return null;
  }

  const totals = analysis.totals;
  const rawCategories = Array.isArray(
    analysis[direction === 'outflow' ? 'outflows' : 'inflows'],
  )
    ? (analysis[direction === 'outflow' ? 'outflows' : 'inflows'] as unknown[])
    : [];
  const categories = rawCategories.filter(isRecord).map((category) => {
    const primaryCategory = categoryIdentity(category.primaryCategory);
    return {
      primaryCategory,
      label: formatCashFlowCategory(primaryCategory),
      totalAmount: parseMoney(category.totalAmount, currency),
      transactionCount: Math.max(
        0,
        Math.trunc(finiteNumber(category.transactionCount) ?? 0),
      ),
      transactionCountKnown: finiteNumber(category.transactionCount) !== null,
      color: typeof category.color === 'string' ? category.color : undefined,
    } satisfies CashFlowCategory;
  });

  return {
    view: {
      startDate,
      endDate,
      currency,
      totalInflow: parseMoney(totals.totalInflow, currency),
      totalOutflow: parseMoney(totals.totalOutflow, currency),
      netFlow: parseMoney(totals.netFlow, currency),
      adjustments: parseAdjustmentSummary(value.adjustments),
    },
    categories,
    uncategorizedMoney: parseMoney(
      totals[
        direction === 'outflow' ? 'uncategorizedOutflow' : 'uncategorizedInflow'
      ],
      currency,
    ),
  };
}

function stableCategorySort(
  left: CashFlowCategory,
  right: CashFlowCategory,
): number {
  const amountDifference =
    moneyMagnitude(right.totalAmount) - moneyMagnitude(left.totalAmount);
  if (amountDifference !== 0) return amountDifference;
  const labelDifference = left.label.localeCompare(right.label);
  return labelDifference !== 0
    ? labelDifference
    : left.primaryCategory.localeCompare(right.primaryCategory);
}

function categoryMap(
  categories: readonly CashFlowCategory[],
): Map<string, CashFlowCategory> {
  return new Map(
    categories.map((category) => [category.primaryCategory, category]),
  );
}

function withComparison(
  category: CashFlowCategory,
  comparison: ReadonlyMap<string, CashFlowCategory>,
): CashFlowCategory {
  const comparisonAmount = moneyMagnitude(
    comparison.get(category.primaryCategory)?.totalAmount,
  );
  const currentAmount = moneyMagnitude(category.totalAmount);
  return {
    ...category,
    comparisonAmount,
    delta: currentAmount - comparisonAmount,
  };
}

export function createCashFlowPresentation(
  value: unknown,
): CashFlowPresentation | null {
  if (!isRecord(value) || !isRecord(value.presentation)) return null;
  const direction: CashFlowDirection =
    value.presentation.direction === 'inflow' ? 'inflow' : 'outflow';
  const current = parsePeriod(value.current, direction);
  if (!current) return null;
  const comparison = value.comparison
    ? parsePeriod(value.comparison, direction)
    : null;
  if (value.comparison && !comparison) return null;

  const currentUncategorized = current.categories.find((category) =>
    isUncategorized(category.primaryCategory),
  );
  const uncategorizedMagnitude = moneyMagnitude(current.uncategorizedMoney);
  const uncategorized = currentUncategorized
    ? {
        ...currentUncategorized,
        totalAmount:
          moneyMagnitude(currentUncategorized.totalAmount) > 0
            ? currentUncategorized.totalAmount
            : current.uncategorizedMoney,
      }
    : uncategorizedMagnitude > 0
      ? {
          primaryCategory: 'UNCATEGORIZED',
          label: 'Uncategorized',
          totalAmount: current.uncategorizedMoney,
          transactionCount: 0,
          transactionCountKnown: false,
        }
      : undefined;

  const comparisonUncategorizedInCategories = comparison?.categories.find(
    (category) => isUncategorized(category.primaryCategory),
  );
  const comparisonUncategorized = comparison
    ? comparisonUncategorizedInCategories
      ? {
          ...comparisonUncategorizedInCategories,
          totalAmount:
            moneyMagnitude(comparisonUncategorizedInCategories.totalAmount) > 0
              ? comparisonUncategorizedInCategories.totalAmount
              : comparison.uncategorizedMoney,
        }
      : moneyMagnitude(comparison.uncategorizedMoney) > 0
        ? {
            primaryCategory: 'UNCATEGORIZED',
            label: 'Uncategorized',
            totalAmount: comparison.uncategorizedMoney,
            transactionCount: 0,
            transactionCountKnown: false,
          }
        : undefined
    : undefined;
  const comparisonCategories = comparison
    ? categoryMap([
        ...comparison.categories,
        ...(comparisonUncategorized ? [comparisonUncategorized] : []),
      ])
    : new Map<string, CashFlowCategory>();
  let ranked = [...current.categories]
    .filter((category) => !isUncategorized(category.primaryCategory))
    .sort(stableCategorySort);
  if (comparison) {
    ranked = ranked.map((category) =>
      withComparison(category, comparisonCategories),
    );
  }
  const comparedUncategorized =
    uncategorized && comparison
      ? withComparison(uncategorized, comparisonCategories)
      : uncategorized;

  const topCategories = ranked.slice(0, 5);
  const remainingCategories = ranked.slice(5);
  const allVisibleIdentities = [
    ...ranked,
    ...(comparedUncategorized ? [comparedUncategorized] : []),
  ];
  const requestedFocus =
    typeof value.presentation.focusCategoryPrimary === 'string'
      ? value.presentation.focusCategoryPrimary
      : undefined;
  const focusedCategory = requestedFocus
    ? allVisibleIdentities.find(
        (category) => category.primaryCategory === requestedFocus,
      )
    : undefined;
  const amounts = allVisibleIdentities.map((category) =>
    moneyMagnitude(category.totalAmount),
  );

  return {
    direction,
    current: current.view,
    comparison: comparison?.view,
    netDelta: comparison
      ? moneySignedAmount(current.view.netFlow) -
        moneySignedAmount(comparison.view.netFlow)
      : undefined,
    inflowDelta: comparison
      ? moneyMagnitude(current.view.totalInflow) -
        moneyMagnitude(comparison.view.totalInflow)
      : undefined,
    outflowDelta: comparison
      ? moneyMagnitude(current.view.totalOutflow) -
        moneyMagnitude(comparison.view.totalOutflow)
      : undefined,
    topCategories,
    remainingCategories,
    otherAmount: remainingCategories.reduce(
      (total, category) => total + moneyMagnitude(category.totalAmount),
      0,
    ),
    otherTransactionCount: remainingCategories.reduce(
      (total, category) => total + category.transactionCount,
      0,
    ),
    uncategorized: comparedUncategorized,
    focusedCategory,
    maxCategoryAmount: Math.max(1, ...amounts),
    isEmpty: amounts.every((amount) => amount === 0),
  };
}

function transactionMoney(
  transaction: CashFlowTransaction,
  reportingCurrency: string,
): CashFlowMoney | null {
  if (transaction.convertedAmount) return transaction.convertedAmount;
  if (transaction.amount && transaction.amount.currency === reportingCurrency) {
    return transaction.amount;
  }
  return null;
}

export function cashFlowTransactionAmount(
  transaction: CashFlowTransaction,
  reportingCurrency: string,
): CashFlowMoney | null {
  return transactionMoney(transaction, reportingCurrency);
}

export function sortCashFlowTransactions(
  value: unknown,
  reportingCurrency: string,
): CashFlowTransaction[] {
  const rows = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.data)
      ? value.data
      : [];
  return rows
    .filter(isRecord)
    .map((row) => row as CashFlowTransaction)
    .sort((left, right) => {
      const amountDifference =
        moneyMagnitude(transactionMoney(right, reportingCurrency)) -
        moneyMagnitude(transactionMoney(left, reportingCurrency));
      if (amountDifference !== 0) return amountDifference;
      return String(right.activityDate ?? '').localeCompare(
        String(left.activityDate ?? ''),
      );
    });
}

export function cashFlowSelectionContext(
  presentation: CashFlowPresentation,
  category: CashFlowCategory | null,
): Record<string, unknown> {
  if (!category) {
    return {
      visualization: 'cash_flow',
      selection: null,
    };
  }
  return {
    visualization: 'cash_flow',
    selection: {
      startDate: presentation.current.startDate,
      endDate: presentation.current.endDate,
      direction: presentation.direction,
      categoryPrimary: category.primaryCategory,
      categoryLabel: category.label,
      categoryTotal: category.totalAmount,
      ...(category.transactionCountKnown === false
        ? {}
        : { transactionCount: category.transactionCount }),
    },
  };
}
