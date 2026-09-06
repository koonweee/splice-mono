import { decimalRateRatio } from '../../src/common/exact-money';
import { gzipSync } from 'node:zlib';
import {
  DashboardSeriesResponseSchema,
  DashboardSummaryResponseSchema,
  DASHBOARD_PERIOD_DAYS,
} from '../../src/types/Dashboard';
import { BalanceSnapshotType } from '../../src/types/BalanceSnapshot';
import { MoneySign } from '../../src/types/MoneyWithSign';
import {
  createDashboardFixture,
  DASHBOARD_FIXTURE_END_DATE,
  DASHBOARD_FIXTURE_USER_ID,
  fixtureSnapshot,
} from './fixtures/dashboard.fixture';

const userId = DASHBOARD_FIXTURE_USER_ID;
const query = {
  period: 'tenYears' as const,
  endDate: DASHBOARD_FIXTURE_END_DATE,
};

describe('DashboardQueryService', () => {
  it('returns truthful currency-aware zeros and no chart when no accounts exist', async () => {
    const fixture = createDashboardFixture(0);
    const summary = await fixture.dashboard.getSummary(userId, query);
    expect(summary).toMatchObject({
      netWorth: { money: { amount: '0', currency: 'USD' }, sign: 'positive' },
      changeAmount: { money: { amount: '0' } },
      assets: [],
      liabilities: [],
    });
    expect(summary.changePercent).toBeUndefined();
    expect((await fixture.dashboard.getSeries(userId, query)).points).toEqual(
      [],
    );
    expect(fixture.reads.snapshots).toBe(0);
    expect(fixture.reads.rates).toBe(0);
    expect(DashboardSummaryResponseSchema.safeParse(summary).success).toBe(
      true,
    );
  });

  it('preserves signs, JPY precision, native currencies, sparse history, archived inclusion and outside-range real sync', async () => {
    const fixture = createDashboardFixture(4);
    const [asset, other, empty, debt] = fixture.accounts;
    fixture.snapshots.splice(
      0,
      fixture.snapshots.length,
      fixtureSnapshot(asset.id, '2026-08-01', 10000, 'JPY'),
      fixtureSnapshot(asset.id, '2026-09-01', -20000, 'USD'),
      fixtureSnapshot(
        asset.id,
        '2026-09-03',
        -20000,
        'USD',
        BalanceSnapshotType.FORWARD_FILL,
      ),
      fixtureSnapshot(asset.id, '2026-10-01', 80000, 'USD'),
      fixtureSnapshot(other.id, '2026-08-01', 30000, 'USD'),
      fixtureSnapshot(other.id, '2026-09-05', 40000, 'USD'),
      fixtureSnapshot(debt.id, '2026-08-01', -5000, 'USD'),
      fixtureSnapshot(debt.id, '2026-09-05', 6000, 'USD'),
    );
    const summary = await fixture.dashboard.getSummary(userId, {
      period: 'month',
      endDate: query.endDate,
    });
    // Prior: JPY 10,000 -> USD 70; plus USD 300 less USD 50 = USD 320.
    // Latest: USD -200 plus USD 400 less USD 60 = USD 140.
    expect(summary.netWorth).toEqual({
      money: { amount: '14000', currency: 'USD' },
      sign: MoneySign.POSITIVE,
    });
    expect(summary.changeAmount).toEqual({
      money: { amount: '18000', currency: 'USD' },
      sign: MoneySign.NEGATIVE,
    });
    expect(summary.changePercent).toBe(-56.25);
    expect(summary.assets.map((account) => account.id)).toEqual([
      other.id,
      empty.id,
      asset.id,
    ]);
    const assetSummary = summary.assets.find(
      (account) => account.id === asset.id,
    )!;
    expect(assetSummary.archivedAt).toBe('2026-01-01T12:00:00.000Z');
    expect(assetSummary.syncedAt).toBe('2026-10-01T12:00:00.000Z');
    expect(assetSummary.changeAmount).toEqual({
      money: { amount: '27000', currency: 'USD' },
      sign: MoneySign.NEGATIVE,
    });
    expect(
      summary.assets.find((account) => account.id === empty.id)?.changePercent,
    ).toBeUndefined();
    expect(
      summary.assets.find((account) => account.id === other.id)?.valuationMode,
    ).toBe('holdings');
    const series = await fixture.dashboard.getSeries(userId, {
      period: 'month',
      endDate: query.endDate,
    });
    expect(series.points[0].netWorth.money.amount).toBe('32000');
    expect(series.points.at(-1)?.netWorth).toEqual(summary.netWorth);
    expect(series.points).toHaveLength(31);
  });

  it('uses the authenticated JPY reporting currency with integer zero-decimal conversions', async () => {
    const fixture = createDashboardFixture(1);
    fixture.users.findSettings = async (id) => ({
      id,
      settings: { currency: 'JPY' },
    });
    fixture.rates.getRatesForDateRange = async (pairs, date) => [
      {
        date,
        rates: pairs.map((pair) => ({
          ...pair,
          rate: '150',
          ratio: decimalRateRatio('150'),
          source: 'synthetic',
        })),
      },
    ];
    fixture.snapshots.splice(
      0,
      fixture.snapshots.length,
      fixtureSnapshot(fixture.accounts[0].id, '2026-09-04', 10000, 'USD'),
      fixtureSnapshot(fixture.accounts[0].id, '2026-09-05', 10000, 'JPY'),
    );
    const summary = await fixture.dashboard.getSummary(userId, {
      ...query,
      period: 'day',
    });
    expect(summary.reportingCurrency).toBe('JPY');
    expect(summary.netWorth.money).toEqual({
      amount: '10000',
      currency: 'JPY',
    });
    expect(summary.changeAmount).toEqual({
      money: { amount: '5000', currency: 'JPY' },
      sign: 'negative',
    });
    expect(summary.assets[0].effectiveBalance.money.currency).toBe('JPY');
    expect(summary.assets[0].convertedEffectiveBalance).toBeUndefined();
  });

  it('includes a month-first final date exactly once', async () => {
    const result = await createDashboardFixture(1).dashboard.getSeries(userId, {
      period: 'year',
      endDate: '2026-09-01',
    });
    expect(result.points.at(-1)?.date).toBe('2026-09-01');
    expect(
      result.points.filter((point) => point.date === '2026-09-01'),
    ).toHaveLength(1);
  });

  it('requires FX on discarded chart dates, while endpoint-only summary succeeds independently', async () => {
    const fixture = createDashboardFixture(1);
    fixture.snapshots.splice(
      0,
      fixture.snapshots.length,
      fixtureSnapshot(fixture.accounts[0].id, '2025-01-01', 10000, 'JPY'),
    );
    const original = fixture.rates.getRatesForDateRange;
    fixture.rates.getRatesForDateRange = async (...args) =>
      (await original(...args)).filter((row) => row.date !== '2026-04-15');
    await expect(
      fixture.dashboard.getSeries(userId, { ...query, period: 'year' }),
    ).rejects.toThrow('on 2026-04-15');
    await expect(
      fixture.dashboard.getSummary(userId, { ...query, period: 'year' }),
    ).resolves.toMatchObject({
      netWorth: { money: { amount: '7000', currency: 'USD' } },
    });
  });

  it('does not require FX for zero or superseded prior snapshot currencies', async () => {
    const fixture = createDashboardFixture(1);
    fixture.snapshots.splice(
      0,
      fixture.snapshots.length,
      fixtureSnapshot(fixture.accounts[0].id, '2026-09-03', 100, 'BAD'),
      fixtureSnapshot(fixture.accounts[0].id, '2026-09-04', 0, 'JPY'),
    );
    fixture.rates.getRatesForDateRange = () => {
      throw new Error('No FX should be read');
    };
    const summary = await fixture.dashboard.getSummary(userId, {
      ...query,
      period: 'day',
    });
    expect(summary.assets[0].effectiveBalance.money.currency).toBe('JPY');
    expect(summary.assets[0].convertedEffectiveBalance?.money).toEqual({
      amount: '0',
      currency: 'USD',
    });
    await expect(
      fixture.dashboard.getSeries(userId, { ...query, period: 'day' }),
    ).resolves.toMatchObject({
      points: [{ date: '2026-09-04' }, { date: '2026-09-05' }],
    });
  });

  it.each(Object.entries(DASHBOARD_PERIOD_DAYS))(
    'preserves inclusive %s day-count boundaries and monthly sampling',
    async (period, days) => {
      const fixture = createDashboardFixture(1);
      const result = await fixture.dashboard.getSeries(userId, {
        ...query,
        period: period as keyof typeof DASHBOARD_PERIOD_DAYS,
      });
      expect(
        (Date.parse(result.endDate) - Date.parse(result.startDate)) / 86400000,
      ).toBe(days);
      expect(result.points.at(-1)?.date).toBe(result.endDate);
      expect(new Set(result.points.map((point) => point.date)).size).toBe(
        result.points.length,
      );
      if (days <= 30) expect(result.points).toHaveLength(days + 1);
      else
        expect(
          result.points
            .slice(0, -1)
            .every((point) => point.date.endsWith('-01')),
        ).toBe(true);
      expect(result.points.length).toBeLessThanOrEqual(122);
      expect(DashboardSeriesResponseSchema.safeParse(result).success).toBe(
        true,
      );
    },
  );

  it('uses bounded reads and reduces combined payload by over 90% on synthetic twenty-account ten-year history', async () => {
    const fixture = createDashboardFixture();
    const summary = await fixture.dashboard.getSummary(userId, query);
    expect(fixture.reads).toEqual({
      accounts: 1,
      users: 1,
      snapshots: 3,
      rates: 2,
    });
    const series = await fixture.dashboard.getSeries(userId, query);
    expect(fixture.reads).toEqual({
      accounts: 2,
      users: 2,
      snapshots: 5,
      rates: 3,
    });
    const old = await fixture.legacy.getAllBalancesForDateRange(
      summary.startDate,
      summary.endDate,
      userId,
    );
    // Differential oracle uses the legacy wire response, separately sums signed
    // converted minor units, and applies the original chart sampling rule.
    const expectedPoints = old
      .filter(
        (row, index) => row.date.endsWith('-01') || index === old.length - 1,
      )
      .map((row) => ({
        date: row.date,
        amount: Object.values(row.balances).reduce((sum, item) => {
          const money =
            item.effectiveBalance.convertedBalance ??
            item.effectiveBalance.balance;
          const liability =
            item.account.type === 'credit' || item.account.type === 'loan';
          return (
            sum +
            (liability || money.sign === 'negative'
              ? -BigInt(money.money.amount)
              : BigInt(money.money.amount))
          );
        }, 0n),
      }));
    expect(
      series.points.map((point) => ({
        date: point.date,
        amount:
          (point.netWorth.sign === 'negative' ? -1n : 1n) *
          BigInt(point.netWorth.money.amount),
      })),
    ).toEqual(expectedPoints);
    expect(series.points.at(-1)?.netWorth).toEqual(summary.netWorth);
    const oldJson = JSON.stringify(old);
    const summaryJson = JSON.stringify(summary);
    const seriesJson = JSON.stringify(series);
    const report = {
      oldBytes: Buffer.byteLength(oldJson),
      compactBytes:
        Buffer.byteLength(summaryJson) + Buffer.byteLength(seriesJson),
      oldGzipBytes: gzipSync(oldJson).byteLength,
      compactGzipBytes:
        gzipSync(summaryJson).byteLength + gzipSync(seriesJson).byteLength,
      points: series.points.length,
    };
    expect(report.compactBytes / report.oldBytes).toBeLessThan(0.1);
    expect(seriesJson).not.toContain('account');
    console.info('Synthetic dashboard payload comparison', report);
  });

  it('scopes all repository reads to the authenticated identity', async () => {
    const fixture = createDashboardFixture(1);
    const accountFind = jest.spyOn(fixture.accountRepository, 'find');
    await expect(
      fixture.dashboard.getSummary('different-user', query),
    ).rejects.toThrow('Unauthorized');
    expect(accountFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'different-user' },
        relations: ['bankLink'],
      }),
    );
    expect(fixture.reads.snapshots).toBe(0);
  });
});
