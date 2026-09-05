import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  getSignedAmount,
  transformToAccountChartData,
} from '../lib/balance-utils'
import type { DashboardData } from '../lib/balance-utils'
import type {
  AccountBalanceResult,
  BalanceQueryPerDateResult,
} from '../api/models'
import type { ChartDataPoint } from '../components/Chart'
import { TimePeriod } from '@/lib/types'

/**
 * Hook for fetching all account balances for the dashboard
 */
export function useBalanceData(period: TimePeriod, reportingCurrency?: string) {
  const { today } = usePresentationPreferences()
  const summary = useQuery(dashboardSummaryOptions(period, today))
  const series = useQuery(dashboardSeriesOptions(period, today))
  const data = useMemo<DashboardData | undefined>(() => {
    if (
      !summary.data ||
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
      comparisonPeriod: period,
      assets: summary.data.assets.map(account),
      liabilities: summary.data.liabilities.map(account),
      chartData:
        series.data?.reportingCurrency === summary.data.reportingCurrency
          ? series.data.points.map((point) => ({
              date: point.date,
              label: dayjs(point.date).format('MMM D'),
              value: getSignedAmount(point.netWorth),
            }))
          : [],
    }
  }, [summary.data, series.data, period, reportingCurrency])
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
    refetch: summary.refetch,
    seriesError: series.error,
    seriesLoading: series.isPending,
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
