import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
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
  it.each(['summary', 'series'])(
    'retains correctly labelled cards while a new period loads (%s first)',
    async (first) => {
      let releaseSummary = () => {}
      let releaseSeries = () => {}
      const summaryReady = new Promise<void>((resolve) => {
        releaseSummary = resolve
      })
      const seriesReady = new Promise<void>((resolve) => {
        releaseSeries = resolve
      })
      const weekly = {
        ...summary,
        period: 'week' as const,
        startDate: '2026-08-29',
        netWorth: { ...money, money: { ...money.money, amount: '54321' } },
      }
      transport.mockImplementation(async ({ url }: { url: string }) => {
        if (url.endsWith('dashboard-summary')) {
          await summaryReady
          return weekly
        }
        await seriesReady
        return { ...weekly, points: [{ date, netWorth: weekly.netWorth }] }
      })
      const { wrapper, client } = setup()
      const { result, rerender, unmount } = renderHook(
        ({ period }) => useBalanceData(period, 'USD'),
        { wrapper, initialProps: { period: TimePeriod.month } },
      )
      rerender({ period: TimePeriod.week })
      expect(result.current.data?.netWorth).toEqual(money)
      expect(result.current.data?.comparisonPeriod).toBe(TimePeriod.month)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isChangingPeriod).toBe(true)
      expect(result.current.seriesLoading).toBe(true)
      // Placeholder values belong only to this observer, never the week's cache.
      expect(
        client.getQueryData(
          dashboardSummaryOptions(TimePeriod.week, date).queryKey,
        ),
      ).toBeUndefined()
      await act(async () => {
        if (first === 'summary') releaseSummary()
        else releaseSeries()
        await (first === 'summary' ? summaryReady : seriesReady)
      })
      await waitFor(() => {
        if (first === 'summary')
          expect(result.current.data?.comparisonPeriod).toBe(TimePeriod.week)
        else expect(result.current.isFetching).toBe(true)
        expect(result.current.data?.chartData).toEqual([])
        expect(result.current.seriesLoading).toBe(true)
      })
      await act(async () => {
        releaseSummary()
        releaseSeries()
        await Promise.all([summaryReady, seriesReady])
      })
      await waitFor(() => {
        expect(result.current.isChangingPeriod).toBe(false)
        expect(result.current.data?.comparisonPeriod).toBe(TimePeriod.week)
        expect(result.current.data?.netWorth).toEqual(weekly.netWorth)
        expect(result.current.data?.chartData[0].money).toEqual(weekly.netWorth)
      })
      // Returning to a warm period is immediate.
      rerender({ period: TimePeriod.month })
      expect(result.current.data?.netWorth).toEqual(money)
      expect(result.current.isChangingPeriod).toBe(false)
      unmount()
      client.clear()
    },
  )

  it('does not retain a previous period across a currency change or cache clear', () => {
    transport.mockImplementation(() => new Promise(() => {}))
    const { wrapper, client } = setup()
    const { result, rerender, unmount } = renderHook(
      ({ period, currency }) => useBalanceData(period, currency),
      {
        wrapper,
        initialProps: { period: TimePeriod.month, currency: 'USD' },
      },
    )
    rerender({ period: TimePeriod.week, currency: 'EUR' })
    expect(result.current.data).toBeUndefined()
    rerender({ period: TimePeriod.month, currency: 'USD' })
    expect(result.current.data?.netWorth).toEqual(money)
    act(() => client.clear())
    rerender({ period: TimePeriod.week, currency: 'USD' })
    expect(result.current.data).toBeUndefined()
    unmount()
    client.clear()
  })

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
