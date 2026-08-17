import {
  cashFlowSelectionContext,
  cashFlowTransactionAmount,
  createCashFlowPresentation,
  sortCashFlowTransactions,
} from '../../src/mcp/apps/cash-flow-model';

function money(
  amount: number,
  currency = 'USD',
  sign: 'positive' | 'negative' = 'positive',
) {
  return { amount, currency, sign };
}

function period(
  outflows: Array<{
    code: string;
    amount: number;
    count?: number;
    color?: string;
  }>,
  options: {
    inflows?: Array<{ code: string; amount: number; count?: number }>;
    uncategorizedOutflow?: number;
    net?: number;
    startDate?: string;
    endDate?: string;
  } = {},
) {
  return {
    analysis: {
      startDate: options.startDate ?? '2026-04-01',
      endDate: options.endDate ?? '2026-04-30',
      currency: 'USD',
      totals: {
        totalInflow: money(1000),
        totalOutflow: money(600, 'USD', 'negative'),
        netFlow: money(
          Math.abs(options.net ?? 400),
          'USD',
          (options.net ?? 400) < 0 ? 'negative' : 'positive',
        ),
        uncategorizedInflow: money(0),
        uncategorizedOutflow: money(
          options.uncategorizedOutflow ?? 0,
          'USD',
          'negative',
        ),
      },
      outflows: outflows.map((category) => ({
        primaryCategory: category.code,
        totalAmount: money(category.amount, 'USD', 'negative'),
        transactionCount: category.count ?? 1,
        ...(category.color ? { color: category.color } : {}),
      })),
      inflows: (options.inflows ?? []).map((category) => ({
        primaryCategory: category.code,
        totalAmount: money(category.amount),
        transactionCount: category.count ?? 1,
      })),
    },
    adjustments: {
      affected: false,
      excludedTransactionCount: 0,
      neutralizedPairCount: 0,
    },
  };
}

