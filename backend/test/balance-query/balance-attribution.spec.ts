import { buildBalanceAttribution } from '../../src/balance-query/balance-attribution';
import {
  buildBalanceWithConversion,
  createSnapshotCursor,
} from '../../src/balance-query/balance-projection';
import { normalizeMcpMoney } from '../../src/mcp/mcp-money';
import { BalanceAttributionOutputSchema } from '../../src/mcp/mcp-schemas';
import {
  decimalRateRatio,
  signedMinorUnits,
} from '../../src/common/exact-money';
import { MoneySign } from '../../src/types/MoneyWithSign';
import type { AccountBalanceResult } from '../../src/types/BalanceQuery';
import type { BalanceSnapshotEntity } from '../../src/balance-snapshot/balance-snapshot.entity';

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function result(
  n: number,
  amount: string,
  date: string,
  type = 'depository',
  currency = 'USD',
  rate = '1',
  snapshotDate: string | null = date,
): AccountBalanceResult {
  const effectiveBalance = buildBalanceWithConversion(
    { money: { amount, currency }, sign: MoneySign.POSITIVE },
    'USD',
    new Map([
      [
        `${currency}:USD`,
        {
          baseCurrency: currency,
          targetCurrency: 'USD',
          rate,
          ratio: decimalRateRatio(rate),
          requestedDate: date,
          rateDate: date,
          source: 'DB',
        },
      ],
    ]),
    date,
  );
  return {
    account: {
      id: id(n),
      name: `Synthetic ${n}`,
      type,
      customName: null,
    } as AccountBalanceResult['account'],
    effectiveBalance,
    availableBalance: effectiveBalance,
    currentBalance: effectiveBalance,
    latestSyncedAt: new Date('2026-09-14T01:00:00Z'),
    provenance: {
      requestedDate: date,
      snapshotId: snapshotDate ? id(n + 10) : null,
      snapshotDate,
      snapshotType: snapshotDate ? 'SYNC' : null,
      snapshotUpdatedAt: snapshotDate ? `${snapshotDate}T12:00:00Z` : null,
      carriedForward: !!snapshotDate && date !== snapshotDate,
      coverage: !snapshotDate
        ? 'missing'
        : snapshotDate === date
          ? 'recorded'
          : 'carried_forward',
    },
  };
}

describe('Recorded balance attribution (synthetic explanatory counterexample)', () => {
  it('reconciles assets and native debt changes exactly without establishing market or spending causation', () => {
    const opening = {
      date: '2026-09-01',
      balances: {
        [id(1)]: result(1, '100000', '2026-09-01', 'investment'),
        [id(2)]: result(
          2,
          '50000',
          '2026-09-01',
          'depository',
          'USD',
          '1',
          '2026-08-30',
        ),
        [id(3)]: result(3, '10000', '2026-09-01', 'loan', 'SGD', '0.75'),
      },
    };
    const closing = {
      date: '2026-09-05',
      balances: {
        [id(1)]: result(1, '90000', '2026-09-05', 'investment'),
        [id(2)]: result(2, '45000', '2026-09-05'),
        [id(3)]: result(3, '20000', '2026-09-05', 'loan', 'SGD', '0.8'),
      },
    };
    const attribution = buildBalanceAttribution(opening, closing, 'USD');
    const output = BalanceAttributionOutputSchema.parse(
      normalizeMcpMoney(attribution),
    );
    expect(output.openingNetWorth.amount).toBe('1425');
    expect(output.closingNetWorth.amount).toBe('1190');
    expect(output.change).toMatchObject({ amount: '235', sign: 'negative' });
    expect(
      output.accounts.map((account) => account.contribution.amount),
    ).toEqual(['100', '85', '50']);
    expect(output.reconciliation).toMatchObject({
      exact: true,
      residual: { amount: '0' },
      contributionTotal: { amount: '235', sign: 'negative' },
    });
    const debt = output.accounts.find((account) => account.isLiability)!;
    expect(debt.nativeBalanceChange).toMatchObject({
      amount: '100',
      currency: 'SGD',
      sign: 'positive',
    });
    // An FX-only debt explanation predicts $5, whereas recorded debt contribution is -$85.
    expect(debt.contribution).toMatchObject({
      amount: '85',
      currency: 'USD',
      sign: 'negative',
    });
    expect(output.basis).toBe('recorded_balance_change');
    expect(output.limitations[0]).toContain(
      'not market P&L or spending attribution',
    );
    const cash = output.accounts.find(
      (account) => account.accountId === id(2),
    )!;
    expect(cash.opening.provenance).toMatchObject({
      snapshotDate: '2026-08-30',
      carriedForward: true,
    });
    expect(cash.opening.latestAccountSyncAt).toBe('2026-09-14T01:00:00.000Z');
    expect(cash.opening.reportingBalance).toEqual(cash.opening.nativeBalance);
  });

  it('distinguishes missing snapshots from zero and preserves exact large amounts and signed debt', () => {
    const first = result(1, '0', '2026-09-01', 'credit', 'USD', '1', null);
    const last = result(1, '900719925474099312345', '2026-09-05', 'credit');
    last.effectiveBalance.balance.sign = MoneySign.NEGATIVE;
    last.effectiveBalance.reportingBalance!.sign = MoneySign.NEGATIVE;
    const output = buildBalanceAttribution(
      { date: '2026-09-01', balances: { [id(1)]: first } },
      { date: '2026-09-05', balances: { [id(1)]: last } },
      'USD',
    );
    expect(output.coverage).toBe('missing_snapshots');
    expect(signedMinorUnits(output.change)).toBe(-900719925474099312345n);
    expect(output.reconciliation.exact).toBe(true);
    expect(output.accounts[0].opening.provenance?.snapshotId).toBeNull();
  });

  it('attributes reporting FX movement while native balances stay unchanged', () => {
    const first = result(1, '10000', '2026-09-01', 'depository', 'EUR', '1.1');
    const last = result(
      1,
      '10000',
      '2026-09-05',
      'depository',
      'EUR',
      '1.2',
      '2026-09-01',
    );
    const output = buildBalanceAttribution(
      { date: '2026-09-01', balances: { [id(1)]: first } },
      { date: '2026-09-05', balances: { [id(1)]: last } },
      'USD',
    );
    expect(signedMinorUnits(output.accounts[0].nativeBalanceChange!)).toBe(0n);
    expect(signedMinorUnits(output.accounts[0].contribution)).toBe(1000n);
    expect(output.accounts[0].closing.provenance?.carriedForward).toBe(true);
    expect(output.reconciliation.exact).toBe(true);
  });

  it('never selects a future snapshot for a past balance', () => {
    const prior = {
      accountId: id(1),
      snapshotDate: '2026-08-30',
      id: id(11),
    } as BalanceSnapshotEntity;
    const future = {
      accountId: id(1),
      snapshotDate: '2026-09-10',
      id: id(12),
    } as BalanceSnapshotEntity;
    const select = createSnapshotCursor([future, prior]);
    expect(select(id(1), '2026-08-01')).toBeUndefined();
    expect(select(id(1), '2026-09-05')).toBe(prior);
    expect(select(id(1), '2026-09-10')).toBe(future);
  });
});
