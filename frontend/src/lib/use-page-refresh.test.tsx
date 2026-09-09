import { act, cleanup, renderHook } from '@testing-library/react'
import {
  QueryClient,
  QueryClientProvider,
  QueryObserver,
} from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pageReadPolicy } from './page-refresh'
import { usePageRefresh } from './use-page-refresh'
import type { ReactNode } from 'react'

const preferences = vi.hoisted(() => ({
  today: '2026-06-10',
  reconcileDate: vi.fn(() => false),
}))
vi.mock('./presentation-preferences', () => ({
  usePresentationPreferences: () => preferences,
}))
let client: QueryClient
let visibility: 'hidden' | 'visible'
let online: boolean
let unobserve: Array<() => void>
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-10T12:00:00Z'))
  visibility = 'visible'
  online = true
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(
    () => visibility,
  )
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
  Object.defineProperty(navigator, 'standalone', {
    configurable: true,
    value: false,
  })
  preferences.today = '2026-06-10'
  preferences.reconcileDate.mockReset().mockReturnValue(false)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  unobserve = []
})
afterEach(() => {
  cleanup()
  unobserve.forEach((stop) => stop())
  client.clear()
  document.querySelector('[data-refresh-editor]')?.remove()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
function reads() {
  return ['summary', 'series'].map((family) => {
    const fn = vi.fn().mockResolvedValue({ value: 2 })
    const observer = new QueryObserver(client, {
      ...pageReadPolicy,
      queryKey: [
        `/balance-query/dashboard-${family}`,
        { period: 'month', endDate: preferences.today },
      ],
      queryFn: fn,
      initialData: { value: 1 },
      initialDataUpdatedAt: Date.now(),
      staleTime: Infinity,
    })
    unobserve.push(observer.subscribe(() => {}))
    return fn
  })
}
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
function changeVisibility(next: typeof visibility) {
  act(() => {
    visibility = next
    document.dispatchEvent(new Event('visibilitychange'))
  })
}
async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
}

describe('foreground event ownership', () => {
  it('refreshes standalone focus returns without visibility events and joins restoration bursts', async () => {
    Object.defineProperty(navigator, 'standalone', { value: true })
    const functions = reads()
    renderHook(() => usePageRefresh('alice', 'UTC', '/home'), { wrapper })
    act(() => window.dispatchEvent(new Event('focus')))
    await flush()
    functions.forEach((fn) => expect(fn).not.toHaveBeenCalled())
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    act(() => window.dispatchEvent(new Event('focus')))
    await flush()
    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true }),
      )
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('online'))
    })
    await flush()
    functions.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1))
    // A known second departure is a new return, even inside the burst window.
    act(() => {
      window.dispatchEvent(new Event('blur'))
      window.dispatchEvent(new Event('focus'))
    })
    await flush()
    functions.forEach((fn) => expect(fn).toHaveBeenCalledTimes(2))
  })
  it('restores frozen pages without visibility changes and ignores initial pageshow', async () => {
    const functions = reads()
    const hook = renderHook(() => usePageRefresh('alice', 'UTC', '/home'), {
      wrapper,
    })
    act(() => window.dispatchEvent(new PageTransitionEvent('pageshow')))
    await flush()
    functions.forEach((fn) => expect(fn).not.toHaveBeenCalled())
    act(() => {
      window.dispatchEvent(
        new PageTransitionEvent('pagehide', { persisted: true }),
      )
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true }),
      )
    })
    await flush()
    functions.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1))
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    act(() =>
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true }),
      ),
    )
    await flush()
    functions.forEach((fn) => expect(fn).toHaveBeenCalledTimes(2))
    hook.unmount()
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide'))
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true }),
      )
    })
    await flush()
    functions.forEach((fn) => expect(fn).toHaveBeenCalledTimes(2))
  })
  it('queues focus before visible and offline standalone returns exactly once', async () => {
    Object.defineProperty(navigator, 'standalone', { value: true })
    const functions = reads()
    renderHook(() => usePageRefresh('alice', 'UTC', '/home'), { wrapper })
    changeVisibility('hidden')
    act(() => window.dispatchEvent(new Event('focus')))
    changeVisibility('visible')
    await flush()
    functions.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1))
    online = false
    act(() => {
      window.dispatchEvent(new Event('blur'))
      window.dispatchEvent(new Event('focus'))
    })
    await flush()
    functions.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1))
    online = true
    act(() => window.dispatchEvent(new Event('online')))
    await flush()
    functions.forEach((fn) => expect(fn).toHaveBeenCalledTimes(2))
  })
  it('ignores initial visible mount and focus duplicates, but counts each actual return', async () => {
    const functions = reads()
    renderHook(() => usePageRefresh('alice', 'UTC', '/home'), { wrapper })
    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('focus'))
    })
    expect(functions[0]).not.toHaveBeenCalled()
    changeVisibility('hidden')
    changeVisibility('visible')
    changeVisibility('visible')
    act(() => {
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('online'))
    })
    await flush()
    functions.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1))
    changeVisibility('hidden')
    changeVisibility('visible')
    await flush()
    functions.forEach((fn) => expect(fn).toHaveBeenCalledTimes(2))
  })
  it('discards queued offline intent on route or identity changes and cleanup', async () => {
    const functions = reads()
    const hook = renderHook(
      ({ identity, path }) => usePageRefresh(identity, 'UTC', path),
      {
        wrapper,
        initialProps: { identity: 'alice', path: '/home' },
      },
    )
    online = false
    changeVisibility('hidden')
    changeVisibility('visible')
    hook.rerender({ identity: 'alice', path: '/accounts' })
    online = true
    act(() => window.dispatchEvent(new Event('online')))
    await flush()
    functions.forEach((fn) => expect(fn).not.toHaveBeenCalled())
    hook.rerender({ identity: 'alice', path: '/home' })
    online = false
    changeVisibility('hidden')
    changeVisibility('visible')
    hook.rerender({ identity: 'bob', path: '/home' })
    online = true
    act(() => window.dispatchEvent(new Event('online')))
    await flush()
    functions.forEach((fn) => expect(fn).not.toHaveBeenCalled())
    hook.unmount()
    changeVisibility('hidden')
    changeVisibility('visible')
    await flush()
    functions.forEach((fn) => expect(fn).not.toHaveBeenCalled())
  })
  it('automatically consumes editor-deferred intent when the modal closes', async () => {
    const functions = reads()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('data-refresh-editor', 'true')
    document.body.append(dialog)
    renderHook(() => usePageRefresh('alice', 'UTC', '/home'), { wrapper })
    changeVisibility('hidden')
    changeVisibility('visible')
    functions.forEach((fn) => expect(fn).not.toHaveBeenCalled())
    await act(async () => {
      dialog.remove()
      await Promise.resolve()
    })
    await flush()
    functions.forEach((fn) => expect(fn).toHaveBeenCalledTimes(1))
  })
})
