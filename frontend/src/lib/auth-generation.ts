import { clearHomeSnapshot, setHomeSnapshotIdentity } from './pwa/home-snapshot'
import { getPendingLogout } from './pwa/logout-state'
import { clearPendingAppTransition } from './pwa/app-transition'
import type { QueryClient } from '@tanstack/react-query'

let generation = 0
let identity: string | undefined
let privateUiBlocked = Boolean(getPendingLogout())
let replacementRequested = false
const boundaryListeners = new Set<() => void>()
const clients = new Set<QueryClient>()
let listening = false
let identityChannel: BroadcastChannel | undefined
const AUTH_EVENT_KEY = 'splice:auth-generation'

export const getAuthGeneration = () => generation
export const isPrivateUiBlocked = () => privateUiBlocked
export const subscribeAuthBoundary = (listener: () => void) => {
  boundaryListeners.add(listener)
  return () => {
    boundaryListeners.delete(listener)
  }
}

/** A new document discards mounted query observers, editors, and pending callbacks. */
export const authDocumentNavigation = {
  replace: () => window.location.replace('/'),
}
function replaceIdentityDocument() {
  if (
    replacementRequested ||
    typeof window === 'undefined' ||
    getPendingLogout()
  )
    return
  replacementRequested = true
  authDocumentNavigation.replace()
}
export function assertAuthGeneration(expected: number) {
  if (generation !== expected)
    throw new DOMException('Session changed', 'AbortError')
}

export function clearPrivateCaches(broadcast = true) {
  clearHomeSnapshot()
  clearPendingAppTransition()
  generation += 1
  identity = undefined
  if (typeof window !== 'undefined') {
    privateUiBlocked = true
    for (const listener of boundaryListeners) listener()
  }
  for (const client of clients) {
    void client.cancelQueries()
    client.clear()
  }
  if (broadcast && typeof window !== 'undefined') {
    try {
      identityChannel?.postMessage({ type: 'clear' })
    } catch {
      /* Storage remains an independent cross-tab transport. */
    }
    try {
      window.localStorage.setItem(AUTH_EVENT_KEY, crypto.randomUUID())
    } catch {
      /* optional cross-tab notification */
    }
  }
}

export function bindBrowserQueryClient(client: QueryClient) {
  if (typeof window === 'undefined') return
  clients.add(client)
  client.getQueryCache().subscribe((event) => {
    if (privateUiBlocked || event.query.queryKey[0] !== '/user/me') return
    // Removal/cancellation may carry old data; neither verifies an identity.
    if (
      event.type !== 'added' &&
      !(
        event.type === 'updated' &&
        (event.action.type === 'success' || event.action.type === 'setState')
      )
    )
      return
    if (event.query.state.status !== 'success') return
    const data = event.query.state.data
    if (
      data &&
      typeof data === 'object' &&
      'id' in data &&
      typeof data.id === 'string'
    )
      acceptBrowserIdentity(data.id)
  })
  if (!listening) {
    listening = true
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        identityChannel = new BroadcastChannel('splice-identity')
      } catch {
        /* Storage events still provide a best-effort boundary. */
      }
      if (identityChannel)
        identityChannel.onmessage = (event: MessageEvent<unknown>) => {
          const data = event.data
          if (
            data &&
            typeof data === 'object' &&
            'type' in data &&
            data.type === 'clear'
          ) {
            clearPrivateCaches(false)
            replaceIdentityDocument()
            return
          }
          if (
            data &&
            typeof data === 'object' &&
            'identity' in data &&
            typeof data.identity === 'string' &&
            identity &&
            data.identity !== identity
          ) {
            clearPrivateCaches(false)
            replaceIdentityDocument()
          }
        }
    }
    window.addEventListener('storage', (event) => {
      if (event.key === AUTH_EVENT_KEY && event.newValue) {
        clearPrivateCaches(false)
        // Keep the cleared live document for pending logout recovery. Otherwise a
        // new document guarantees old observers and callbacks cannot survive.
        replaceIdentityDocument()
      }
    })
  }
}

export function acceptBrowserIdentity(next: string) {
  if (typeof window === 'undefined') return
  if (privateUiBlocked) {
    replaceIdentityDocument()
    return
  }
  if (identity !== undefined && identity !== next) {
    clearPrivateCaches()
    replaceIdentityDocument()
    return
  }
  setHomeSnapshotIdentity(next)
  const changed = identity !== next
  identity = next
  if (changed) {
    try {
      identityChannel?.postMessage({ identity: next })
    } catch {
      /* A failed optional broadcast must not interrupt verified login. */
    }
  }
}
