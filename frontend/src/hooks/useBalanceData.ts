import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
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
import type { Query } from '@tanstack/react-query'
import type { DashboardData } from '../lib/balance-utils'
import type {
  AccountBalanceResult,
  BalanceQueryPerDateResult,
  DashboardSeriesResponse,
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
    // Keep balances and rows mounted; callers skeleton the comparison slots.
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
  const retained = useRef<Query<DashboardSummaryResponse> | undefined>(
    undefined,
  )
  useEffect(() => {
    if (!summary.data || summary.isPlaceholderData) return
    retained.current = queryClient
      .getQueryCache()
      .find<DashboardSummaryResponse>({
        queryKey: dashboardSummaryOptions(period, today).queryKey,
        exact: true,
      })
  }, [summary.data, summary.isPlaceholderData, queryClient, period, today])
  const cachedPrevious = useSyncExternalStore(
    useCallback(
      (notify) =>
        queryClient.getQueryCache().subscribe((event) => {
          if (event.query === retained.current) notify()
        }),
      [queryClient],
    ),
    () => {
      const query = retained.current
      return query && queryClient.getQueryCache().get(query.queryHash) === query
        ? query.state.data
        : undefined
    },
    () => undefined,
  )
  // A failed filter request keeps balances from their live source Query, so
  // metadata/mutation patches apply immediately. Removed/reset caches never revive.
  const summaryData =
    summary.data ??
    (summary.isError &&
    cachedPrevious &&
    cachedPrevious.endDate === today &&
    cachedPrevious.reportingCurrency === reportingCurrency
      ? cachedPrevious
      : undefined)
  const series = useQuery({
    ...dashboardSeriesOptions(period, today),
    placeholderData: (previous, previousQuery) =>
      previous?.endDate === today &&
      previous.reportingCurrency === reportingCurrency &&
      previousQuery &&
      queryClient
        .getQueryCache()
        .get<DashboardSeriesResponse, void>(previousQuery.queryHash) ===
        previousQuery
        ? previous
        : undefined,
  })
  // Retain only the visual series while switching. Comparison values still
  // require a matching summary; hover is disabled until both queries settle.
  const chartDisplayData = useMemo<Array<ChartDataPoint> | undefined>(() => {
    if (
      !series.data ||
      series.data.endDate !== today ||
      series.data.reportingCurrency !== reportingCurrency
    )
      return undefined
    const shortRange = ['day', 'week', 'month'].includes(series.data.period)
    return series.data.points.map((point) => ({
      date: point.date,
      label: dayjs(point.date).format(shortRange ? 'MMM D' : 'MMM D, YYYY'),
      value: moneyToChartNumber(point.netWorth),
      money: point.netWorth,
    }))
  }, [series.data, reportingCurrency, today])
  const seriesMatchesSummary =
    series.data !== undefined &&
    summaryData !== undefined &&
    series.data.reportingCurrency === summaryData.reportingCurrency &&
    series.data.period === summaryData.period &&
    series.data.startDate === summaryData.startDate &&
    series.data.endDate === summaryData.endDate
  const data = useMemo<DashboardData | undefined>(() => {
    if (
      !summaryData ||
      !isValidTimePeriod(summaryData.period) ||
      (reportingCurrency && summaryData.reportingCurrency !== reportingCurrency)
    )
      return undefined
    const account = (item: (typeof summaryData.assets)[number]) => ({
      ...item,
      subType: item.subType ?? undefined,
      institutionName: item.institutionName ?? undefined,
      syncedAt: item.syncedAt ?? undefined,
    })
    return {
      netWorth: summaryData.netWorth,
      changeAmount: summaryData.changeAmount,
      changePercent: summaryData.changePercent,
      comparisonPeriod: summaryData.period,
      assets: summaryData.assets.map(account),
      liabilities: summaryData.liabilities.map(account),
      chartData: seriesMatchesSummary
        ? series.data.points.map((point) => ({
            date: point.date,
            label: dayjs(point.date).format(
              [TimePeriod.day, TimePeriod.week, TimePeriod.month].includes(
                period,
              )
                ? 'MMM D'
                : 'MMM D, YYYY',
            ),
            value: moneyToChartNumber(point.netWorth),
            money: point.netWorth,
          }))
        : [],
    }
  }, [
    summaryData,
    series.data,
    seriesMatchesSummary,
    reportingCurrency,
    period,
  ])
  return {
    data,
    isLoading: summary.isPending,
    error:
      summary.error ??
      (summaryData &&
      reportingCurrency &&
      summaryData.reportingCurrency !== reportingCurrency
        ? new BalanceCurrencyMismatchError(
            reportingCurrency,
            summaryData.reportingCurrency,
          )
        : undefined),
    isFetching: summary.isFetching,
    isChangingPeriod:
      summaryData !== undefined && summaryData.period !== period,
    refetch: summary.refetch,
    seriesError: series.error,
    seriesLoading:
      series.isPending || series.isPlaceholderData || !seriesMatchesSummary,
    chartDisplayData,
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
  const { today } = usePresentationPreferences()
  const allHistory = useQuery({
    ...dashboardSummaryOptions(TimePeriod.all, today),
    enabled: enabled && !!accountId && period === TimePeriod.all,
  })
  const range = getDateRange(period, allHistory.data?.startDate)
  const startDate = range.startDate
  const endDate = period === TimePeriod.all ? today : range.endDate

  const query = useBalanceQueryControllerGetBalances(
    {
      accountIds: accountId ?? '',
      startDate,
      endDate,
    },
    {
      query: {
        enabled:
          enabled &&
          !!accountId &&
          (period !== TimePeriod.all || !!allHistory.data),
      },
    },
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
    isLoading:
      query.isPending && !(period === TimePeriod.all && allHistory.isError),
    isFetching:
      query.isFetching || (period === TimePeriod.all && allHistory.isFetching),
    isError:
      query.isError ||
      transformed.error !== undefined ||
      (period === TimePeriod.all && allHistory.isError),
    error:
      query.error ??
      transformed.error ??
      (period === TimePeriod.all ? allHistory.error : null),
    refetch:
      period === TimePeriod.all && allHistory.isError
        ? allHistory.refetch
        : query.refetch,
  }
}
