import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  epoch: 'first',
  listeners: [] as Array<() => void>,
  pending: false,
}))
vi.mock('./home-snapshot', () => ({
  getHomeSnapshotEpoch: () => mocks.epoch,
  readHomeSnapshot: mocks.read,
  subscribeHomeSnapshot: (listener: () => void) => {
    mocks.listeners.push(listener)
  },
}))
vi.mock('./launch-mode', () => ({
  cachedHomeEnabled: true,
  isHomeLaunchUrl: () => true,
}))
vi.mock('./logout-state', () => ({ getPendingLogout: () => mocks.pending }))
beforeEach(() => {
  vi.resetModules()
  mocks.read.mockReset()
  mocks.epoch = 'first'
  mocks.listeners = []
  mocks.pending = false
})
it('shares an early read with every launch consumer and exposes reading separately from missing', async () => {
  let resolve!: (value: null) => void
  mocks.read.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const launch = await import('./home-launch')
  const first = launch.prepareHomeLaunch()
  expect(launch.getHomeLaunch().phase).toBe('reading')
  expect(launch.prepareHomeLaunch()).toBe(first)
  resolve(null)
  await first
  expect(mocks.read).toHaveBeenCalledTimes(1)
  expect(launch.getHomeLaunch().phase).toBe('missing')
})
it('rejects an old pending read after durable invalidation', async () => {
  let resolve!: (value: unknown) => void
  mocks.read.mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const launch = await import('./home-launch')
  const pending = launch.prepareHomeLaunch()
  mocks.epoch = 'second'
  mocks.listeners.forEach((listener) => listener())
  resolve({ authEpoch: 'first' })
  expect(await pending).toBeNull()
  expect(launch.getHomeLaunch().snapshot).toBeNull()
})
it('never starts a read while logout is pending', async () => {
  mocks.pending = true
  const launch = await import('./home-launch')
  expect(await launch.prepareHomeLaunch()).toBeNull()
  expect(mocks.read).not.toHaveBeenCalled()
})
