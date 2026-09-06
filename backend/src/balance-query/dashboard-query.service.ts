import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import type { BalanceQueryPerDateResult } from '../types/BalanceQuery';
import {
  DASHBOARD_PERIOD_DAYS,
  type DashboardAccountSummary,
  type DashboardQuery,
  type DashboardSeriesResponse,
  type DashboardSummaryResponse,
} from '../types/Dashboard';
import { BalanceQueryService } from './balance-query.service';
import {
  calculateChangePercent,
  compareBalanceAmounts,
  calculateNetWorthForDate,
  createMoneyWithSign,
  getSignedAmount,
  isLiabilityType,
} from './balance-projection';

@Injectable()
export class DashboardQueryService {
  constructor(private readonly balances: BalanceQueryService) {}

  private getStartDate(userId: string, query: DashboardQuery): Promise<string> {
    return query.period === 'all'
      ? this.balances.getHistoryStartDate(userId, query.endDate)
      : Promise.resolve(
          dayjs(query.endDate)
            .subtract(DASHBOARD_PERIOD_DAYS[query.period], 'day')
            .format('YYYY-MM-DD'),
        );
  }

  async getSummary(
    userId: string,
    query: DashboardQuery,
  ): Promise<DashboardSummaryResponse> {
    const startDate = await this.getStartDate(userId, query);
    const projection = await this.balances.loadDashboardProjection(
      userId,
      startDate,
      query.endDate,
      true,
    );
    let first: BalanceQueryPerDateResult | undefined;
    let last: BalanceQueryPerDateResult | undefined;
    for (const date of projection.balances) {
      first ??= date;
      last = date;
    }
    const currency = projection.reportingCurrency;
    const current = last ? calculateNetWorthForDate(last.balances) : 0n;
    const previous = first ? calculateNetWorthForDate(first.balances) : 0n;
    const assets: DashboardAccountSummary[] = [];
    const liabilities: DashboardAccountSummary[] = [];
    for (const [id, result] of Object.entries(last?.balances ?? {})) {
      const effective = result.effectiveBalance;
      const initial = first?.balances[id]?.effectiveBalance;
      const currentAmount = getSignedAmount(
        effective.convertedBalance ?? effective.balance,
      );
      const previousAmount = initial
        ? getSignedAmount(initial.convertedBalance ?? initial.balance)
        : 0n;
      const account = result.account;
      const summary: DashboardAccountSummary = {
        id,
        name: account.name ?? '',
        customName: account.customName ?? null,
        type: account.type,
        subType: account.subType,
        valuationMode: account.valuationMode,
        institutionName: account.bankLink?.institutionName ?? null,
        archivedAt: account.archivedAt?.toISOString() ?? null,
        syncedAt: result.latestSyncedAt?.toISOString() ?? null,
        effectiveBalance: effective.balance,
        convertedEffectiveBalance: effective.convertedBalance,
        changeAmount: createMoneyWithSign(
          currentAmount - previousAmount,
          currency,
        ),
        changePercent: calculateChangePercent(currentAmount, previousAmount),
      };
      (isLiabilityType(account.type) ? liabilities : assets).push(summary);
    }
    const sort = (a: DashboardAccountSummary, b: DashboardAccountSummary) =>
      compareBalanceAmounts(
        getSignedAmount(b.convertedEffectiveBalance ?? b.effectiveBalance),
        getSignedAmount(a.convertedEffectiveBalance ?? a.effectiveBalance),
      );
    return {
      ...query,
      startDate,
      reportingCurrency: currency,
      generatedAt: new Date().toISOString(),
      netWorth: createMoneyWithSign(current, currency),
      changeAmount: createMoneyWithSign(current - previous, currency),
      changePercent: calculateChangePercent(current, previous),
      assets: assets.sort(sort),
      liabilities: liabilities.sort(sort),
    };
  }

  async getSeries(
    userId: string,
    query: DashboardQuery,
  ): Promise<DashboardSeriesResponse> {
    const startDate = await this.getStartDate(userId, query);
    const projection = await this.balances.loadDashboardProjection(
      userId,
      startDate,
      query.endDate,
      false,
    );
    const points: DashboardSeriesResponse['points'] = [];
    // Keep all-history responses bounded while retaining both endpoints.
    const monthStride = Math.max(
      1,
      Math.ceil(
        dayjs(query.endDate).diff(dayjs(startDate).startOf('month'), 'month') /
          119,
      ),
    );
    for (const result of projection.balances) {
      // Iterating validates FX for every date, including dates omitted from charts.
      const netWorth = calculateNetWorthForDate(result.balances);
      if (
        (query.period !== 'all' && DASHBOARD_PERIOD_DAYS[query.period] <= 30) ||
        (query.period === 'all' && result.date === startDate) ||
        (result.date.endsWith('-01') &&
          (query.period !== 'all' ||
            dayjs(result.date).diff(
              dayjs(startDate).startOf('month'),
              'month',
            ) %
              monthStride ===
              0)) ||
        result.date === query.endDate
      ) {
        points.push({
          date: result.date,
          netWorth: createMoneyWithSign(netWorth, projection.reportingCurrency),
        });
      }
    }
    return {
      ...query,
      startDate,
      reportingCurrency: projection.reportingCurrency,
      generatedAt: new Date().toISOString(),
      points,
    };
  }
}
