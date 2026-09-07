import { describe, expect, it } from 'vitest'
import { DashboardPeriod } from '../src/api/models'
import { signedMinorUnits } from '../src/lib/money'
import { fixtureDashboard } from './page-fixtures'

describe('dashboard inspection fixtures', () => {
  it.each(Object.values(DashboardPeriod))(
    '%s has ordered unique dates and reconciled amounts',
    (period) => {
      const { summary, series } = fixtureDashboard(period, false)
      const dates = series.points.map((point) => point.date)
      expect(new Set(dates).size).toBe(dates.length)
      expect(dates).toEqual([...dates].sort())
      expect(dates[0]).toBe(summary.startDate)
      expect(dates.at(-1)).toBe(summary.endDate)
      const first = signedMinorUnits(series.points[0].netWorth)
      const last = signedMinorUnits(series.points.at(-1)!.netWorth)
      expect(last).toBe(signedMinorUnits(summary.netWorth))
      expect(last - first).toBe(signedMinorUnits(summary.changeAmount))
      expect(
        [...summary.assets, ...summary.liabilities].reduce(
          (sum, account) => sum + signedMinorUnits(account.effectiveBalance),
          0n,
        ),
      ).toBe(last)
    },
  )

  it('exposes distinct long ranges and an empty state', () => {
    const starts = Object.values(DashboardPeriod).map(
      (period) => fixtureDashboard(period, false).series.startDate,
    )
    expect(new Set(starts).size).toBe(starts.length)
    const empty = fixtureDashboard('month', true)
    expect(empty.series.points).toEqual([])
    expect(signedMinorUnits(empty.summary.netWorth)).toBe(0n)
    expect(empty.summary.changePercent).toBeUndefined()
  })
})
