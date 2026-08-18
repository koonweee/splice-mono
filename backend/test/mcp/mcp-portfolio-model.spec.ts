import {
  createPortfolioPresentation,
  formatPortfolioMoney,
  formatPortfolioPercentage,
  portfolioAccountLabel,
  portfolioPositionById,
  portfolioSelectionContext,
  portfolioSnapshotLabel,
  type PortfolioPosition,
} from '../../src/mcp/apps/portfolio-model';

function money(amount: number) {
  return { amount, currency: 'USD', sign: 'positive' } as const;
}

function position(
  securityId: string,
  amount: number,
  allocationBps: number,
  overrides: Partial<PortfolioPosition> = {},
): PortfolioPosition {
  return {
    securityId,
    securityName: `Holding ${securityId}`,
    tickerSymbol: securityId.toUpperCase(),
    type: 'equity',
    subtype: null,
    quantity: '1',
    valueUsd: money(amount),
    allocationBps,
    contributions: [
      {
        accountId: `account-${securityId}`,
        accountName: `Account ${securityId}`,
        snapshotDate: '2026-08-16',
        quantity: '1',
        valueUsd: money(amount),
        priceUsd: money(amount),
      },
    ],
    ...overrides,
  };
}

function payload(positions: readonly PortfolioPosition[]) {
  return {
    reportingCurrency: 'USD',
    totalValueUsd: money(
      positions.reduce((sum, item) => sum + item.valueUsd.amount, 0),
    ),
    snapshotRange: {
      earliest: '2026-08-15',
      latest: '2026-08-16',
    },
    positions,
  };
}

describe('portfolio presentation model', () => {
  it('ranks stably and splits the top five from exact Other arithmetic', () => {
    const presentation = createPortfolioPresentation(
      payload([
        position('g', 10.01, 101),
        position('b', 70.02, 700),
        position('f', 20.03, 200),
        position('a', 80.04, 800),
        position('e', 30.05, 300),
        position('d', 40.06, 400),
        position('c', 60.07, 600),
      ]),
    );

    expect(presentation?.topPositions.map((item) => item.securityId)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(
      presentation?.remainingPositions.map((item) => item.securityId),
    ).toEqual(['f', 'g']);
    expect(presentation?.otherValueUsd).toEqual(money(30.04));
    expect(presentation?.otherAllocationBps).toBe(301);
  });

  it('uses label then security identity to break equal-value ties', () => {
    const presentation = createPortfolioPresentation(
      payload([
        position('z', 10, 5000, { securityName: 'Alpha' }),
        position('a', 10, 5000, { securityName: 'Alpha' }),
        position('b', 10, 5000, { securityName: 'Beta' }),
      ]),
    );
    expect(presentation?.positions.map((item) => item.securityId)).toEqual([
      'a',
      'z',
      'b',
    ]);
  });

  it.each([1, 5])('keeps %s holdings in the primary ranked set', (count) => {
    const positions = Array.from({ length: count }, (_, index) =>
      position(String(index), count - index, Math.floor(10_000 / count)),
    );
    const presentation = createPortfolioPresentation(payload(positions));
    expect(presentation?.topPositions).toHaveLength(count);
    expect(presentation?.remainingPositions).toHaveLength(0);
  });

  it('preserves multi-account evidence and absent optional details', () => {
    const combined = position('combined', 1250, 10_000, {
      securityName:
        'A deliberately long security name that must remain usable on phones',
      tickerSymbol: null,
      quantity: null,
      contributions: [
        {
          accountId: 'one',
          accountName: 'Long-term investing',
          snapshotDate: '2026-08-15',
          quantity: null,
          valueUsd: money(1000),
          priceUsd: null,
        },
        {
          accountId: 'two',
          accountName: null,
          snapshotDate: '2026-08-16',
          quantity: null,
          valueUsd: money(250),
          priceUsd: null,
        },
      ],
    });
    const presentation = createPortfolioPresentation(payload([combined]));
    const selected = presentation
      ? portfolioPositionById(presentation, 'combined')
      : null;

    expect(selected?.quantity).toBeNull();
    expect(selected?.contributions).toHaveLength(2);
    expect(portfolioAccountLabel(selected!.contributions[1])).toBe(
      'Investment account',
    );
    expect(portfolioSelectionContext(presentation!, selected)).toEqual(
      expect.objectContaining({
        visualization: 'portfolio',
        selection: expect.objectContaining({
          securityId: 'combined',
          accountNames: ['Long-term investing', 'Investment account'],
        }),
      }),
    );
  });

  it('formats percentages and snapshot ranges concisely', () => {
    expect(formatPortfolioMoney(money(12_345.67))).toBe('$12,345.67');
    expect(formatPortfolioPercentage(3412)).toBe('34%');
    expect(formatPortfolioPercentage(845)).toBe('8.5%');
    expect(
      portfolioSnapshotLabel({ earliest: '2026-08-16', latest: '2026-08-16' }),
    ).toBe('Holdings as of 2026-08-16');
    expect(
      portfolioSnapshotLabel({ earliest: '2026-08-14', latest: '2026-08-16' }),
    ).toBe('Latest holdings span 2026-08-14 to 2026-08-16');
  });

  it('returns a purposeful empty presentation for an empty portfolio', () => {
    const presentation = createPortfolioPresentation({
      reportingCurrency: 'USD',
      totalValueUsd: money(0),
      snapshotRange: null,
      positions: [],
    });
    expect(presentation).toMatchObject({
      isEmpty: true,
      snapshotRange: null,
      positions: [],
      otherValueUsd: money(0),
    });
  });

  it('keeps a zero-value holding factual without inventing allocation', () => {
    const presentation = createPortfolioPresentation(
      payload([position('zero', 0, 0)]),
    );
    expect(presentation).toMatchObject({
      isEmpty: false,
      totalValueUsd: money(0),
      topPositions: [
        expect.objectContaining({
          securityId: 'zero',
          allocationBps: 0,
          valueUsd: money(0),
        }),
      ],
    });
    expect(formatPortfolioPercentage(0)).toBe('0%');
  });

  it.each([
    undefined,
    {},
    { reportingCurrency: 'SGD', totalValueUsd: money(0), positions: [] },
    {
      reportingCurrency: 'USD',
      totalValueUsd: money(1),
      snapshotRange: null,
      positions: [{ ...position('a', 1, 10_000), valueUsd: null }],
    },
  ])('rejects malformed portfolio payload %#', (value) => {
    expect(createPortfolioPresentation(value)).toBeNull();
  });

  it('clears selection context without retaining portfolio identities', () => {
    const presentation = createPortfolioPresentation(
      payload([position('a', 1, 10_000)]),
    );
    expect(portfolioSelectionContext(presentation!, null)).toEqual({
      visualization: 'portfolio',
      selection: null,
    });
  });
});
