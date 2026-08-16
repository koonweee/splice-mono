import { useMemo } from 'react'
import {
  useBalanceQueryControllerGetAllBalances,
  useBalanceQueryControllerGetBalances,
} from '../api/clients/spliceAPI'
import {
  BalanceCurrencyMismatchError,
  getDateRange,
  getLatestAccountBalance,
  getLatestSyncedAt,
  transformToAccountChartData,
  transformToDashboardData,
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
  const { startDate, endDate } = getDateRange(period)

  const query = useBalanceQueryControllerGetAllBalances({ startDate, endDate })

  // Transform data to dashboard format
  const transformed = useMemo<{
    data?: DashboardData
    error?: BalanceCurrencyMismatchError
  }>(() => {
    if (!query.data) return {}

    try {
      return {
        data: transformToDashboardData(query.data, period, reportingCurrency),
      }
    } catch (error) {
      if (error instanceof BalanceCurrencyMismatchError) return { error }
      throw error
    }
  }, [query.data, period, reportingCurrency])

  return {
    data: transformed.data,
    isLoading: query.isPending,
    error: query.error ?? transformed.error,
    refetch: query.refetch,
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
