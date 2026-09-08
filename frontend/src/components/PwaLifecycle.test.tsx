import { MantineProvider } from '@mantine/core'
import {
  MutationObserver,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPendingAppTransition,
  registerAppTransitionGuard,
  setAppMutationBlocked,
} from '../lib/pwa/app-transition'
import { PwaLifecycle } from './PwaLifecycle'
import type { PwaUpdateState } from '../lib/pwa/service-worker'

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  check: vi.fn(),
  reportChunk: vi.fn(),
  postBuild: vi.fn(),
  applyBadge: vi.fn(),
  reconcile: vi.fn(),
  useSession: vi.fn(),
  request: vi.fn(),
  navigate: vi.fn(),
  replace: vi.fn(),
  finishLogout: vi.fn(),
  pending: null as { id: string; mode: 'device' | 'all' } | null,
  generation: 0,
  blocked: false,
  listeners: new Set<(state: PwaUpdateState) => void>(),
  authListeners: new Set<() => void>(),
  state: {
    needRefresh: false,
    updateServiceWorker: null,
    status: 'ready',
  } as PwaUpdateState,
}))
vi.mock('../lib/pwa/service-worker', () => ({
  APP_BUILD_ID: 'test-build',
  getPwaUpdateState: () => mocks.state,
  registerPwaServiceWorker: mocks.register,
  getServiceWorkerRegistration: () =>
    Promise.resolve({ active: { postMessage: mocks.postBuild } }),
  checkForPwaUpdate: mocks.check,
  reportChunkLoadFailure: mocks.reportChunk,
  subscribeToPwaUpdates: (listener: (state: PwaUpdateState) => void) => {
    mocks.listeners.add(listener)
    return () => {
      mocks.listeners.delete(listener)
    }
  },
}))
vi.mock('../lib/pwa/app-badge', () => ({
  applyNotificationSummaryBadge: mocks.applyBadge,
}))
vi.mock('../lib/notifications/browser-push', () => ({
  reconcileDeviceNotifications: mocks.reconcile,
}))
vi.mock('../lib/session', () => ({ useSession: () => mocks.useSession() }))
vi.mock('../api/axios', () => ({ axios: mocks.request }))
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ navigate: mocks.navigate }),
}))
vi.mock('../lib/auth-generation', () => ({
  getAuthGeneration: () => mocks.generation,
  isPrivateUiBlocked: () => mocks.blocked,
  assertAuthGeneration: (generation: number) => {
    if (generation !== mocks.generation) throw new Error('Session changed')
  },
  authDocumentNavigation: { replace: mocks.replace },
  subscribeAuthBoundary: (listener: () => void) => {
    mocks.authListeners.add(listener)
    return () => {
      mocks.authListeners.delete(listener)
    }
  },
}))
vi.mock('../lib/pwa/logout-state', () => ({
  getPendingLogout: () => mocks.pending,
  PENDING_LOGOUT_KEY: 'pending',
}))
vi.mock('../lib/pwa/logout', () => ({
  completePendingLogout: mocks.finishLogout,
}))
let client: QueryClient
let worker: EventTarget
let release: (() => void) | undefined
const summary = {
  unreadNotificationCount: 2,
  uncategorizedTransactionCount: 12,
  computedAt: '2026-09-07T12:00:00.000Z',
}
function mount(offlineStatusOwnedByHeader = false) {
  return render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <PwaLifecycle offlineStatusOwnedByHeader={offlineStatusOwnedByHeader} />
      </QueryClientProvider>
    </MantineProvider>,
  )
}
function online(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true })
}
function emit(state: PwaUpdateState) {
  mocks.state = state
  mocks.listeners.forEach((listener) => listener(state))
}
function message(data: Record<string, unknown>) {
  const ack = vi.fn()
  worker.dispatchEvent(
    Object.assign(new Event('message'), {
      data,
      ports: [{ postMessage: ack }],
    }),
  )
  return ack
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  worker = new EventTarget()
  vi.stubGlobal('navigator', { onLine: true, serviceWorker: worker })
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  mocks.state = {
    needRefresh: false,
    updateServiceWorker: null,
    status: 'ready',
  }
  mocks.pending = null
  mocks.blocked = false
  mocks.generation = 0
  mocks.listeners.clear()
  mocks.authListeners.clear()
  mocks.register.mockResolvedValue(undefined)
  mocks.check.mockResolvedValue(undefined)
  mocks.reconcile.mockResolvedValue(undefined)
  mocks.applyBadge.mockResolvedValue(undefined)
  mocks.request.mockReset().mockResolvedValue(summary)
  mocks.useSession.mockReturnValue({ data: undefined })
})
afterEach(() => {
  cleanup()
  client.clear()
  release?.()
  release = undefined
  clearPendingAppTransition()
  setAppMutationBlocked(false)
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('PwaLifecycle integration', () => {
  it('delegates offline feedback to the mounted authenticated header', () => {
    mount(true)
    online(false)
    fireEvent(window, new Event('offline'))
    expect(screen.queryByText(/Live financial data may not load/)).toBeNull()
  })
  it('shows and clears offline degradation without making anonymous financial requests', () => {
    mount()
    online(false)
    fireEvent(window, new Event('offline'))
    expect(screen.getByText(/Live financial data may not load/)).toBeTruthy()
    online(true)
    fireEvent(window, new Event('online'))
    expect(screen.queryByText(/Live financial data may not load/)).toBeNull()
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('registers, reports its build, and retries a visible registration error', async () => {
    mount()
    await waitFor(() =>
      expect(mocks.postBuild).toHaveBeenCalledWith({
        type: 'PWA_CLIENT_BUILD',
        buildId: 'test-build',
      }),
    )
    act(() =>
      emit({
        needRefresh: false,
        updateServiceWorker: null,
        status: 'failed',
        error: 'Registration failed.',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mocks.check).toHaveBeenCalledWith(true))
    expect(mocks.register.mock.calls.length).toBeGreaterThan(1)
  })
  it('reconciles before sending the shared authoritative summary and deduplicates focus/visibility bursts', async () => {
    const binding = deferred()
    mocks.reconcile.mockReturnValue(binding.promise)
    mocks.useSession.mockReturnValue({ data: { user: { id: 'one' } } })
    mount()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledOnce())
    expect(mocks.applyBadge).not.toHaveBeenCalled()
    await act(async () => {
      binding.resolve()
      await binding.promise
    })
    await waitFor(() => expect(mocks.applyBadge).toHaveBeenCalledWith(summary))
    fireEvent(window, new Event('focus'))
    fireEvent(document, new Event('visibilitychange'))
    expect(mocks.reconcile).toHaveBeenCalledOnce()
    expect(mocks.request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/notification/summary' }),
    )
  })
  it('fetches a fresh summary after binding and after stale-epoch recovery without replaying old counts', async () => {
    const old = {
      ...summary,
      uncategorizedTransactionCount: 99,
      computedAt: '2026-09-07T10:00:00.000Z',
    }
    const fresh = {
      ...summary,
      uncategorizedTransactionCount: 4,
      computedAt: '2026-09-07T13:00:00.000Z',
    }
    const recovered = {
      ...summary,
      uncategorizedTransactionCount: 0,
      computedAt: '2026-09-07T14:00:00.000Z',
    }
    client.setQueryData(['/notification/summary'], old)
    let finishFirst!: (value: typeof summary) => void
    let finishRecovery!: (value: typeof summary) => void
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve
        }),
    )
    mocks.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRecovery = resolve
        }),
    )
    mocks.useSession.mockReturnValue({ data: { user: { id: 'one' } } })
    mount()
    await waitFor(() => expect(mocks.request).toHaveBeenCalledOnce())
    expect(mocks.applyBadge).not.toHaveBeenCalled()
    await act(async () => {
      finishFirst(fresh)
      await Promise.resolve()
    })
    await waitFor(() => expect(mocks.applyBadge).toHaveBeenCalledWith(fresh))
    fireEvent(window, new Event('splice:pwa-control-stale'))
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2))
    expect(mocks.reconcile).toHaveBeenCalledTimes(2)
    expect(mocks.applyBadge).toHaveBeenCalledOnce()
    await act(async () => {
      finishRecovery(recovered)
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(mocks.applyBadge).toHaveBeenLastCalledWith(recovered),
    )
    expect(mocks.applyBadge).toHaveBeenCalledTimes(2)
    expect(mocks.applyBadge).not.toHaveBeenCalledWith(old)
  })
  it('coalesces a stale epoch during a bind into a new bind before fetching an eligible summary', async () => {
    const binding = deferred()
    client.setQueryData(['/notification/summary'], summary)
    mocks.reconcile
      .mockReturnValueOnce(binding.promise)
      .mockResolvedValue(undefined)
    mocks.useSession.mockReturnValue({ data: { user: { id: 'one' } } })
    mount()
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledOnce())
    fireEvent(window, new Event('splice:pwa-control-stale'))
    fireEvent(window, new Event('splice:pwa-control-stale'))
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.applyBadge).not.toHaveBeenCalled()
    await act(async () => {
      binding.resolve()
      await binding.promise
    })
    await waitFor(() => expect(mocks.applyBadge).toHaveBeenCalledWith(summary))
    expect(mocks.reconcile).toHaveBeenCalledTimes(2)
    expect(mocks.request).toHaveBeenCalledOnce()
  })
  it('leaves badges ineligible when the required post-bind summary fails', async () => {
    client.setQueryData(['/notification/summary'], summary)
    mocks.request.mockRejectedValue(new Error('Summary unavailable'))
    mocks.useSession.mockReturnValue({ data: { user: { id: 'one' } } })
    mount()
    await waitFor(() =>
      expect(screen.getByText('Summary unavailable')).toBeTruthy(),
    )
    expect(mocks.applyBadge).not.toHaveBeenCalled()
    expect(client.getQueryData(['/notification/summary'])).toEqual(summary)
  })
  it('ignores an enrollment completion from a replaced authentication generation', async () => {
    const binding = deferred()
    mocks.reconcile.mockReturnValue(binding.promise)
    mocks.useSession.mockReturnValue({ data: { user: { id: 'one' } } })
    mount()
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledOnce())
    await act(async () => {
      mocks.generation++
      mocks.blocked = true
      mocks.authListeners.forEach((listener) => listener())
      binding.resolve()
      await binding.promise
    })
    expect(mocks.applyBadge).not.toHaveBeenCalled()
  })
  it('keeps updates and notification navigation behind editor and save guards', () => {
    const update = vi.fn().mockResolvedValue(undefined)
    mocks.useSession.mockReturnValue({ data: { user: { id: 'one' } } })
    mount()
    act(() => {
      release = registerAppTransitionGuard()
      emit({
        needRefresh: true,
        updateServiceWorker: update,
        status: 'update-waiting',
      })
    })
    expect(
      screen.getByRole('button', { name: 'Update' }).hasAttribute('disabled'),
    ).toBe(true)
    let ack!: ReturnType<typeof vi.fn>
    act(() => {
      ack = message({ type: 'SPLICE_NOTIFICATION_OPEN', url: '/transactions' })
    })
    expect(ack).toHaveBeenCalledWith({ handled: true })
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Open' }).hasAttribute('disabled'),
    ).toBe(true)
    act(() => {
      release?.()
      release = undefined
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(mocks.navigate).toHaveBeenCalledWith({ href: '/transactions' })
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    expect(update).toHaveBeenCalledOnce()
  })
  it('rejects external notification destinations and prevents automatic chunk reload', () => {
    mocks.useSession.mockReturnValue({ data: { user: { id: 'one' } } })
    mount()
    const ack = message({
      type: 'SPLICE_NOTIFICATION_OPEN',
      url: 'https://external.invalid/transactions',
    })
    expect(ack).toHaveBeenCalledWith({ handled: false })
    expect(mocks.navigate).not.toHaveBeenCalled()
    const error = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(error)
    expect(error.defaultPrevented).toBe(true)
    expect(mocks.reportChunk).toHaveBeenCalledOnce()
  })
  it('keeps Update busy through reload and prevents duplicate activation', async () => {
    let resolve!: (reloading: boolean) => void
    const update = vi.fn(
      () =>
        new Promise<boolean>((done) => {
          resolve = done
        }),
    )
    mocks.state = {
      needRefresh: true,
      updateServiceWorker: update,
      status: 'update-waiting',
    }
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    const button = screen.getByRole('button', { name: 'Updating Splice' })
    expect(button.hasAttribute('disabled')).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    fireEvent.click(button)
    expect(update).toHaveBeenCalledOnce()
    await act(async () => {
      resolve(true)
      await Promise.resolve()
    })
    expect(
      screen
        .getByRole('button', { name: 'Updating Splice' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })
  it('handles update failures and allows another attempt', async () => {
    const update = vi
      .fn()
      .mockRejectedValueOnce(new Error('Update unavailable. Try again.'))
      .mockResolvedValue(false)
    mocks.state = {
      needRefresh: true,
      updateServiceWorker: update,
      status: 'update-waiting',
    }
    mount()
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    await waitFor(() =>
      expect(screen.getByText('Update unavailable. Try again.')).toBeTruthy(),
    )
    const button = screen.getByRole('button', { name: 'Update' })
    expect(button.hasAttribute('disabled')).toBe(false)
    fireEvent.click(button)
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    expect(screen.queryByText('Update unavailable. Try again.')).toBeNull()
  })
  it('reflects pending mutations in the shared update guard', async () => {
    const saving = deferred()
    mount()
    act(() =>
      emit({
        needRefresh: true,
        updateServiceWorker: vi.fn(),
        status: 'update-waiting',
      }),
    )
    const mutation = new MutationObserver(client, {
      mutationFn: () => saving.promise,
    })
    let promise!: Promise<void>
    await act(async () => {
      promise = mutation.mutate()
      await Promise.resolve()
    })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Update' }).hasAttribute('disabled'),
      ).toBe(true),
    )
    await act(async () => {
      saving.resolve()
      await promise
    })
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Update' }).hasAttribute('disabled'),
      ).toBe(false),
    )
  })
  it('keeps a hidden observer tab honest until another tab acknowledges pending logout', () => {
    online(false)
    mocks.useSession.mockReturnValue({ data: { user: { id: 'one' } } })
    mount()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    mocks.pending = { id: 'another-tab', mode: 'all' }
    mocks.blocked = true
    act(() => {
      mocks.authListeners.forEach((listener) => listener())
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'pending', newValue: 'pending' }),
      )
    })
    expect(screen.getByText('Sign out pending')).toBeTruthy()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.finishLogout).not.toHaveBeenCalled()
    expect(mocks.reconcile).not.toHaveBeenCalled()
    mocks.pending = null
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'pending', newValue: 'cleared' }),
      )
      mocks.authListeners.forEach((listener) => listener())
    })
    expect(mocks.replace).toHaveBeenCalledOnce()
    expect(screen.queryByText('Sign out pending')).toBeNull()
    expect(mocks.finishLogout).not.toHaveBeenCalled()
    expect(mocks.reconcile).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.applyBadge).not.toHaveBeenCalled()
  })
  it('finishes pending signout before rebind or badge requests and reloads only after acknowledgement', async () => {
    mocks.pending = { id: 'logout-one', mode: 'device' }
    mocks.blocked = true
    mocks.useSession.mockReturnValue({ data: { user: { id: 'one' } } })
    online(false)
    mocks.finishLogout.mockImplementation(() => {
      mocks.pending = null
      return Promise.resolve(true)
    })
    mount()
    expect(screen.getByText('Sign out pending')).toBeTruthy()
    expect(mocks.finishLogout).not.toHaveBeenCalled()
    online(true)
    fireEvent(window, new Event('online'))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce())
    expect(mocks.finishLogout).toHaveBeenCalledWith({
      id: 'logout-one',
      mode: 'device',
    })
    expect(mocks.reconcile).not.toHaveBeenCalled()
    expect(mocks.request).not.toHaveBeenCalled()
    expect(mocks.applyBadge).not.toHaveBeenCalled()
  })
})
