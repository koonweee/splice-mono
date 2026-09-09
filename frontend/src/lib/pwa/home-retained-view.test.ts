import { describe, expect, it, vi } from 'vitest'
import { TimePeriod } from '../types'
import { retainLiveHomeContent } from './home-retained-view'
import type { HomeView } from './home-continuity'

const money = {
  money: { amount: '12000', currency: 'USD' },
  sign: 'positive' as const,
}
const chartData = [{ date: '2026-09-08', label: 'Sep 8', value: 120, money }]
const content: NonNullable<HomeView['content']> = {
  dashboard: {
    netWorth: money,
    changeAmount: money,
    comparisonPeriod: TimePeriod.month,
    assets: [],
    liabilities: [],
    chartData,
  },
  balancesHidden: false,
  period: TimePeriod.month,
  visibleAssets: [],
  visibleLiabilities: [],
  onAccountClick: vi.fn(),
}
const controls = {
  period: TimePeriod.week,
  onPeriodChange: vi.fn(),
  onAccountClick: vi.fn(),
}
const pending: HomeView = {
  controls,
  content: null,
  state: { hasData: false, isLoading: true, loadingFallback: null },
}
describe('retained live Home presentation', () => {
  it('keeps the latest live view through new date/period summary loading with current controls', () => {
    const result = retainLiveHomeContent(pending, content)
    expect(result?.dashboard).toBe(content.dashboard)
    expect(result?.period).toBe(TimePeriod.week)
    expect(result?.onPeriodChange).toBe(controls.onPeriodChange)
    expect(result?.onAccountClick).toBe(controls.onAccountClick)
    expect(result?.seriesLoading).toBe(true)
    expect(result?.isChangingPeriod).toBe(true)
  })
  it('keeps the old graph until new series is ready without reverting the new summary', () => {
    const dashboard = {
      ...content.dashboard,
      netWorth: { ...money, money: { ...money.money, amount: '12500' } },
      chartData: [],
    }
    const incoming = { ...content, dashboard, seriesLoading: true }
    const held = retainLiveHomeContent(
      { ...pending, content: incoming },
      content,
    )
    expect(held?.dashboard).toBe(dashboard)
    expect(held?.chartDisplayData).toBe(chartData)
    expect(held?.seriesLoading).toBe(true)
    const complete = { ...incoming, seriesLoading: false }
    expect(retainLiveHomeContent({ ...pending, content: complete }, held)).toBe(
      complete,
    )
  })
  it('does not invent a retained view after the epoch owner clears it', () => {
    expect(retainLiveHomeContent(pending, null)).toBeNull()
  })
})
