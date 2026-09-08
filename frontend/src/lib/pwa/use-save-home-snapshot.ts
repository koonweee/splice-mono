import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useCurrentUser } from '../session'
import { usePresentationPreferences } from '../presentation-preferences'
import {
  dashboardSeriesOptions,
  dashboardSummaryOptions,
} from '../queries/dashboard'
import { normalizeAppearance } from '../appearance-preferences'
import { getHomeSnapshotEpoch, saveHomeSnapshot } from './home-snapshot'
import { cachedHomeEnabled } from './launch-mode'
import type { TimePeriod } from '../types'

export function useSaveHomeSnapshot(period: TimePeriod) {
  const client = useQueryClient()
  const { data: user } = useCurrentUser()
  const { today, maskBalances } = usePresentationPreferences()
  useEffect(() => {
    if (!cachedHomeEnabled || !user) return
    const authEpoch = getHomeSnapshotEpoch()
    if (!authEpoch) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const save = () => {
      const summary = client.getQueryState(
        dashboardSummaryOptions(period, today).queryKey,
      )
      const series = client.getQueryState(
        dashboardSeriesOptions(period, today).queryKey,
      )
      if (summary?.status !== 'success' || !summary.data) return
      void saveHomeSnapshot({
        identity: user.id,
        authEpoch,
        savedAt: Date.now(),
        period,
        endDate: today,
        presentation: {
          currency: user.settings.currency ?? 'USD',
          timezone: user.settings.timezone ?? 'UTC',
          appearance: normalizeAppearance(user.settings.appearance),
          maskBalances,
          hideZeroBalanceAccounts:
            user.settings.hideZeroBalanceAccounts ?? false,
        },
        summary: { data: summary.data, updatedAt: summary.dataUpdatedAt },
        series:
          series?.status === 'success' &&
          series.data &&
          series.data.startDate === summary.data.startDate
            ? { data: series.data, updatedAt: series.dataUpdatedAt }
            : null,
      })
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(save, 200)
    }
    schedule()
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'success' &&
        [
          dashboardSummaryOptions(period, today).queryKey[0],
          dashboardSeriesOptions(period, today).queryKey[0],
        ].includes(event.query.queryKey[0] as string)
      )
        schedule()
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [client, user, period, today, maskBalances])
}
