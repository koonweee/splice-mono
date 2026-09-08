// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'

vi.mock('./auth-generation', () => ({
  assertAuthGeneration: () => {},
  getAuthGeneration: () => 0,
  clearPrivateCaches: () => {},
}))
vi.mock('./session-refresh', () => ({
  isConfirmedLoggedOutError: () => false,
  refreshSession: () => Promise.resolve(),
}))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('page read request deadline', () => {
  it('the real fetch adapter aborts a stalled page read and makes it retryable', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((request: Request) => {
        signal = request.signal
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener(
            'abort',
            () => reject(request.signal.reason),
            { once: true },
          )
        })
      }),
    )
    const { axiosInstance, PAGE_READ_TIMEOUT } =
      await import('./browser-api-client')
    const pending = axiosInstance.get(
      'http://localhost/transaction-analysis/transactions',
      { adapter: 'fetch' },
    )
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'ETIMEDOUT',
    })
    await vi.advanceTimersByTimeAsync(PAGE_READ_TIMEOUT + 1)
    await rejected
    expect(signal?.aborted).toBe(true)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('[]', { status: 200 })),
    )
    await expect(
      axiosInstance.get('http://localhost/transaction-analysis/transactions', {
        adapter: 'fetch',
      }),
    ).resolves.toMatchObject({ data: [] })
  })
  it('does not introduce deadlines for writes or unrelated reads', async () => {
    const { axiosInstance } = await import('./browser-api-client')
    const timeouts: Array<number | undefined> = []
    const adapter = (config: InternalAxiosRequestConfig) => {
      timeouts.push(config.timeout)
      return Promise.resolve({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      })
    }
    await axiosInstance.post('/account', {}, { adapter })
    await axiosInstance.get('/user/tokens', { adapter })
    expect(timeouts).toEqual([0, 0])
  })
})
