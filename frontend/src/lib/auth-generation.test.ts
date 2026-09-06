import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})
describe('browser cache identity lifecycle', () => {
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
