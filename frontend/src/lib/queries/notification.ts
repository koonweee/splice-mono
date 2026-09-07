import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  notificationControllerArchive,
  notificationControllerGetInbox,
  notificationControllerGetSummary,
  notificationControllerMarkRead,
} from '../../api/clients/spliceAPI'
import { assertAuthGeneration, getAuthGeneration } from '../auth-generation'
import { invalidateMutationFamilies } from '../query-invalidation'
import { FINANCIAL_STALE_TIME } from '../query-policy'

export const notificationSummaryQueryOptions = () =>
  queryOptions({
    queryKey: ['/notification/summary'],
    queryFn: ({ signal }) => notificationControllerGetSummary(signal),
    staleTime: FINANCIAL_STALE_TIME,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

export const notificationInboxQueryOptions = () =>
  infiniteQueryOptions({
    queryKey: ['/notification/inbox', 'infinite'],
    queryFn: ({ pageParam, signal }) =>
      notificationControllerGetInbox(
        { cursor: pageParam, pageSize: 20 },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) =>
      page.hasMore ? (page.nextCursor ?? undefined) : undefined,
    staleTime: FINANCIAL_STALE_TIME,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  })

/** Generation is captured before any request or cache writes, including standalone consumers. */
export function useNotificationAction() {
  const client = useQueryClient()
  return useMutation({
    mutationKey: ['notificationInboxAction'],
    networkMode: 'always',
    retry: false,
    mutationFn: async ({
      id,
      action,
    }: {
      id: string
      action: 'read' | 'archive'
    }) => {
      const generation = getAuthGeneration()
      if (typeof navigator !== 'undefined' && !navigator.onLine)
        throw new Error('Reconnect before updating notifications.')
      if (action === 'read') await notificationControllerMarkRead(id)
      else await notificationControllerArchive(id)
      assertAuthGeneration(generation)
      // Apply only the server-confirmed change, even if the ensuing refresh fails.
      const options = notificationInboxQueryOptions()
      await client.cancelQueries({ queryKey: options.queryKey })
      assertAuthGeneration(generation)
      client.setQueryData(
        options.queryKey,
        (previous) =>
          previous && {
            ...previous,
            pages: previous.pages.map((page) => ({
              ...page,
              items:
                action === 'archive'
                  ? page.items.filter((item) => item.id !== id)
                  : page.items.map((item) =>
                      item.id === id
                        ? {
                            ...item,
                            readAt: item.readAt ?? new Date().toISOString(),
                          }
                        : item,
                    ),
            })),
          },
      )
      return generation
    },
    onSuccess: (generation) => {
      assertAuthGeneration(generation)
      return invalidateMutationFamilies(client, [
        'notifications',
        'notificationSummary',
      ])
    },
  })
}
