import {
  decimalText,
  economicProjection,
  validateOutput,
} from './comparison.cjs';

describe('benchmark semantic comparison', () => {
  it('never normalizes descriptive numeric-looking text as money', () => {
    expect(() =>
      validateOutput(
        'transactions.activityDate.page-0',
        { data: [{ id: 'first', merchantName: '001', amount: 10 }], total: 1 },
        { data: [{ id: 'first', merchantName: '1', amount: '10' }], total: 1 },
        {},
      ),
    ).toThrow('financial/selection difference');
  });
  it('preserves every digit while normalizing decimal representation', () => {
    expect(decimalText('1000000000000000001.0000')).toBe('1000000000000000001');
    expect(decimalText('1.000000000000000001')).toBe('1.000000000000000001');
    expect(decimalText('1e-18')).toBe('0.000000000000000001');
    expect(decimalText('-0.000')).toBe('0');
  });

  it('does not hide a changed financial value behind string-contract normalization', () => {
    const before = {
      data: [{ id: 'first', amount: { amount: 10, currency: 'USD' } }],
      total: 1,
    };
    const after = {
      data: [
        {
          id: 'first',
          amount: { amount: '10.000000000000000001', currency: 'USD' },
        },
      ],
      total: 1,
    };
    expect(() =>
      validateOutput('transactions.activityDate.page-0', before, after, {}),
    ).toThrow('financial/selection difference');
  });

  it('preserves transaction order and ignores only allowed HTTP pagination additions', () => {
    const before = {
      data: [
        { id: 'first', amount: 10 },
        { id: 'second', amount: 20 },
      ],
      total: 2,
      pageIndex: 0,
      pageSize: 100,
    };
    const after = {
      ...before,
      pageIndex: null,
      nextCursor: null,
      hasMore: false,
    };
    expect(
      validateOutput('http.transactions.convert', before, after, {}),
    ).toContain('parity');
    expect(() =>
      validateOutput(
        'http.transactions.convert',
        before,
        { ...after, data: [...after.data].reverse() },
        {},
      ),
    ).toThrow();
  });

  it('normalizes holdings as an unordered identity set but rejects duplicates', () => {
    const input = {
      data: [
        { id: 'second', institutionValue: { amount: 100 } },
        { id: 'first', institutionValue: { amount: 200 } },
      ],
      query: {},
    };
    expect(
      economicProjection('holdings.1-accounts-100-positions', input),
    ).toEqual(
      economicProjection('holdings.1-accounts-100-positions', {
        ...input,
        data: [...input.data].reverse(),
      }),
    );
    expect(() =>
      economicProjection('holdings.1-accounts-100-positions', {
        ...input,
        data: [input.data[0], input.data[0]],
      }),
    ).toThrow('duplicate');
  });

  it('requires full scan continuation validation before comparing a bounded first call', () => {
    const output = {
      data: [],
      pageInfo: {
        hasMore: true,
        nextCursor: 'next',
        continuationReason: 'scan_budget',
      },
    };
    expect(() =>
      validateOutput(
        'extended.transactions.no-match-amount',
        output,
        output,
        {},
      ),
    ).toThrow('full continuation');
  });

  it('accepts only the named exact EUR-history correction, never a different total', () => {
    const name = 'shape.history.year.100-accounts.sparse-prior-fx.daily';
    const before = {
      chartData: [{ date: '2026-09-05', value: 115554.99999999999 }],
      netWorth: { amount: 11555500 },
    };
    const after = {
      ...before,
      chartData: [{ date: '2026-09-05', value: '115555' }],
      sampling: {
        resolution: 'daily',
        sourcePointCount: 1,
        returnedPointCount: 1,
      },
    };
    expect(validateOutput(name, before, after, {})).toContain(
      'named baseline arithmetic correction',
    );
    expect(() =>
      validateOutput(
        name,
        before,
        { ...after, chartData: [{ date: '2026-09-05', value: '115556' }] },
        {},
      ),
    ).toThrow('projection is incorrect');
    expect(() =>
      validateOutput(
        name,
        before,
        { ...after, netWorth: { amount: '11555501' } },
        {},
      ),
    ).toThrow('financial/selection difference');
  });
});
