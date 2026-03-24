import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import { AccountType } from 'plaid';
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
  getDecimalPlaces,
  type SerializedMoneyWithSign,
} from '../types/MoneyWithSign';
import { BalanceQueryService } from './balance-query.service';

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

function isLiabilityType(type: string): boolean {
  return type === String(AccountType.Credit) || type === String(AccountType.Loan);
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

function getSignedAmount(balance: SerializedMoneyWithSign): number {
  const decimalPlaces = getDecimalPlaces(balance.money.currency);
  const major = balance.money.amount / Math.pow(10, decimalPlaces);
  return balance.sign === MoneySign.NEGATIVE ? -major : major;
}

function calculateNetWorthForDate(
  balances: Record<string, AccountBalanceResult>,
): number {
  let netWorth = 0;

    Object.values(balances).forEach((result) => {
      const effectiveBalance = result.effectiveBalance.convertedBalance
        ? result.effectiveBalance.convertedBalance
        : result.effectiveBalance.balance;
      const amount = getSignedAmount(effectiveBalance);

    if (isLiabilityType(String(result.account.type))) {
      netWorth -= Math.abs(amount);
      return;
    }

    netWorth += amount;
  });

  return netWorth;
}

function calculateChangePercent(
  current: number,
  previous: number,
): number | undefined {
  if (previous === 0) return undefined;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function createMoneyWithSign(
  amount: number,
  currency: string,
): SerializedMoneyWithSign {
  const isNegative = amount < 0;
  const decimalPlaces = getDecimalPlaces(currency);

  return {
    money: {
      amount: Math.round(Math.abs(amount) * Math.pow(10, decimalPlaces)),
      currency,
    },
    sign: isNegative ? MoneySign.NEGATIVE : MoneySign.POSITIVE,
  };
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

    const firstAccount = lastResult ? Object.values(lastResult.balances)[0] : null;
    const currency = firstAccount
      ? resolveEffectiveBalance(firstAccount.effectiveBalance).money.currency
      : 'USD';

    const chartData = sortedResults.map((result) => ({
      date: result.date,
      label: dayjs(result.date).format('MMM D'),
      value: calculateNetWorthForDate(result.balances),
    }));

    const assets: BalanceHistorySurfaceAccountSummary[] = [];
    const liabilities: BalanceHistorySurfaceAccountSummary[] = [];

    if (lastResult) {
      Object.entries(lastResult.balances).forEach(([accountId, accountResult]) => {
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
            accountResult.account.customName ?? accountResult.account.name ?? 'Account',
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
          institutionName: accountResult.account.bankLink?.institutionName ?? null,
          syncedAt: getLatestSyncedAt(sortedResults, accountId)?.toISOString(),
        };

        if (isLiabilityType(String(accountResult.account.type))) {
          liabilities.push(summary);
        } else {
          assets.push(summary);
        }
      });
    }

    const sortByBalance = (
      left: BalanceHistorySurfaceAccountSummary,
      right: BalanceHistorySurfaceAccountSummary,
    ) =>
      getSignedAmount(right.effectiveBalance) -
      getSignedAmount(left.effectiveBalance);

    return {
      netWorth: createMoneyWithSign(lastNetWorth, currency),
      changePercent,
      chartData,
      assets: assets.sort(sortByBalance),
      liabilities: liabilities.sort(sortByBalance),
    };
  }
}
