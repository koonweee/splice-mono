import { TimePeriod } from '@/lib/types'
import { useEffect, useMemo } from 'react'
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
  transformToAccountChartData,
  transformToDashboardData,
  type DashboardData,
} from '../lib/balance-utils'

/**
 * Hook for fetching all account balances for the dashboard
 * Wraps the mutation in a query-like pattern
 */
export function useBalanceData(period: TimePeriod) {
  const mutation = useBalanceQueryControllerGetAllBalances()

  // Auto-fetch on mount and when period changes
  useEffect(() => {
    const { startDate, endDate } = getDateRange(period)
    mutation.mutate({ data: { startDate, endDate } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period])

  // Transform data to dashboard format
  const dashboard = useMemo<DashboardData | undefined>(() => {
    if (!mutation.data) return undefined
    return transformToDashboardData(mutation.data, period)
  }, [mutation.data, period])

  return {
    data: dashboard,
    isLoading: mutation.isPending,
    error: mutation.error,
    refetch: () => {
      const { startDate, endDate } = getDateRange(period)
      mutation.mutate({ data: { startDate, endDate } })
    },
  }
}

/**
 * Result from useAccountBalanceHistory hook
 */
export interface AccountBalanceHistoryResult {
  chartData: ChartDataPoint[]
  latestBalance?: AccountBalanceResult
  rawResults: BalanceQueryPerDateResult[]
}

/**
 * Hook for fetching balance history for a single account
 * Used in AccountModal for the balance history chart
 */
export function useAccountBalanceHistory(
  accountId: string | undefined,
  enabled: boolean,
) {
  const mutation = useBalanceQueryControllerGetBalances()

  // Auto-fetch when enabled and accountId changes
  useEffect(() => {
    if (!enabled || !accountId) return

    const { startDate, endDate } = getDateRange(TimePeriod.month)
    mutation.mutate({
      data: {
        accountIds: [accountId],
        startDate,
        endDate,
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, enabled])

  // Transform data for the chart
  const result = useMemo<AccountBalanceHistoryResult>(() => {
    if (!mutation.data || !accountId) {
      return {
        chartData: [],
        latestBalance: undefined,
        rawResults: [],
      }
    }

    return {
      chartData: transformToAccountChartData(mutation.data, accountId),
      latestBalance: getLatestAccountBalance(mutation.data, accountId),
      rawResults: mutation.data,
    }
  }, [mutation.data, accountId])

  return {
    data: result,
    isLoading: mutation.isPending,
    error: mutation.error,
  }
}
