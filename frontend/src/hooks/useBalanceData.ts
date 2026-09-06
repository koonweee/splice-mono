import { useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import {
  dashboardSeriesOptions,
  dashboardSummaryOptions,
} from '../lib/queries/dashboard'
import { usePresentationPreferences } from '../lib/presentation-preferences'
import { useBalanceQueryControllerGetBalances } from '../api/clients/spliceAPI'
import {
  BalanceCurrencyMismatchError,
  getDateRange,
  getLatestAccountBalance,
  getLatestSyncedAt,
  transformToAccountChartData,
} from '../lib/balance-utils'
import { moneyToChartNumber } from '../lib/money'
import { isValidTimePeriod } from '../lib/route-search'
import type { DashboardData } from '../lib/balance-utils'
import type {
  AccountBalanceResult,
  BalanceQueryPerDateResult,
  DashboardSummaryResponse,
} from '../api/models'
import type { ChartDataPoint } from '../components/Chart'
import { TimePeriod } from '@/lib/types'

/**
 * Hook for fetching all account balances for the dashboard
 */
export function useBalanceData(period: TimePeriod, reportingCurrency?: string) {
  const { today } = usePresentationPreferences()
  const queryClient = useQueryClient()
  const summary = useQuery({
    ...dashboardSummaryOptions(period, today),
    // Keep the cards mounted during period changes, with their original label.
    // Never revive a removed private cache or carry values across currencies/days.
    placeholderData: (previous, previousQuery) =>
      previous?.endDate === today &&
      previous.reportingCurrency === reportingCurrency &&
      previousQuery &&
      queryClient
        .getQueryCache()
        .get<DashboardSummaryResponse, void>(previousQuery.queryHash) ===
        previousQuery
        ? previous
        : undefined,
  })
  const series = useQuery(dashboardSeriesOptions(period, today))
  const seriesMatchesSummary =
    series.data !== undefined &&
    summary.data !== undefined &&
    series.data.reportingCurrency === summary.data.reportingCurrency &&
    series.data.period === summary.data.period &&
    series.data.startDate === summary.data.startDate &&
    series.data.endDate === summary.data.endDate
  const data = useMemo<DashboardData | undefined>(() => {
    if (
      !summary.data ||
      !isValidTimePeriod(summary.data.period) ||
      (reportingCurrency &&
        summary.data.reportingCurrency !== reportingCurrency)
    )
      return undefined
    const account = (item: (typeof summary.data.assets)[number]) => ({
      ...item,
      subType: item.subType ?? undefined,
      institutionName: item.institutionName ?? undefined,
      syncedAt: item.syncedAt ?? undefined,
    })
    return {
      netWorth: summary.data.netWorth,
      changeAmount: summary.data.changeAmount,
      changePercent: summary.data.changePercent,
      comparisonPeriod: summary.data.period,
      assets: summary.data.assets.map(account),
      liabilities: summary.data.liabilities.map(account),
      chartData: seriesMatchesSummary
        ? series.data.points.map((point) => ({
            date: point.date,
            label: dayjs(point.date).format('MMM D'),
            value: moneyToChartNumber(point.netWorth),
            money: point.netWorth,
          }))
        : [],
    }
  }, [summary.data, series.data, seriesMatchesSummary, reportingCurrency])
  return {
    data,
    isLoading: summary.isPending,
    error:
      summary.error ??
      (summary.data &&
      reportingCurrency &&
      summary.data.reportingCurrency !== reportingCurrency
        ? new BalanceCurrencyMismatchError(
            reportingCurrency,
            summary.data.reportingCurrency,
          )
        : undefined),
    isFetching: summary.isFetching,
    isChangingPeriod: summary.isPlaceholderData,
    refetch: summary.refetch,
    seriesError: series.error,
    seriesLoading:
      series.isPending || (!seriesMatchesSummary && summary.isFetching),
    refetchSeries: series.refetch,
  }
}

/**
 * Result from useAccountBalanceHistory hook
 */
export interface AccountBalanceHistoryResult {
  chartData: Array<ChartDataPoint>
  latestBalance?: AccountBalanceResult
  latestSyncedAt?: Date
  rawResults: Array<BalanceQueryPerDateResult>
}

/**
 * Hook for fetching balance history for a single account
 * Used in AccountModal for the balance history chart
 */
export function useAccountBalanceHistory(
  accountId: string | undefined,
  enabled: boolean,
  period: TimePeriod = TimePeriod.month,
) {
  const { startDate, endDate } = getDateRange(period)

  const query = useBalanceQueryControllerGetBalances(
    {
      accountIds: accountId ?? '',
      startDate,
      endDate,
    },
    { query: { enabled: enabled && !!accountId } },
  )

  // Transform data for the chart
  const transformed = useMemo<{
    data: AccountBalanceHistoryResult
    error?: BalanceCurrencyMismatchError
  }>(() => {
    if (!query.data || !accountId) {
      return {
        data: {
          chartData: [],
          latestBalance: undefined,
          latestSyncedAt: undefined,
          rawResults: [],
        },
      }
    }

    try {
      return {
        data: {
          chartData: transformToAccountChartData(query.data, accountId, period),
          latestBalance: getLatestAccountBalance(query.data, accountId),
          latestSyncedAt: getLatestSyncedAt(query.data, accountId),
          rawResults: query.data,
        },
      }
    } catch (error) {
      if (!(error instanceof BalanceCurrencyMismatchError)) throw error
      return {
        data: {
          chartData: [],
          latestBalance: undefined,
          latestSyncedAt: undefined,
          rawResults: query.data,
        },
        error,
      }
    }
  }, [query.data, accountId, period])

  return {
    data: transformed.data,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError || transformed.error !== undefined,
    error: query.error ?? transformed.error,
    refetch: query.refetch,
  }
}
