import { useQuery, useQueryClient } from '@tanstack/react-query'
import { bankLinkControllerCheckHealth } from '../api/clients/spliceAPI'
import { invalidateFamilies } from '../lib/query-invalidation'
import { useCurrentUser } from '../lib/session'

/** Starts after page data arrives; private reads never wait for provider probes. */
export function useConnectionHealthCheck(enabled: boolean) {
  const { data: user } = useCurrentUser()
  const client = useQueryClient()
  return useQuery({
    queryKey: ['connection-health', user?.id],
    enabled: enabled && Boolean(user),
    staleTime: 60 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: async ({ signal }) => {
      const result = await bankLinkControllerCheckHealth(signal)
      if (result.changed) {
        await invalidateFamilies(client, [
          'accounts',
          'balances',
          'notifications',
          'notificationSummary',
        ])
      }
      return result
    },
  })
}
