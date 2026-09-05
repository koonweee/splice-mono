import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { configureQueryPolicy } from './query-policy'

afterEach(() => vi.useRealTimers())

describe('query reuse policy', () => {
  it('reuses financial data for 30 seconds, then deduplicates concurrent refreshes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'))
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    })
    configureQueryPolicy(client)
    const fetch = vi.fn().mockResolvedValue({ total: 12 })
    const options = {
      queryKey: ['/balance-query/dashboard-summary', { period: 'month' }],
      queryFn: fetch,
    }
    await client.fetchQuery(options)
    vi.advanceTimersByTime(29_999)
    await client.fetchQuery(options)
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2)
    await Promise.all([client.fetchQuery(options), client.fetchQuery(options)])
    expect(fetch).toHaveBeenCalledTimes(2)
    client.clear()
  })

  it('keeps session freshness at five minutes and security inventory fresh on entry', async () => {
    vi.useFakeTimers()
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity } },
    })
    configureQueryPolicy(client)
    const session = vi.fn().mockResolvedValue({ id: 'user-a' })
    const tokens = vi.fn().mockResolvedValue([])
    await client.fetchQuery({ queryKey: ['/user/me'], queryFn: session })
    await client.fetchQuery({ queryKey: ['/user/tokens'], queryFn: tokens })
    vi.advanceTimersByTime(31_000)
    await client.fetchQuery({ queryKey: ['/user/me'], queryFn: session })
    await client.fetchQuery({ queryKey: ['/user/tokens'], queryFn: tokens })
    expect(session).toHaveBeenCalledTimes(1)
    expect(tokens).toHaveBeenCalledTimes(2)
    client.clear()
  })
})
