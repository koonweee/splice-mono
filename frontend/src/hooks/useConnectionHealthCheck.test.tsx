// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConnectionHealthCheck } from './useConnectionHealthCheck'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  user: { id: 'user-one' } as { id: string } | undefined,
}))
vi.mock('../api/clients/spliceAPI', () => ({
  bankLinkControllerCheckHealth: mocks.check,
}))
vi.mock('../lib/session', () => ({
  useCurrentUser: () => ({ data: mocks.user }),
}))
afterEach(cleanup)
beforeEach(() => {
  mocks.check.mockReset().mockResolvedValue({ checked: 1, changed: false })
  mocks.user = { id: 'user-one' }
})
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
describe('stale-load connection health checks', () => {
  it('waits for page data and shares one check across page mounts', async () => {
    const { client, wrapper } = setup()
    const first = renderHook(
      ({ enabled }) => useConnectionHealthCheck(enabled),
      { wrapper, initialProps: { enabled: false } },
    )
    expect(mocks.check).not.toHaveBeenCalled()
    first.rerender({ enabled: true })
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true))
    first.unmount()
    const second = renderHook(() => useConnectionHealthCheck(true), { wrapper })
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true))
    expect(mocks.check).toHaveBeenCalledTimes(1)
    client.clear()
  })
  it('invalidates account, dashboard and notification reads after a health change', async () => {
    mocks.check.mockResolvedValue({ checked: 1, changed: true })
    const { client, wrapper } = setup()
    for (const key of [
      '/account',
      '/balance-query/dashboard-summary',
      '/notification/inbox',
      '/notification/summary',
      '/transaction',
    ])
      client.setQueryData([key], {})
    const hook = renderHook(() => useConnectionHealthCheck(true), { wrapper })
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true))
    for (const key of [
      '/account',
      '/balance-query/dashboard-summary',
      '/notification/inbox',
      '/notification/summary',
    ])
      expect(client.getQueryState([key])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['/transaction'])?.isInvalidated).toBe(false)
    client.clear()
  })
  it('does not probe anonymously or retry a transient failure repeatedly', async () => {
    const { client, wrapper } = setup()
    mocks.user = undefined
    const hook = renderHook(() => useConnectionHealthCheck(true), { wrapper })
    expect(mocks.check).not.toHaveBeenCalled()
    mocks.user = { id: 'user-two' }
    mocks.check.mockRejectedValue(new Error('offline'))
    hook.rerender()
    await waitFor(() => expect(hook.result.current.isError).toBe(true))
    expect(mocks.check).toHaveBeenCalledTimes(1)
    client.clear()
  })
})
