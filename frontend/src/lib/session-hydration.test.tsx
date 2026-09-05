import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
} from '@tanstack/react-query'
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authDocumentNavigation, isPrivateUiBlocked } from './auth-generation'
import {
  SessionOutcomeContext,
  sessionQueryKey,
  sessionQueryOptions,
  useSession,
} from './session'
import {
  ConfirmedLoggedOutError,
  TransientAuthError,
  isConfirmedLoggedOutError,
} from './session-refresh'
import type * as SessionRefresh from './session-refresh'
import type { DehydratedState } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { SessionOutcome } from './session'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refreshSession: vi.fn() }))
vi.mock('@tanstack/react-start', () => ({
  createIsomorphicFn: () => ({
    server: () => ({ client: (fn: unknown) => fn }),
  }),
}))
vi.mock('./session-refresh', async () => ({
  ...(await vi.importActual<typeof SessionRefresh>('./session-refresh')),
  refreshSession: mocks.refreshSession,
}))
const clients: Array<QueryClient> = []
function renderSerializedFailure(outcome: SessionOutcome) {
  const server = new QueryClient()
  const query = server
    .getQueryCache()
    .build(server, { queryKey: sessionQueryKey })
  query.setState({
    status: 'error',
    error: new ConfirmedLoggedOutError(),
    errorUpdateCount: 1,
    errorUpdatedAt: Date.now(),
  })
  const payload = JSON.stringify(
    dehydrate(server, { shouldDehydrateQuery: () => true }),
    (_key, value: unknown) =>
      value instanceof Error
        ? { name: 'Error', message: value.message }
        : value,
  )
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  })
  hydrate(client, JSON.parse(payload) as DehydratedState)
  clients.push(server, client)
  const hook = renderHook(() => useSession(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <SessionOutcomeContext.Provider value={outcome}>
          {children}
        </SessionOutcomeContext.Provider>
      </QueryClientProvider>
    ),
  })
  return { ...hook, client }
}
afterEach(() => {
  cleanup()
  clients.splice(0).forEach((client) => client.clear())
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

describe('session outcome hydration', () => {
  it('keeps a serialized anonymous session on Login without a hydration probe', () => {
    vi.stubGlobal('fetch', mocks.fetch)
    const { result, client } = renderSerializedFailure('anonymous')
    expect(client.getQueryState(sessionQueryKey)?.error).not.toBeInstanceOf(
      ConfirmedLoggedOutError,
    )
    expect(isConfirmedLoggedOutError(result.current.error)).toBe(true)
    expect(result.current.isPending).toBe(false)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('uses the unavailable outcome for a serialized failure and adopts successful manual retry', async () => {
    vi.stubGlobal('fetch', mocks.fetch)
    const { result } = renderSerializedFailure('unavailable')
    expect(result.current.error).toBeInstanceOf(TransientAuthError)
    mocks.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 'fresh-user', settings: {} }),
    })
    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.data?.user.id).toBe('fresh-user')
    expect(result.current.error).toBeNull()
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })

  it('adopts a fresh confirmed anonymous result after manually retrying an unavailable bootstrap', async () => {
    vi.stubGlobal('fetch', mocks.fetch)
    const { result } = renderSerializedFailure('unavailable')
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 401 })
    mocks.refreshSession.mockRejectedValueOnce(new ConfirmedLoggedOutError())
    await act(async () => {
      await result.current.refetch()
    })
    expect(result.current.error).toBeInstanceOf(ConfirmedLoggedOutError)
  })
  it('removes private UI and replaces the document after a confirmed background session loss', async () => {
    vi.stubGlobal('fetch', mocks.fetch)
    const replacement = vi
      .spyOn(authDocumentNavigation, 'replace')
      .mockImplementation(() => {})
    const client = new QueryClient()
    clients.push(client)
    client.setQueryData(sessionQueryKey, { id: 'previous-user', settings: {} })
    mocks.fetch.mockResolvedValue({ ok: false, status: 401 })
    mocks.refreshSession.mockRejectedValue(new ConfirmedLoggedOutError())
    await expect(
      client.fetchQuery({ ...sessionQueryOptions(), staleTime: 0 }),
    ).rejects.toBeInstanceOf(ConfirmedLoggedOutError)
    expect(isPrivateUiBlocked()).toBe(true)
    expect(replacement).toHaveBeenCalledTimes(1)
  })
})
