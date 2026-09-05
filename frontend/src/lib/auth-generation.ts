import type { QueryClient } from '@tanstack/react-query'

let generation = 0
let identity: string | undefined
let privateUiBlocked = false
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
  if (replacementRequested || typeof window === 'undefined') return
  replacementRequested = true
  authDocumentNavigation.replace()
}
export function assertAuthGeneration(expected: number) {
  if (generation !== expected)
    throw new DOMException('Session changed', 'AbortError')
}

export function clearPrivateCaches(broadcast = true) {
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
      identityChannel = new BroadcastChannel('splice-identity')
      identityChannel.onmessage = (event: MessageEvent<unknown>) => {
        const data = event.data
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
        // A new document guarantees old observers and mutation callbacks cannot survive.
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
  const changed = identity !== next
  identity = next
  if (changed) identityChannel?.postMessage({ identity: next })
}