describe('Cash Flow presentation model', () => {
  it('ranks absolute values deterministically and splits top five, Other, and Uncategorized', () => {
    const presentation = createCashFlowPresentation({
      presentation: { direction: 'outflow' },
      current: period(
        [
          { code: 'ZETA', amount: 30 },
          { code: 'ALPHA', amount: 30 },
          { code: 'LARGEST', amount: 80 },
          { code: 'FOURTH', amount: 20 },
          { code: 'FIFTH', amount: 10 },
          { code: 'SIXTH', amount: 8 },
          { code: 'SEVENTH', amount: 7 },
          { code: 'UNCATEGORIZED', amount: 5, count: 2 },
        ],
        { uncategorizedOutflow: 5 },
      ),
    });

    expect(presentation).not.toBeNull();
    expect(
      presentation?.topCategories.map((category) => category.primaryCategory),
    ).toEqual(['LARGEST', 'ALPHA', 'ZETA', 'FOURTH', 'FIFTH']);
    expect(
      presentation?.remainingCategories.map(
        (category) => category.primaryCategory,
      ),
    ).toEqual(['SIXTH', 'SEVENTH']);
    expect(presentation).toMatchObject({
      otherAmount: 15,
      otherTransactionCount: 2,
      uncategorized: {
        primaryCategory: 'UNCATEGORIZED',
        transactionCount: 2,
        transactionCountKnown: true,
      },
      maxCategoryAmount: 80,
      isEmpty: false,
    });
  });

  it('uses explicit inflow direction and only retains a present focus', () => {
    const focused = createCashFlowPresentation({
      presentation: {
        direction: 'inflow',
        focusCategoryPrimary: 'PAYROLL',
      },
      current: period([], {
        inflows: [
          { code: 'PAYROLL', amount: 900, count: 1 },
          { code: 'INTEREST', amount: 25, count: 2 },
        ],
      }),
    });
    const missing = createCashFlowPresentation({
      presentation: {
        direction: 'inflow',
        focusCategoryPrimary: 'MISSING',
      },
      current: period([], {
        inflows: [{ code: 'PAYROLL', amount: 900 }],
      }),
    });

    expect(focused?.topCategories[0]).toMatchObject({
      primaryCategory: 'PAYROLL',
      label: 'Payroll',
    });
    expect(focused?.focusedCategory?.primaryCategory).toBe('PAYROLL');
    expect(missing?.focusedCategory).toBeUndefined();
  });

  it('calculates exact comparison deltas and synthesizes comparison Uncategorized from totals', () => {
    const presentation = createCashFlowPresentation({
      presentation: { direction: 'outflow' },
      current: period([{ code: 'FOOD', amount: 120 }], {
        uncategorizedOutflow: 40,
        net: 300,
      }),
      comparison: period([{ code: 'FOOD', amount: 80 }], {
        uncategorizedOutflow: 15,
        net: 450,
        startDate: '2026-03-01',
        endDate: '2026-03-15',
      }),
    });

    expect(presentation).toMatchObject({
      netDelta: -150,
      inflowDelta: 0,
      outflowDelta: 0,
      topCategories: [
        { primaryCategory: 'FOOD', comparisonAmount: 80, delta: 40 },
      ],
      uncategorized: { comparisonAmount: 15, delta: 25 },
    });
    expect(presentation?.comparison).toMatchObject({
      startDate: '2026-03-01',
      endDate: '2026-03-15',
    });
  });

  it('handles zero totals, missing colors, and long labels without inventing focus', () => {
    const presentation = createCashFlowPresentation({
      presentation: {
        direction: 'outflow',
        focusCategoryPrimary: 'NOT_PRESENT',
      },
      current: period([
        {
          code: 'VERY_LONG_TEST_OWNED_CATEGORY_LABEL_WITHOUT_A_COLOR',
          amount: 0,
        },
      ]),
    });

    expect(presentation?.topCategories[0]).toMatchObject({
      label: 'Very Long Test Owned Category Label Without A Color',
      color: undefined,
    });
    expect(presentation?.isEmpty).toBe(true);
    expect(presentation?.focusedCategory).toBeUndefined();
  });

  it('sorts transactions by absolute converted amount and only falls back to same-currency native amounts', () => {
    const transactions = sortCashFlowTransactions(
      [
        {
          merchantName: 'Native USD',
          amount: money(50, 'USD', 'negative'),
        },
        {
          merchantName: 'Converted',
          amount: money(1000, 'JPY', 'negative'),
          convertedAmount: money(80, 'USD', 'negative'),
        },
        {
          merchantName: 'Native Other Currency',
          amount: money(10000, 'JPY', 'negative'),
        },
      ],
      'USD',
    );

    expect(transactions.map((transaction) => transaction.merchantName)).toEqual(
      ['Converted', 'Native USD', 'Native Other Currency'],
    );
    expect(cashFlowTransactionAmount(transactions[0], 'USD')).toEqual(
      money(80, 'USD', 'negative'),
    );
    expect(cashFlowTransactionAmount(transactions[2], 'USD')).toBeNull();
  });

  it('creates the minimum semantic selection context without transaction or account details', () => {
    const presentation = createCashFlowPresentation({
      presentation: { direction: 'outflow' },
      current: period([{ code: 'FOOD', amount: 120, count: 3 }]),
    });
    expect(presentation).not.toBeNull();
    if (!presentation) return;
    const context = cashFlowSelectionContext(
      presentation,
      presentation.topCategories[0] ?? null,
    );

    expect(context).toEqual({
      visualization: 'cash_flow',
      selection: {
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        direction: 'outflow',
        categoryPrimary: 'FOOD',
        categoryLabel: 'Food',
        categoryTotal: money(120, 'USD', 'negative'),
        transactionCount: 3,
      },
    });
    expect(JSON.stringify(context)).not.toMatch(
      /account|merchant|transactionRows/,
    );
  });

  it('does not invent a transaction count for synthetic Uncategorized totals', () => {
    const presentation = createCashFlowPresentation({
      presentation: { direction: 'outflow' },
      current: period([], { uncategorizedOutflow: 42 }),
    });
    expect(presentation?.uncategorized).toMatchObject({
      transactionCount: 0,
      transactionCountKnown: false,
    });
    if (!presentation?.uncategorized) return;

    expect(
      cashFlowSelectionContext(presentation, presentation.uncategorized),
    ).toEqual({
      visualization: 'cash_flow',
      selection: {
        startDate: '2026-04-01',
        endDate: '2026-04-30',
        direction: 'outflow',
        categoryPrimary: 'UNCATEGORIZED',
        categoryLabel: 'Uncategorized',
        categoryTotal: money(42, 'USD', 'negative'),
      },
    });
  });
});
