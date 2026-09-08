import dayjs from 'dayjs'
import { useRouterState } from '@tanstack/react-router'
import { useCurrentUser } from '../../lib/session'
import { usePresentationPreferences } from '../../lib/presentation-preferences'
import { analysisDateRange } from '../../lib/queries/primary'
import {
  isValidTimePeriod,
  validateSettingsSearch,
} from '../../lib/route-search'
import { TimePeriod } from '../../lib/types'
import { LoadingSkeleton } from '../loading/LoadingSkeleton'
import { AccountsSkeleton } from '../accounts/InstitutionSection.skeleton'
import { AnalysisSkeleton } from '../analysis/AnalysisPage.skeleton'
import { TransactionsPageSkeleton } from '../transactions/TransactionsPageFrame'
import { HomePageFrame } from './HomePageFrame'
import { HomeSkeleton } from './HomePage.skeleton'
import { AccountsPageFrame } from './AccountsPageFrame'
import { AnalysisPageFrame } from './AnalysisPageFrame'
// Settings owns its navigation and selected section's pending frame.
import { SettingsPageSkeleton } from './SettingsPage.skeleton'

/** Destination composition only: geometry belongs to the corresponding owner. */
export function RoutePendingSkeleton() {
  const location = useRouterState({ select: (state) => state.location })
  const { data: user } = useCurrentUser()
  const { today } = usePresentationPreferences()
  const search = location.search as Record<string, unknown>
  const page = location.pathname.split('/')[1] || 'home'
  const startDate =
    typeof search.startDate === 'string' ? search.startDate : undefined
  const endDate =
    typeof search.endDate === 'string' ? search.endDate : undefined
  const range = analysisDateRange(today, { startDate, endDate })
  return (
    <>
      {page === 'home' ? (
        <HomePageFrame>
          <LoadingSkeleton label="Loading home…">
            <HomeSkeleton
              period={
                isValidTimePeriod(search.period)
                  ? search.period
                  : TimePeriod.month
              }
            />
          </LoadingSkeleton>
        </HomePageFrame>
      ) : page === 'accounts' ? (
        <AccountsPageFrame>
          <LoadingSkeleton label="Loading accounts…">
            <AccountsSkeleton />
          </LoadingSkeleton>
        </AccountsPageFrame>
      ) : page === 'analysis' ? (
        <AnalysisPageFrame
          dateRange={[
            dayjs(range.startDate).toDate(),
            dayjs(range.endDate).toDate(),
          ]}
        >
          <LoadingSkeleton label="Loading analysis…">
            <AnalysisSkeleton
              sankey={user?.settings.analysisSankeyEnabled ?? false}
            />
          </LoadingSkeleton>
        </AnalysisPageFrame>
      ) : page === 'transactions' ? (
        <TransactionsPageSkeleton startDate={startDate} endDate={endDate} />
      ) : page === 'settings' ? (
        <SettingsPageSkeleton
          appearance={user?.settings.appearance}
          tab={validateSettingsSearch(search).tab ?? 'general'}
        />
      ) : null}
    </>
  )
}
