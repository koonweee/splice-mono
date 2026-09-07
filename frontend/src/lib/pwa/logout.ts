import { resolveApiUrl } from '../api-base-url'
import { fetchWithDeadline } from './deadline'
import { clearPendingLogout, getPendingLogout } from './logout-state'
import type { PendingLogout } from './logout-state'

let inFlight: { id: string; promise: Promise<boolean> } | undefined
export async function completePendingLogout(
  pending: PendingLogout | null = getPendingLogout(),
): Promise<boolean> {
  if (!pending) return true
  if (inFlight?.id === pending.id) return inFlight.promise
  if (inFlight) {
    await inFlight.promise.catch(() => undefined)
    return completePendingLogout(getPendingLogout())
  }
  const state = { id: pending.id, promise: Promise.resolve(false) }
  state.promise = (async () => {
    const request = () =>
      fetchWithDeadline(
        resolveApiUrl(
          pending.mode === 'all' ? '/user/logout-all' : '/user/logout',
        ),
        {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      )
    let response = await request()
    if (pending.mode === 'all' && response.status === 401) {
      const refreshed = await fetchWithDeadline(
        resolveApiUrl('/user/refresh'),
        {
          method: 'POST',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      )
      if (refreshed.ok) response = await request()
    }
    if (!response.ok)
      throw new Error(
        'Sign out has not reached the server. Reconnect and retry.',
      )
    clearPendingLogout(pending.id)
    return true
  })().finally(() => {
    if (inFlight === state) inFlight = undefined
  })
  inFlight = state
  return state.promise
}
