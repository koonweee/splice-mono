import { queryOptions, useQuery } from '@tanstack/react-query'
import { resolveApiUrl } from './api-base-url'
import {
  ConfirmedLoggedOutError,
  TransientAuthError,
  isConfirmedLoggedOutError,
  refreshSession,
} from './session-refresh'
import type { User } from '../api/models/user'

const SESSION_STALE_TIME_MS = 5 * 60 * 1000

export type SessionState = {
  user: User
}

export const sessionQueryKey = ['session', 'me'] as const

export async function ensureSession(): Promise<SessionState> {
  const firstResponse = await fetchCurrentUser()
  if (firstResponse.ok) {
    return { user: await firstResponse.json() as User }
  }

  if (!shouldRefreshForUserResponse(firstResponse.status)) {
    throw new Error(`Session check failed with status ${firstResponse.status}`)
  }

  await refreshSession()

  const retryResponse = await fetchCurrentUser()
  if (retryResponse.ok) {
    return { user: await retryResponse.json() as User }
  }

  if (shouldRefreshForUserResponse(retryResponse.status)) {
    throw new ConfirmedLoggedOutError()
  }

  throw new TransientAuthError(
    `Session check failed with status ${retryResponse.status}`,
  )
}

export function sessionQueryOptions() {
  return queryOptions({
    queryKey: sessionQueryKey,
    queryFn: ensureSession,
    staleTime: SESSION_STALE_TIME_MS,
    retry: (failureCount, error) =>
      !isConfirmedLoggedOutError(error) && failureCount < 2,
  })
}

export function useSession() {
  return useQuery(sessionQueryOptions())
}

function fetchCurrentUser(): Promise<Response> {
  return fetch(resolveApiUrl('/user/me'), {
    credentials: 'include',
  })
}

function shouldRefreshForUserResponse(status: number): boolean {
  return status === 401 || status === 403
}
