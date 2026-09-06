import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BalanceCurrencyMismatchError } from '../lib/balance-utils'
import { TimePeriod } from '../lib/types'
import { PresentationProvider } from '../lib/presentation-preferences'
import {
  dashboardSeriesOptions,
  dashboardSummaryOptions,
} from '../lib/queries/dashboard'
import { useBalanceData } from './useBalanceData'
import type { DashboardSummaryResponse } from '../api/models'
import type { ReactNode } from 'react'

const transport = vi.hoisted(() => vi.fn())
vi.mock('../api/axios', () => ({ axios: transport }))
const date = '2026-09-05'
const money = {
  money: { amount: '12345', currency: 'USD' },
  sign: 'positive' as const,
}
const summary: DashboardSummaryResponse = {
  period: 'month',
  startDate: '2026-08-06',
  endDate: date,
  reportingCurrency: 'USD',
  generatedAt: `${date}T12:00:00Z`,
  netWorth: money,
  changeAmount: money,
  assets: [],
  liabilities: [],
}
function setup(withSeries = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(
    dashboardSummaryOptions(TimePeriod.month, date).queryKey,
    summary,
  )
  if (withSeries)
    client.setQueryData(
      dashboardSeriesOptions(TimePeriod.month, date).queryKey,
      { ...summary, points: [{ date, netWorth: money }] },
    )
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <PresentationProvider
        initial={{ today: date, theme: 'splice-dark', maskBalances: true }}
      >
        {children}
      </PresentationProvider>
    </QueryClientProvider>
  )
  return { client, wrapper }
}
describe('compact dashboard queries', () => {
  it('reuses hydrated summary and series without fetching daily matrices', () => {
    transport.mockClear()
    const { wrapper, client } = setup()
    const { result, unmount } = renderHook(
      () => useBalanceData(TimePeriod.month, 'USD'),
      { wrapper },
    )
    expect(result.current.data?.netWorth).toEqual(money)
    expect(result.current.data?.chartData).toEqual([
      { date, label: 'Sep 5', value: 123.45, money },
    ])
    expect(transport).not.toHaveBeenCalled()
    unmount()
    client.clear()
  })
  it('keeps the summary usable when the independent series fails', async () => {
    transport.mockRejectedValue(new Error('Chart offline'))
    const { wrapper, client } = setup(false)
    const { result, unmount } = renderHook(
      () => useBalanceData(TimePeriod.month, 'USD'),
      { wrapper },
    )
    await waitFor(() => expect(result.current.seriesError).toBeTruthy())
    expect(result.current.error).toBeUndefined()
    expect(result.current.data?.netWorth).toEqual(money)
    expect(result.current.data?.chartData).toEqual([])
    unmount()
    client.clear()
  })
  it('never presents an old currency as the new reporting currency', () => {
    const { wrapper, client } = setup()
    const { result, unmount } = renderHook(
      () => useBalanceData(TimePeriod.month, 'EUR'),
      { wrapper },
    )
    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBeInstanceOf(BalanceCurrencyMismatchError)
    unmount()
    client.clear()
  })
})
