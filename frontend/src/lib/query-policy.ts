import type { QueryClient } from '@tanstack/react-query'

export const FINANCIAL_STALE_TIME = 30_000
export const SESSION_STALE_TIME = 5 * 60_000

export function configureQueryPolicy(client: QueryClient) {
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: {
      ...client.getDefaultOptions().queries,
      staleTime: FINANCIAL_STALE_TIME,
    },
  })
  client.setQueryDefaults(['/user/me'], { staleTime: SESSION_STALE_TIME })
  client.setQueryDefaults(['/user/tokens'], { staleTime: 0 })
  const configureSettingsScope = () => {
    const user = client.getQueryData<{ id: string }>(['/user/me'])
    client.setMutationDefaults(['userControllerUpdateSettings'], {
      ...client.getMutationDefaults(['userControllerUpdateSettings']),
      scope: { id: `user-settings:${user?.id ?? 'unverified'}` },
    })
  }
  configureSettingsScope()
  // Every control/hook shares the verified user's queue, including hooks mounted later.
  client.getQueryCache().subscribe((event) => {
    if (
      event.query.queryKey[0] === '/user/me' &&
      (event.type === 'added' ||
        (event.type === 'updated' && event.action.type === 'success'))
    )
      configureSettingsScope()
  })
}
