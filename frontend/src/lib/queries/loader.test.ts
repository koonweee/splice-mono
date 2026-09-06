import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { awaitSsrData, loadQuery } from './loader'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const clients: Array<QueryClient> = []
function queryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return client
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  vi.unstubAllGlobals()
})

describe('route data loading', () => {
  it('renders a cold client route before its data arrives and shares the request', async () => {
    const client = queryClient()
    const request = deferred<string>()
    const queryFn = vi.fn(() => request.promise)
    const options = { queryKey: ['destination'], queryFn, staleTime: 30_000 }

    expect(loadQuery(client, options)).toBeUndefined()
    expect(client.getQueryState(options.queryKey)?.fetchStatus).toBe('fetching')
    const observed = client.fetchQuery(options)
    expect(queryFn).toHaveBeenCalledTimes(1)
    request.resolve('ready')
    await expect(observed).resolves.toBe('ready')
    expect(client.getQueryData(options.queryKey)).toBe('ready')
    expect(loadQuery(client, options)).toBeUndefined()
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('waits for a cold server query before completing SSR', async () => {
    vi.stubGlobal('window', undefined)
    const client = queryClient()
    const request = deferred<string>()
    let finished = false
    const loaded = loadQuery(client, {
      queryKey: ['ssr'],
      queryFn: () => request.promise,
    })!
    void loaded.then(() => {
      finished = true
    })
    await Promise.resolve()
    expect(finished).toBe(false)
    request.resolve('rendered on the server')
    await expect(loaded).resolves.toBe('rendered on the server')
    expect(client.getQueryData(['ssr'])).toBe('rendered on the server')
  })

  it('preserves stale cached content while a client refresh runs', async () => {
    const client = queryClient()
    const request = deferred<string>()
    client.setQueryData(['cached'], 'previous', { updatedAt: 1 })
    const options = {
      queryKey: ['cached'],
      queryFn: () => request.promise,
      staleTime: 30_000,
    }
    expect(loadQuery(client, options)).toBeUndefined()
    expect(client.getQueryData(['cached'])).toBe('previous')
    request.resolve('updated')
    await client.fetchQuery(options)
    expect(client.getQueryData(['cached'])).toBe('updated')
  })

  it('leaves errors in Query for the destination error state without rejecting navigation', async () => {
    const client = queryClient()
    const error = new Error('temporarily unavailable')
    const options = {
      queryKey: ['failed'],
      queryFn: () => Promise.reject(error),
    }
    expect(loadQuery(client, options)).toBeUndefined()
    await client.fetchQuery(options).catch(() => undefined)
    expect(client.getQueryState(['failed'])?.error).toBe(error)
    vi.stubGlobal('window', undefined)
    await expect(awaitSsrData(Promise.reject(error))).resolves.toBeUndefined()
  })
})
