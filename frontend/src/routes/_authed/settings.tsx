import { createFileRoute } from '@tanstack/react-router'
import { loadSettingsSection } from '../../lib/queries/settings'
import { awaitSsrData } from '../../lib/queries/loader'
import { SettingsPage } from '../../components/pages/SettingsPage'
import { validateSettingsSearch } from '../../lib/route-search'

export const Route = createFileRoute('/_authed/settings')({
  validateSearch: validateSettingsSearch,
  loaderDeps: ({ search }) => ({ tab: search.tab ?? 'general' }),
  loader: ({ context, deps }) =>
    awaitSsrData(loadSettingsSection(context.queryClient, deps.tab)),
  component: SettingsRoute,
})
function SettingsRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SettingsPage
      tab={tab}
      onTabChange={(nextTab) => {
        void navigate({
          search: { tab: nextTab === 'general' ? undefined : nextTab },
          replace: true,
        })
      }}
    />
  )
}
