import {
  getBalanceQueryControllerGetDashboardSeriesQueryOptions,
  getBalanceQueryControllerGetDashboardSummaryQueryOptions,
} from '../../api/clients/spliceAPI'
import { FINANCIAL_STALE_TIME } from '../query-policy'
import type { TimePeriod } from '../types'

export const dashboardSummaryOptions = (period: TimePeriod, endDate: string) =>
  getBalanceQueryControllerGetDashboardSummaryQueryOptions(
    { period, endDate },
    { query: { staleTime: FINANCIAL_STALE_TIME } },
  )
export const dashboardSeriesOptions = (period: TimePeriod, endDate: string) =>
  getBalanceQueryControllerGetDashboardSeriesQueryOptions(
    { period, endDate },
    { query: { staleTime: FINANCIAL_STALE_TIME } },
  )
