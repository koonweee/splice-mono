import { createContext, useCallback, useContext, useState } from 'react'
import { createIsomorphicFn } from '@tanstack/react-start'
import { queryOptions, useQuery } from '@tanstack/react-query'
import {
  acceptBrowserIdentity,
  assertAuthGeneration,
  authDocumentNavigation,
  clearPrivateCaches,
  getAuthGeneration,
} from './auth-generation'
import { resolveApiUrl } from './api-base-url'
import {
  ConfirmedLoggedOutError,
  TransientAuthError,
  isConfirmedLoggedOutError,
  refreshSession,
} from './session-refresh'
import type { User } from '../api/models/user'

const SESSION_STALE_TIME_MS = 5 * 60 * 1000

export type SessionOutcome = 'authenticated' | 'anonymous' | 'unavailable'
export const SessionOutcomeContext = createContext<SessionOutcome | undefined>(
  undefined,
)

export type SessionState = {
  user: User
}

export const sessionQueryKey = ['/user/me'] as const

async function browserSession(): Promise<User> {
  const generation = getAuthGeneration()
  const firstResponse = await fetchCurrentUser()
  if (firstResponse.ok) {
    const user = (await firstResponse.json()) as User
    assertAuthGeneration(generation)
    acceptBrowserIdentity(user.id)
    return user
  }

  if (!shouldRefreshForUserResponse(firstResponse.status)) {
    throw new TransientAuthError(
      `Session check failed with status ${firstResponse.status}`,
    )
  }

  assertAuthGeneration(generation)
  await refreshSession()
  assertAuthGeneration(generation)

  const retryResponse = await fetchCurrentUser()
  if (retryResponse.ok) {
    const user = (await retryResponse.json()) as User
    assertAuthGeneration(generation)
    acceptBrowserIdentity(user.id)
    return user
  }

  if (shouldRefreshForUserResponse(retryResponse.status)) {
    throw new ConfirmedLoggedOutError()
  }

  throw new TransientAuthError(
    `Session check failed with status ${retryResponse.status}`,
  )
}

export const ensureSession = createIsomorphicFn()
  .server(async (): Promise<User> => {
    const { getServerApiClient } = await import('./server/api-client.server')
    return getServerApiClient().request<User>({ url: '/user/me' })
  })
  .client(browserSession)

export function sessionQueryOptions() {
  return queryOptions({
    queryKey: sessionQueryKey,
    queryFn: async ({ client }) => {
      const hadAuthenticatedUser =
        typeof window !== 'undefined' &&
        Boolean(client.getQueryData<User>(sessionQueryKey))
      try {
        return await ensureSession()
      } catch (error) {
        if (hadAuthenticatedUser && isConfirmedLoggedOutError(error)) {
          clearPrivateCaches()
          authDocumentNavigation.replace()
        }
        throw error
      }
    },
    staleTime: SESSION_STALE_TIME_MS,
    retry: (failureCount, error) =>
      !isConfirmedLoggedOutError(error) && failureCount < 2,
  })
}

export function useCurrentUser() {
  return useQuery(sessionQueryOptions())
}

export function useSession() {
  const outcome = useContext(SessionOutcomeContext)
  const [retried, setRetried] = useState(false)
  const [liveSession, setLiveSession] = useState(false)
  const query = useQuery({
    ...sessionQueryOptions(),
    enabled:
      liveSession || (outcome !== 'anonymous' && outcome !== 'unavailable'),
    select: (user): SessionState => ({ user }),
  })
  const refetch = useCallback<typeof query.refetch>(
    (options) => {
      setRetried(true)
      return query.refetch(options).then((result) => {
        if (result.data) setLiveSession(true)
        return result
      })
    },
    [query.refetch],
  )
  // Error subclasses do not retain their prototypes across SSR serialization.
  // The root's sanitized outcome is authoritative until this hook explicitly retries.
  if (!query.data && !retried && outcome && outcome !== 'authenticated') {
    return {
      ...query,
      refetch,
      isPending: false,
      error:
        outcome === 'anonymous'
          ? new ConfirmedLoggedOutError()
          : new TransientAuthError(),
    }
  }
  return { ...query, refetch }
}

function fetchCurrentUser(): Promise<Response> {
  return fetch(resolveApiUrl('/user/me'), {
    credentials: 'include',
  })
}

function shouldRefreshForUserResponse(status: number): boolean {
  return status === 401 || status === 403
}
