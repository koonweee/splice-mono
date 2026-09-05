import { createFileRoute } from '@tanstack/react-router'
import {
  dashboardSeriesOptions,
  dashboardSummaryOptions,
} from '../../lib/queries/dashboard'
import { loadQuery } from '../../lib/queries/loader'
import { TimePeriod } from '../../lib/types'
import { HomePage } from '../../components/pages/HomePage'
import { isValidTimePeriod } from '../../lib/route-search'
import type { HomeSearch } from '../../lib/route-search'

export const Route = createFileRoute('/_authed/home')({
  loaderDeps: ({ search }) => ({ period: search.period ?? TimePeriod.month }),
  loader: async ({ context, deps }) => {
    void context.queryClient.prefetchQuery(
      dashboardSeriesOptions(deps.period, context.presentation.today),
    )
    await loadQuery(
      context.queryClient,
      dashboardSummaryOptions(deps.period, context.presentation.today),
    )
  },
  component: HomeRoute,
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    accountId:
      typeof search.accountId === 'string' ? search.accountId : undefined,
    period: isValidTimePeriod(search.period) ? search.period : undefined,
  }),
})
function HomeRoute() {
  return <HomePage {...Route.useSearch()} />
}
