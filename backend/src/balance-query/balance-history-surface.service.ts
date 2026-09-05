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
} from './balance-projection';

export interface BalanceHistorySurfaceChartPoint {
  date: string;
  label: string;
  value: number;
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
  assets: BalanceHistorySurfaceAccountSummary[];
  liabilities: BalanceHistorySurfaceAccountSummary[];
}

export interface BalanceHistorySurfaceOptions {
  startDate: string;
  endDate: string;
  accountIds?: string[];
}

function resolveEffectiveBalance(
  balance: BalanceWithConvertedBalance | undefined,
): SerializedMoneyWithSign {
  if (!balance) {
    return {
      money: { amount: 0, currency: 'USD' },
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
    if (effectiveBalance.money.amount === 0) {
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

function getLatestSyncedAt(
  results: BalanceQueryPerDateResult[],
  accountId: string,
): Date | undefined {
  let latest: Date | undefined;

  results.forEach((result) => {
    const balance =
      accountId in result.balances ? result.balances[accountId] : undefined;
    if (balance?.syncedAt) {
      const syncedAt = new Date(balance.syncedAt);
      if (!latest || syncedAt > latest) {
        latest = syncedAt;
      }
    }
  });

  return latest;
}

function getLatestAccountSyncedAt(
  results: BalanceQueryPerDateResult[],
  accountId: string,
): Date | undefined {
  let latest: Date | undefined;

  results.forEach((result) => {
    const balance =
      accountId in result.balances ? result.balances[accountId] : undefined;
    if (balance?.latestSyncedAt) {
      const latestSyncedAt = new Date(balance.latestSyncedAt);
      if (!latest || latestSyncedAt > latest) {
        latest = latestSyncedAt;
      }
    }
  });

  return latest ?? getLatestSyncedAt(results, accountId);
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
    const results = options.accountIds?.length
      ? await this.getBalancesForDateRange(
          options.accountIds,
          options.startDate,
          options.endDate,
          userId,
        )
      : await this.getAllBalancesForDateRange(
          options.startDate,
          options.endDate,
          userId,
        );

    return this.buildSummary(results);
  }

  private buildSummary(
    results: BalanceQueryPerDateResult[],
  ): BalanceHistorySurfaceSummary {
    if (results.length === 0) {
      return {
        netWorth: createMoneyWithSign(0, 'USD'),
        changePercent: undefined,
        chartData: [],
        assets: [],
        liabilities: [],
      };
    }

    const sortedResults = [...results].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const firstResult = sortedResults[0];
    const lastResult = sortedResults[sortedResults.length - 1];

    const firstNetWorth = calculateNetWorthForDate(firstResult.balances);
    const lastNetWorth = calculateNetWorthForDate(lastResult.balances);
    const changePercent = calculateChangePercent(lastNetWorth, firstNetWorth);

    const currency = lastResult
      ? assertSingleEffectiveCurrency(lastResult.balances)
      : 'USD';

    const chartData = sortedResults.map((result) => ({
      date: result.date,
      label: dayjs(result.date).format('MMM D'),
      value: calculateNetWorthForDate(result.balances),
    }));

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
            syncedAt: getLatestAccountSyncedAt(
              sortedResults,
              accountId,
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
      getSignedAmount(
        right.convertedEffectiveBalance ?? right.effectiveBalance,
      ) -
      getSignedAmount(left.convertedEffectiveBalance ?? left.effectiveBalance);

    return {
      netWorth: createMoneyWithSign(lastNetWorth, currency),
      changePercent,
      chartData,
      assets: assets.sort(sortByBalance),
      liabilities: liabilities.sort(sortByBalance),
    };
  }
}
