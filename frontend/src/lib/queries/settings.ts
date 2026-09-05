import {
  getAnalysisRuleControllerFindAllQueryOptions,
  getCategorizationRuleControllerFindAllQueryOptions,
  getCategoryControllerFindManagementQueryOptions,
  getRecurringManualTransactionControllerFindAllQueryOptions,
  getUserControllerListTokensQueryOptions,
} from '../../api/clients/spliceAPI'
import type { QueryClient } from '@tanstack/react-query'
import type { SettingsTab } from '../route-search'

// Only the selected section's essential list is loaded. Secondary pickers stay
// with their section, and security token inventory stays fresh on mount.
export async function loadSettingsSection(
  client: QueryClient,
  tab: SettingsTab,
) {
  const options = { archived: false }
  switch (tab) {
    case 'access':
      await client
        .fetchQuery(
          getUserControllerListTokensQueryOptions({ query: { staleTime: 0 } }),
        )
        .catch(() => undefined)
      break
    case 'analysis':
      await client
        .ensureQueryData({
          ...getAnalysisRuleControllerFindAllQueryOptions(options),
          revalidateIfStale: true,
        })
        .catch(() => undefined)
      break
    case 'categorization':
      await client
        .ensureQueryData({
          ...getCategorizationRuleControllerFindAllQueryOptions(options),
          revalidateIfStale: true,
        })
        .catch(() => undefined)
      break
    case 'categories':
      await client
        .ensureQueryData({
          ...getCategoryControllerFindManagementQueryOptions(options),
          revalidateIfStale: true,
        })
        .catch(() => undefined)
      break
    case 'recurring':
      await client
        .ensureQueryData({
          ...getRecurringManualTransactionControllerFindAllQueryOptions(),
          revalidateIfStale: true,
        })
        .catch(() => undefined)
      break
  }
}
