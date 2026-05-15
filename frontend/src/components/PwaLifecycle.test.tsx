import { MantineProvider } from '@mantine/core'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaLifecycle } from './PwaLifecycle'
import type { PwaUpdateState } from '../lib/pwa/service-worker'

const mocks = vi.hoisted(() => ({
  registerPwaServiceWorker: vi.fn(),
  isAppBadgeSupported: vi.fn(),
  refreshUncategorizedTransactionBadge: vi.fn(),
  useSession: vi.fn(),
  listeners: new Set<(state: PwaUpdateState) => void>(),
  state: {
    needRefresh: false,
    updateServiceWorker: null,
  } as PwaUpdateState,
}))

vi.mock('../lib/pwa/service-worker', () => ({
  getPwaUpdateState: () => mocks.state,
  registerPwaServiceWorker: mocks.registerPwaServiceWorker,
  subscribeToPwaUpdates: (listener: (state: PwaUpdateState) => void) => {
    mocks.listeners.add(listener)

    return () => {
      mocks.listeners.delete(listener)
    }
  },
}))

vi.mock('../lib/pwa/app-badge', () => ({
  isAppBadgeSupported: mocks.isAppBadgeSupported,
  refreshUncategorizedTransactionBadge:
    mocks.refreshUncategorizedTransactionBadge,
}))

vi.mock('../lib/session', () => ({
  useSession: () => mocks.useSession(),
}))

function renderPwaLifecycle() {
  return render(
    <MantineProvider>
      <PwaLifecycle />
    </MantineProvider>,
  )
}

function setOnlineStatus(isOnline: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    value: isOnline,
    configurable: true,
  })
}

function emitPwaState(state: PwaUpdateState) {
  mocks.state = state
  mocks.listeners.forEach((listener) => {
    listener(state)
  })
}

describe('PwaLifecycle', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      configurable: true,
    })
    setOnlineStatus(true)
    mocks.state = {
      needRefresh: false,
      updateServiceWorker: null,
    }
    mocks.listeners.clear()
    mocks.registerPwaServiceWorker.mockResolvedValue(undefined)
    mocks.isAppBadgeSupported.mockReturnValue(false)
    mocks.refreshUncategorizedTransactionBadge.mockResolvedValue(0)
    mocks.useSession.mockReturnValue({
      data: undefined,
      isPending: false,
      error: null,
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows and clears the offline degraded-state banner', () => {
    renderPwaLifecycle()

    expect(screen.queryByText(/live financial data may not load/i)).toBeNull()

    setOnlineStatus(false)
    fireEvent(window, new Event('offline'))

    expect(screen.getByRole('alert').textContent).toContain(
      'Live financial data may not load',
    )

    setOnlineStatus(true)
    fireEvent(window, new Event('online'))

    expect(screen.queryByText(/live financial data may not load/i)).toBeNull()
  })

  it('shows an update prompt and invokes the update callback', () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined)
    renderPwaLifecycle()

    act(() => {
      emitPwaState({
        needRefresh: true,
        updateServiceWorker,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: /update/i }))

    expect(updateServiceWorker).toHaveBeenCalledTimes(1)
  })

  it('refreshes app badge count for authenticated online users', () => {
    mocks.useSession.mockReturnValue({
      data: { user: { id: 'user-1' } },
      isPending: false,
      error: null,
    })
    mocks.isAppBadgeSupported.mockReturnValue(true)

    renderPwaLifecycle()

    expect(mocks.refreshUncategorizedTransactionBadge).toHaveBeenCalledTimes(1)
  })
})
