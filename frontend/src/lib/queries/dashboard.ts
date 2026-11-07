import {
  getBalanceQueryControllerGetDashboardSeriesQueryOptions,
  getBalanceQueryControllerGetDashboardSummaryQueryOptions,
} from '../../api/clients/spliceAPI'
import { FINANCIAL_STALE_TIME } from '../query-policy'
import type { DashboardPeriod } from '../../api/models'

export const dashboardSummaryOptions = (
  period: DashboardPeriod,
  endDate: string,
  hideDiscountedAccounts = false,
) =>
  getBalanceQueryControllerGetDashboardSummaryQueryOptions(
    {
      period,
      endDate,
      ...(hideDiscountedAccounts ? { hideDiscountedAccounts: true } : {}),
    },
    { query: { staleTime: FINANCIAL_STALE_TIME } },
  )
export const dashboardSeriesOptions = (
  period: DashboardPeriod,
  endDate: string,
  hideDiscountedAccounts = false,
) =>
  getBalanceQueryControllerGetDashboardSeriesQueryOptions(
    {
      period,
      endDate,
      ...(hideDiscountedAccounts ? { hideDiscountedAccounts: true } : {}),
    },
    { query: { staleTime: FINANCIAL_STALE_TIME } },
  )
