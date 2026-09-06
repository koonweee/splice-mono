import { ExactDecimal } from '../common/exact-money';
import { getDecimalPlaces } from '../common/currency-scales';
import {
  sampleHistory,
  type HistoryResolution,
  type HistorySampling,
} from './history-sampling';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import dayjs from 'dayjs';
import {
  formatAccountLabel,
  getAccountGrouping,
  getAccountGroupingLabel,
  type AccountGrouping,
} from '../account/account-labels';
import type {
  BalanceQueryPerDateResult,
  AccountBalanceResult,
  BalanceWithConvertedBalance,
} from '../types/BalanceQuery';
import {
  MoneySign,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';
import { BalanceQueryService } from './balance-query.service';
import {
  isLiabilityType,
  getSignedAmount,
  calculateNetWorthForDate,
  calculateChangePercent,
  createMoneyWithSign,
  compareBalanceAmounts,
} from './balance-projection';

export interface BalanceHistorySurfaceChartPoint {
  date: string;
  label: string;
  /** Exact signed major-unit value; currency is the summary reporting currency. */
  value: string;
}

export interface BalanceHistorySurfaceAccountSummary {
  id: string;
  name: string | null;
  displayName: string;
  customName?: string | null;
  type: string;
  typeLabel: string;
  subType: string | null;
  subTypeLabel: string | null;
  grouping: AccountGrouping;
  groupingLabel: string;
  effectiveBalance: SerializedMoneyWithSign;
  convertedEffectiveBalance?: SerializedMoneyWithSign;
  changePercent?: number;
  institutionName?: string | null;
  syncedAt?: string;
  archivedAt?: string | null;
}

export interface BalanceHistorySurfaceSummary {
  netWorth: SerializedMoneyWithSign;
  changePercent?: number;
  chartData: BalanceHistorySurfaceChartPoint[];
  sampling: HistorySampling;
  assets: BalanceHistorySurfaceAccountSummary[];
  liabilities: BalanceHistorySurfaceAccountSummary[];
}

export interface BalanceHistorySurfaceOptions {
  startDate: string;
  endDate: string;
  accountIds?: string[];
  resolution?: HistoryResolution;
  maxPoints?: number;
}

function resolveEffectiveBalance(
  balance: BalanceWithConvertedBalance | undefined,
): SerializedMoneyWithSign {
  if (!balance) {
    return {
      money: { amount: '0', currency: 'USD' },
      sign: MoneySign.POSITIVE,
    };
  }

  return balance.convertedBalance ?? balance.balance;
}

function assertSingleEffectiveCurrency(
  balances: Record<string, AccountBalanceResult>,
): string {
  let fallbackCurrency: string | undefined;
  let nonZeroCurrency: string | undefined;

  Object.values(balances).forEach((result) => {
    const effectiveBalance = resolveEffectiveBalance(result.effectiveBalance);
    fallbackCurrency ??= effectiveBalance.money.currency;
    if (effectiveBalance.money.amount === '0') {
      return;
    }
    if (
      nonZeroCurrency !== undefined &&
      nonZeroCurrency !== effectiveBalance.money.currency
    ) {
      throw new ServiceUnavailableException(
        'Balance conversion is incomplete; retry after exchange rates are available',
      );
    }
    nonZeroCurrency = effectiveBalance.money.currency;
  });

  return nonZeroCurrency ?? fallbackCurrency ?? 'USD';
}

@Injectable()
export class BalanceHistorySurfaceService {
  constructor(private readonly balanceQueryService: BalanceQueryService) {}

  async getBalancesForDateRange(
    accountIds: string[],
    startDate: string,
    endDate: string,
    userId: string,
  ): Promise<BalanceQueryPerDateResult[]> {
    return this.balanceQueryService.getBalancesForDateRange(
      accountIds,
      startDate,
      endDate,
      userId,
    );
  }

  async getAllBalancesForDateRange(
    startDate: string,
    endDate: string,
    userId: string,
  ): Promise<BalanceQueryPerDateResult[]> {
    return this.balanceQueryService.getAllBalancesForDateRange(
      startDate,
      endDate,
      userId,
    );
  }

  async getBalanceHistorySummary(
    userId: string,
    options: BalanceHistorySurfaceOptions,
  ): Promise<BalanceHistorySurfaceSummary> {
    const projection = await this.balanceQueryService.loadBalanceProjection(
      userId,
      options.startDate,
      options.endDate,
      { accountIds: options.accountIds, includeLatestSync: true },
    );
    return this.buildSummary(
      projection.balances,
      projection.reportingCurrency,
      options,
    );
  }

  private buildSummary(
    results: Iterable<BalanceQueryPerDateResult>,
    reportingCurrency = 'USD',
    options: Pick<
      BalanceHistorySurfaceOptions,
      'resolution' | 'maxPoints'
    > = {},
  ): BalanceHistorySurfaceSummary {
    let firstResult: BalanceQueryPerDateResult | undefined;
    let lastResult: BalanceQueryPerDateResult | undefined;
    const chartPoints: BalanceHistorySurfaceChartPoint[] = [];
    for (const result of results) {
      firstResult ??= result;
      lastResult = result;
      const minor = calculateNetWorthForDate(result.balances);
      chartPoints.push({
        date: result.date,
        label: dayjs(result.date).format('MMM D'),
        value: new ExactDecimal(minor.toString())
          .div(new ExactDecimal(10).pow(getDecimalPlaces(reportingCurrency)))
          .toFixed(),
      });
    }
    const resolution = options.resolution ?? 'daily';
    const maxPoints =
      resolution === 'compact' ? (options.maxPoints ?? 240) : null;
    const chartData =
      maxPoints === null ? chartPoints : sampleHistory(chartPoints, maxPoints);
    const sampling: HistorySampling = {
      resolution,
      sourcePointCount: chartPoints.length,
      returnedPointCount: chartData.length,
      maxPoints,
    };
    if (!firstResult || !lastResult) {
      return {
        netWorth: createMoneyWithSign(0n, reportingCurrency),
        changePercent: undefined,
        chartData,
        sampling,
        assets: [],
        liabilities: [],
      };
    }
    const firstNetWorth = calculateNetWorthForDate(firstResult.balances);
    const lastNetWorth = calculateNetWorthForDate(lastResult.balances);
    const changePercent = calculateChangePercent(lastNetWorth, firstNetWorth);
    const currency = assertSingleEffectiveCurrency(lastResult.balances);
    const assets: BalanceHistorySurfaceAccountSummary[] = [];
    const liabilities: BalanceHistorySurfaceAccountSummary[] = [];

    if (lastResult) {
      Object.entries(lastResult.balances).forEach(
        ([accountId, accountResult]) => {
          const firstAccountResult = firstResult.balances[accountId];
          const currentEffective = resolveEffectiveBalance(
            accountResult.effectiveBalance,
          );
          const currentAmount = getSignedAmount(currentEffective);

          let accountChangePercent: number | undefined;
          if (firstAccountResult) {
            const previousEffective = resolveEffectiveBalance(
              firstAccountResult.effectiveBalance,
            );
            const previousAmount = getSignedAmount(previousEffective);
            accountChangePercent = calculateChangePercent(
              currentAmount,
              previousAmount,
            );
          }

          const summary: BalanceHistorySurfaceAccountSummary = {
            id: accountId,
            name: accountResult.account.name,
            displayName:
              accountResult.account.customName ??
              accountResult.account.name ??
              'Account',
            customName: accountResult.account.customName,
            type: String(accountResult.account.type),
            typeLabel: formatAccountLabel(String(accountResult.account.type)),
            subType: accountResult.account.subType ?? null,
            subTypeLabel: accountResult.account.subType
              ? formatAccountLabel(String(accountResult.account.subType))
              : null,
            grouping: getAccountGrouping(String(accountResult.account.type)),
            groupingLabel: getAccountGroupingLabel(
              getAccountGrouping(String(accountResult.account.type)),
            ),
            effectiveBalance: accountResult.effectiveBalance.balance,
            convertedEffectiveBalance:
              accountResult.effectiveBalance.convertedBalance,
            changePercent: accountChangePercent,
            institutionName:
              accountResult.account.bankLink?.institutionName ?? null,
            syncedAt: (
              accountResult.latestSyncedAt ?? accountResult.syncedAt
            )?.toISOString(),
            archivedAt: accountResult.account.archivedAt?.toISOString() ?? null,
          };

          if (isLiabilityType(String(accountResult.account.type))) {
            liabilities.push(summary);
          } else {
            assets.push(summary);
          }
        },
      );
    }

    const sortByBalance = (
      left: BalanceHistorySurfaceAccountSummary,
      right: BalanceHistorySurfaceAccountSummary,
    ) =>
      compareBalanceAmounts(
        getSignedAmount(
          right.convertedEffectiveBalance ?? right.effectiveBalance,
        ),
        getSignedAmount(
          left.convertedEffectiveBalance ?? left.effectiveBalance,
        ),
      );

    return {
      netWorth: createMoneyWithSign(lastNetWorth, currency),
      changePercent,
      chartData,
      sampling,
      assets: assets.sort(sortByBalance),
      liabilities: liabilities.sort(sortByBalance),
    };
  }
}
