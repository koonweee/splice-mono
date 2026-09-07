// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OFFLINE_RECOVERY_SCRIPT,
  handlePwaNavigation,
  offlinePageResponse,
} from './offline-page'

const eventFor = (preloadResponse: Promise<Response | undefined>) =>
  ({
    request: new Request(
      'https://splice.test/transactions?categoryId=UNCATEGORIZED',
    ),
    preloadResponse,
  }) as FetchEvent

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('offline recovery interactions', () => {
  function harness(fetcher: ReturnType<typeof vi.fn>, recentReload = false) {
    const button = Object.assign(new EventTarget(), { disabled: false })
    const status = { textContent: '' }
    const document = Object.assign(new EventTarget(), {
      visibilityState: 'visible',
      getElementById: (id: string) => (id === 'splice-retry' ? button : status),
    })
    const events = new EventTarget()
    const location = {
      href: 'https://splice.test/transactions?categoryId=UNCATEGORIZED#review',
      reload: vi.fn(),
    }
    const sessionStorage = {
      getItem: () => (recentReload ? String(Date.now()) : null),
      setItem: vi.fn(),
    }
    const run = new Function(
      'window',
      'document',
      'location',
      'navigator',
      'fetch',
      'sessionStorage',
      'addEventListener',
      OFFLINE_RECOVERY_SCRIPT,
    )
    run(
      {},
      document,
      location,
      { onLine: true },
      fetcher,
      sessionStorage,
      events.addEventListener.bind(events),
    )
    return { button, status, events, location, document, sessionStorage }
  }
  const settle = async () => {
    for (let turn = 0; turn < 10; turn++)
      await new Promise((done) => setImmediate(done))
  }

  it('retries with visible pending state, deduplicates events and returns to the exact location', async () => {
    let release: (response: Response) => void = () => undefined
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((done) => {
          release = done
        }),
    )
    const ui = harness(fetcher)
    ui.button.dispatchEvent(new Event('click'))
    ui.events.dispatchEvent(new Event('online'))
    ui.document.dispatchEvent(new Event('visibilitychange'))
    expect(ui.button.disabled).toBe(true)
    expect(ui.status.textContent).toBe('Checking connection…')
    expect(fetcher).toHaveBeenCalledTimes(1)
    release(Response.json({ app: 'splice', status: 'ready' }))
    await settle()
    expect(ui.location.reload).toHaveBeenCalledTimes(1)
    expect(ui.location.href).toBe(
      'https://splice.test/transactions?categoryId=UNCATEGORIZED#review',
    )
    expect(ui.sessionStorage.setItem).toHaveBeenCalledWith(
      'splice-offline-recovery-at',
      expect.any(String),
    )
  })
  it('coalesces reconnect events during a failed probe into one throttled retry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
    let release: (response: Response) => void = () => undefined
    const fetcher = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((done) => {
            release = done
          }),
      )
      .mockResolvedValue(Response.json({ app: 'splice', status: 'ready' }))
    const ui = harness(fetcher)
    ui.button.dispatchEvent(new Event('click'))
    for (let turn = 0; turn < 5; turn++) {
      ui.events.dispatchEvent(new Event('online'))
      ui.document.dispatchEvent(new Event('visibilitychange'))
    }
    await vi.advanceTimersByTimeAsync(5000)
    release(new Response('Unavailable', { status: 503 }))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(ui.button.disabled).toBe(false)
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(ui.location.reload).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('queues a reconnect that arrives after a fast failure inside the throttle window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T12:00:00Z'))
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(Response.json({ app: 'splice', status: 'ready' }))
    const ui = harness(fetcher)
    ui.button.dispatchEvent(new Event('click'))
    await vi.advanceTimersByTimeAsync(2000)
    ui.events.dispatchEvent(new Event('online'))
    ui.document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(7999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(ui.location.reload).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it.each([
    () =>
      new Response('<html>captive portal</html>', {
        headers: { 'content-type': 'text/html' },
      }),
    () => Response.json({ app: 'other', status: 'ready' }),
    () => Response.json({ app: 'splice', status: 'ready' }, { status: 503 }),
  ])(
    'does not reload on captive portals or backend failures',
    async (response) => {
      const ui = harness(vi.fn().mockResolvedValue(response()))
      ui.button.dispatchEvent(new Event('click'))
      await settle()
      expect(ui.location.reload).not.toHaveBeenCalled()
      expect(ui.button.disabled).toBe(false)
      expect(ui.status.textContent).toBe(
        'Splice is still unavailable. Try again shortly.',
      )
    },
  )
  it('accepts a confirmed expired session and avoids automatic recovery reload loops', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ app: 'splice', status: 'login' }))
    const ui = harness(fetcher, true)
    ui.events.dispatchEvent(new Event('online'))
    ui.document.dispatchEvent(new Event('visibilitychange'))
    expect(fetcher).not.toHaveBeenCalled()
    ui.button.dispatchEvent(new Event('click'))
    await settle()
    expect(ui.location.reload).toHaveBeenCalledTimes(1)
    expect(ui.status.textContent).toContain('sign in')
  })
})
describe('PWA navigation recovery', () => {
  it('consumes preload once and preserves the original streaming private response', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('opening'))
        },
      }),
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
    expect(await handlePwaNavigation(eventFor(Promise.resolve(response)))).toBe(
      response,
    )
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('makes exactly one fallback request when preload is unavailable', async () => {
    const response = new Response('redirect', {
      status: 302,
      headers: { Location: '/login' },
    })
    const fetcher = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetcher)
    expect(
      await handlePwaNavigation(eventFor(Promise.resolve(undefined))),
    ).toBe(response)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0][0].url).toBe(
      'https://splice.test/transactions?categoryId=UNCATEGORIZED',
    )
  })
  it('does not duplicate a failed preload or wait indefinitely for its headers', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const failed = await handlePwaNavigation(
      eventFor(Promise.reject(new Error('offline'))),
    )
    expect(failed.status).toBe(503)
    let resolve: (value: undefined) => void = () => undefined
    const late = handlePwaNavigation(
      eventFor(
        new Promise((done) => {
          resolve = done
        }),
      ),
    )
    await vi.advanceTimersByTimeAsync(8000)
    expect((await late).headers.get('X-Splice-Offline')).toBe('timeout')
    resolve(undefined)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('aborts stalled fallback headers but preserves valid authentication responses', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_request, options: RequestInit) => {
        signal = options.signal ?? undefined
        return new Promise(() => undefined)
      }),
    )
    const navigation = handlePwaNavigation(eventFor(Promise.resolve(undefined)))
    await vi.advanceTimersByTimeAsync(8000)
    expect((await navigation).status).toBe(503)
    expect(signal?.aborted).toBe(true)
  })
  it('shows safe server-unavailable recovery without caching financial content', async () => {
    const response = await handlePwaNavigation(
      eventFor(
        Promise.resolve(
          new Response('private server failure', { status: 503 }),
        ),
      ),
    )
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.text()).not.toContain('private server failure')
    expect(
      await offlinePageResponse('fixture-build', 'network').text(),
    ).toContain('/pwa-offline-fixture-build.js')
  })
})
