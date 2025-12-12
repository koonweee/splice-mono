import { TimePeriod } from '@/lib/types'
import { useMemo } from 'react'
import {
  useBalanceQueryControllerGetAllBalances,
  useBalanceQueryControllerGetBalances,
} from '../api/clients/spliceAPI'
import type {
  AccountBalanceResult,
  BalanceQueryPerDateResult,
} from '../api/models'
import type { ChartDataPoint } from '../components/Chart'
import {
  getDateRange,
  getLatestAccountBalance,
  getLatestSyncedAt,
  transformToAccountChartData,
  transformToDashboardData,
  type DashboardData,
} from '../lib/balance-utils'

/**
 * Hook for fetching all account balances for the dashboard
 */
export function useBalanceData(period: TimePeriod) {
  const { startDate, endDate } = getDateRange(period)

  const query = useBalanceQueryControllerGetAllBalances({ startDate, endDate })

  // Transform data to dashboard format
  const dashboard = useMemo<DashboardData | undefined>(() => {
    if (!query.data) return undefined
    return transformToDashboardData(query.data, period)
  }, [query.data, period])

  return {
    data: dashboard,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Result from useAccountBalanceHistory hook
 */
export interface AccountBalanceHistoryResult {
  chartData: ChartDataPoint[]
  latestBalance?: AccountBalanceResult
  latestSyncedAt?: Date
  rawResults: BalanceQueryPerDateResult[]
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
  const result = useMemo<AccountBalanceHistoryResult>(() => {
    if (!query.data || !accountId) {
      return {
        chartData: [],
        latestBalance: undefined,
        latestSyncedAt: undefined,
        rawResults: [],
      }
    }

    return {
      chartData: transformToAccountChartData(query.data, accountId),
      latestBalance: getLatestAccountBalance(query.data, accountId),
      latestSyncedAt: getLatestSyncedAt(query.data, accountId),
      rawResults: query.data,
    }
  }, [query.data, accountId])

  return {
    data: result,
    isLoading: query.isPending,
    error: query.error,
  }
}
