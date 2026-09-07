import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('browser cache identity lifecycle', () => {
  it('clears another tab through BroadcastChannel when logout storage writes fail', async () => {
    class Channel {
      static channels: Array<Channel> = []
      onmessage?: (event: MessageEvent<unknown>) => void
      postMessage = vi.fn((data: unknown) => {
        for (const channel of Channel.channels) {
          if (channel !== this)
            queueMicrotask(() =>
              channel.onmessage?.(new MessageEvent('message', { data })),
            )
        }
      })
      constructor() {
        Channel.channels.push(this)
      }
    }
    vi.stubGlobal('BroadcastChannel', Channel)
    const sender = await import('./auth-generation')
    const senderClient = new QueryClient()
    sender.bindBrowserQueryClient(senderClient)
    senderClient.setQueryData(['/user/me'], { id: 'alice' })
    vi.resetModules()
    const receiver = await import('./auth-generation')
    const receiverClient = new QueryClient()
    receiver.bindBrowserQueryClient(receiverClient)
    receiverClient.setQueryData(['/user/me'], { id: 'alice' })
    receiverClient.setQueryData(['/account'], [{ id: 'private-account' }])
    const replace = vi
      .spyOn(receiver.authDocumentNavigation, 'replace')
      .mockImplementation(() => {})
    const failedWrite = vi.fn(() => {
      throw new Error('Storage unavailable')
    })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: failedWrite })
    document.cookie =
      'splice_logout_pending=device.00000000-0000-4000-8000-000000000003; Path=/'
    try {
      sender.clearPrivateCaches()
      await Promise.resolve()
      expect(failedWrite).toHaveBeenCalled()
      expect(receiver.isPrivateUiBlocked()).toBe(true)
      expect(receiverClient.getQueryCache().getAll()).toHaveLength(0)
      expect(replace).not.toHaveBeenCalled()
      expect(Channel.channels[0].postMessage).toHaveBeenCalledWith({
        type: 'clear',
      })
      expect(Channel.channels[1].postMessage).not.toHaveBeenCalledWith({
        type: 'clear',
      })
    } finally {
      document.cookie = 'splice_logout_pending=; Path=/; Max-Age=0'
      senderClient.clear()
      receiverClient.clear()
    }
  })

  it('keeps storage logout broadcasts usable when BroadcastChannel construction fails', async () => {
    vi.stubGlobal(
      'BroadcastChannel',
      class {
        constructor() {
          throw new Error('Unavailable')
        }
      },
    )
    const auth = await import('./auth-generation')
    const client = new QueryClient()
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem })
    expect(() => auth.bindBrowserQueryClient(client)).not.toThrow()
    expect(() => auth.acceptBrowserIdentity('alice')).not.toThrow()
    auth.clearPrivateCaches()
    expect(setItem).toHaveBeenCalledWith(
      'splice:auth-generation',
      expect.any(String),
    )
    client.clear()
  })

  it('starts with private UI blocked after a reload with pending logout', async () => {
    document.cookie =
      'splice_logout_pending=all.00000000-0000-4000-8000-000000000001; Path=/'
    try {
      vi.resetModules()
      const {
        isPrivateUiBlocked,
        acceptBrowserIdentity,
        authDocumentNavigation,
      } = await import('./auth-generation')
      const replace = vi
        .spyOn(authDocumentNavigation, 'replace')
        .mockImplementation(() => {})
      expect(isPrivateUiBlocked()).toBe(true)
      acceptBrowserIdentity('previous-owner')
      expect(replace).not.toHaveBeenCalled()
      expect(isPrivateUiBlocked()).toBe(true)
    } finally {
      document.cookie = 'splice_logout_pending=; Path=/; Max-Age=0'
    }
  })

  it('clears another tab immediately while retaining its live logout UI until acknowledgement', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    const browserEvents: EventTarget = window
    const addListener = vi.spyOn(browserEvents, 'addEventListener')
    const {
      bindBrowserQueryClient,
      isPrivateUiBlocked,
      acceptBrowserIdentity,
      authDocumentNavigation,
    } = await import('./auth-generation')
    const client = new QueryClient()
    bindBrowserQueryClient(client)
    client.setQueryData(['/user/me'], { id: 'alice' })
    client.setQueryData(['/account'], [{ id: 'private-account' }])
    const replace = vi
      .spyOn(authDocumentNavigation, 'replace')
      .mockImplementation(() => {})
    document.cookie =
      'splice_logout_pending=device.00000000-0000-4000-8000-000000000002; Path=/'
    try {
      const listener = addListener.mock.calls.find(
        ([type]) => type === 'storage',
      )?.[1]
      expect(typeof listener).toBe('function')
      if (typeof listener === 'function')
        listener(
          new StorageEvent('storage', {
            key: 'splice:auth-generation',
            newValue: 'logout',
          }),
        )
      expect(isPrivateUiBlocked()).toBe(true)
      expect(client.getQueryCache().getAll()).toHaveLength(0)
      expect(replace).not.toHaveBeenCalled()
      document.cookie = 'splice_logout_pending=; Path=/; Max-Age=0'
      acceptBrowserIdentity('alice')
      expect(replace).toHaveBeenCalledOnce()
      expect(isPrivateUiBlocked()).toBe(true)
    } finally {
      document.cookie = 'splice_logout_pending=; Path=/; Max-Age=0'
      client.clear()
    }
  })

  it('cancels pending reads and clears all private families on logout', async () => {
    const {
      bindBrowserQueryClient,
      clearPrivateCaches,
      getAuthGeneration,
      assertAuthGeneration,
    } = await import('./auth-generation')
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    bindBrowserQueryClient(client)
    client.setQueryData(['/account'], [{ id: 'old-account' }])
    client.setQueryData(['/balance-query/dashboard-summary'], { amount: '123' })
    let finish: ((value: string) => void) | undefined
    let signal: AbortSignal | undefined
    const generation = getAuthGeneration()
    const pending = client.fetchQuery({
      queryKey: ['/transaction'],
      queryFn: (context) => {
        signal = context.signal
        return new Promise<string>((resolve) => {
          finish = resolve
        })
      },
    })
    const outcome = pending.catch((error: unknown) => error)
    clearPrivateCaches(false)
    expect(signal?.aborted).toBe(true)
    expect(() => assertAuthGeneration(generation)).toThrow('Session changed')
    finish?.('old response')
    await outcome
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })
  it('binds hydrated canonical user data before later identity changes', async () => {
    const {
      bindBrowserQueryClient,
      getAuthGeneration,
      acceptBrowserIdentity,
      authDocumentNavigation,
    } = await import('./auth-generation')
    const client = new QueryClient()
    bindBrowserQueryClient(client)
    client.setQueryData(['/user/me'], { id: 'alice' })
    client.setQueryData(['/account'], [{ id: 'alice-account' }])
    const generation = getAuthGeneration()
    const replace = vi
      .spyOn(authDocumentNavigation, 'replace')
      .mockImplementation(() => {})
    acceptBrowserIdentity('bob')
    expect(replace).toHaveBeenCalledOnce()
    expect(getAuthGeneration()).toBeGreaterThan(generation)
    expect(client.getQueryData(['/account'])).toBeUndefined()
    client.clear()
  })
})
