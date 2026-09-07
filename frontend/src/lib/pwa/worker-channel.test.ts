import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  WORKER_CONTROL_STALE_EVENT,
  bindWorkerSession,
  disableWorkerSession,
  sendWorkerBadge,
} from './worker-channel'

const mocks = vi.hoisted(() => ({
  generation: 1,
  blocked: true,
  registration: vi.fn(),
  protocol: vi.fn(),
  pending: { id: 'logout-a' } as { id: string } | null,
  post: vi.fn(),
  enumerate: vi.fn(),
  activePost: vi.fn(),
  notifications: vi.fn(),
  close: vi.fn(),
}))
vi.mock('../auth-generation', () => ({
  getAuthGeneration: () => mocks.generation,
  assertAuthGeneration: vi.fn(),
  isPrivateUiBlocked: () => mocks.blocked,
}))
vi.mock('./logout-state', () => ({ getPendingLogout: () => mocks.pending }))
vi.mock('./service-worker', () => ({
  getServiceWorkerRegistration: mocks.registration,
}))

const registrations = () => [
  {
    active: { postMessage: mocks.activePost },
    getNotifications: mocks.notifications,
  },
]

beforeEach(() => {
  vi.resetAllMocks()
  mocks.generation = 1
  mocks.blocked = true
  vi.stubGlobal(
    'MessageChannel',
    class {
      port1 = {
        onmessage: null as ((event: { data: unknown }) => void) | null,
        close: vi.fn(),
      }
      port2 = {
        postMessage: (data: unknown) =>
          queueMicrotask(() => this.port1.onmessage?.({ data })),
      }
    },
  )
  mocks.pending = { id: 'logout-a' }
  mocks.enumerate.mockResolvedValue(registrations())
  mocks.notifications.mockResolvedValue([{ close: mocks.close }])
  vi.stubGlobal('navigator', {
    serviceWorker: {
      controller: { postMessage: mocks.post },
      getRegistrations: mocks.enumerate,
    },
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('disables the current controller before fast logout acknowledgment can supersede enumeration', async () => {
  let finish!: (value: ReturnType<typeof registrations>) => void
  mocks.enumerate.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  const cleanup = disableWorkerSession()
  expect(mocks.post).toHaveBeenCalledWith({ type: 'PWA_DISABLE' })
  mocks.pending = null
  mocks.generation += 1
  finish(registrations())
  await cleanup
  expect(mocks.activePost).not.toHaveBeenCalled()
  expect(mocks.notifications).not.toHaveBeenCalled()
})

it('still dispatches immediate disable when enumeration rejects', async () => {
  mocks.enumerate.mockRejectedValue(new Error('Unavailable registrations'))
  const cleanup = disableWorkerSession()
  expect(mocks.post).toHaveBeenCalledTimes(1)
  await expect(cleanup).rejects.toThrow('Unavailable registrations')
})

it('bounds stalled enumeration without delaying immediate disable', async () => {
  vi.useFakeTimers()
  mocks.enumerate.mockReturnValue(new Promise(() => {}))
  const cleanup = disableWorkerSession()
  const rejected = expect(cleanup).rejects.toThrow('Device cleanup timed out.')
  expect(mocks.post).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(3_000)
  await rejected
})

it('continues displayed-notification cleanup when both worker posts throw', async () => {
  mocks.post.mockImplementation(() => {
    throw new Error('Controller gone')
  })
  mocks.activePost.mockImplementation(() => {
    throw new Error('Worker gone')
  })
  await disableWorkerSession()
  expect(mocks.activePost).toHaveBeenCalledTimes(1)
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('does no cleanup for an already superseded intent', async () => {
  await disableWorkerSession(() => false)
  expect(mocks.post).not.toHaveBeenCalled()
  expect(mocks.enumerate).not.toHaveBeenCalled()
})

it('does not close a replacement session notification after enumeration began', async () => {
  let finish!: (value: Array<{ close: typeof mocks.close }>) => void
  mocks.notifications.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve
    }),
  )
  let current = true
  const cleanup = disableWorkerSession(() => current)
  await vi.waitFor(() => expect(mocks.notifications).toHaveBeenCalledTimes(1))
  current = false
  finish([{ close: mocks.close }])
  await cleanup
  expect(mocks.close).not.toHaveBeenCalled()
})

type ReplyPort = { postMessage: (data: unknown) => void }
function authenticatedProtocol() {
  mocks.pending = null
  mocks.blocked = false
  mocks.registration.mockResolvedValue({
    active: { postMessage: mocks.protocol },
  })
  let epoch = 0
  mocks.protocol.mockImplementation(
    (message: Record<string, unknown>, ports: Array<ReplyPort>) => {
      if (message.type === 'PWA_SESSION_READY') epoch += 1
      ports[0].postMessage({
        ok: true,
        value: {
          epoch: `epoch-${epoch}`,
          controlScope: 'a'.repeat(64),
          enrollmentId: message.enrollmentId ?? null,
          disabled: false,
        },
      })
    },
  )
}

it('retries only a stale handshake and acquires the new epoch', async () => {
  authenticatedProtocol()
  const normal = mocks.protocol.getMockImplementation()!
  let conflict = true
  mocks.protocol.mockImplementation((data, ports) => {
    if (data.type === 'PWA_SESSION_READY' && conflict) {
      conflict = false
      ports[0].postMessage({ ok: false, code: 'stale_epoch' })
    } else normal(data, ports)
  })
  expect((await bindWorkerSession(null)).epoch).toBe('epoch-1')
  expect(mocks.protocol.mock.calls.map(([data]) => data.type)).toEqual([
    'PWA_CONTROL_GET',
    'PWA_SESSION_READY',
    'PWA_CONTROL_GET',
    'PWA_SESSION_READY',
  ])
})

it('does not let a late earlier handshake overwrite a newer local binding', async () => {
  authenticatedProtocol()
  const normal = mocks.protocol.getMockImplementation()!
  let early!: ReplyPort
  mocks.protocol.mockImplementation((data, ports) => {
    if (data.type === 'PWA_SESSION_READY' && data.enrollmentId === 'first')
      early = ports[0]
    else normal(data, ports)
  })
  const first = bindWorkerSession('first')
  const superseded = expect(first).rejects.toThrow('superseded')
  await vi.waitFor(() => expect(early).toBeDefined())
  const latest = await bindWorkerSession('second')
  early.postMessage({
    ok: true,
    value: { epoch: 'old-epoch', enrollmentId: 'first', disabled: false },
  })
  await superseded
  await sendWorkerBadge(2, '2026-09-07T12:00:00.000Z')
  expect(mocks.protocol).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'PWA_BADGE', epoch: latest.epoch }),
    expect.any(Array),
  )
})

it('signals fresh reconciliation without replaying a stale badge count', async () => {
  authenticatedProtocol()
  await bindWorkerSession(null)
  mocks.protocol.mockClear()
  mocks.protocol.mockImplementation((_data, ports) =>
    ports[0].postMessage({ ok: false, code: 'stale_epoch' }),
  )
  const recover = vi.fn()
  window.addEventListener(WORKER_CONTROL_STALE_EVENT, recover)
  try {
    await expect(
      sendWorkerBadge(99, '2026-09-07T12:00:00.000Z'),
    ).rejects.toThrow('Device state changed')
    await sendWorkerBadge(99, '2026-09-07T12:00:00.000Z')
    expect(mocks.protocol).toHaveBeenCalledTimes(1)
    expect(recover).toHaveBeenCalledTimes(1)
  } finally {
    window.removeEventListener(WORKER_CONTROL_STALE_EVENT, recover)
  }
})

it('does not invalidate a newer binding when an earlier badge rejection arrives late', async () => {
  authenticatedProtocol()
  await bindWorkerSession(null)
  const normal = mocks.protocol.getMockImplementation()!
  let early!: ReplyPort
  mocks.protocol.mockImplementation((data, ports) => {
    if (data.type === 'PWA_BADGE' && data.count === 99) early = ports[0]
    else normal(data, ports)
  })
  const sending = sendWorkerBadge(99, '2026-09-07T12:00:00.000Z')
  const stale = expect(sending).rejects.toThrow('Device state changed')
  await vi.waitFor(() => expect(early).toBeDefined())
  const latest = await bindWorkerSession(null)
  early.postMessage({ ok: false, code: 'stale_epoch' })
  await stale
  await sendWorkerBadge(2, '2026-09-07T12:01:00.000Z')
  expect(mocks.protocol).toHaveBeenLastCalledWith(
    expect.objectContaining({ type: 'PWA_BADGE', epoch: latest.epoch }),
    expect.any(Array),
  )
})

it('rejects a legacy worker that replies without a verified owner scope', async () => {
  authenticatedProtocol()
  mocks.protocol.mockImplementation((_data, ports) =>
    ports[0].postMessage({
      ok: true,
      value: { epoch: 'old', enrollmentId: null, disabled: false },
    }),
  )
  await expect(bindWorkerSession(null)).rejects.toThrow(
    'has not verified this session',
  )
})
it('does not retry a null-enrollment handshake across an owner scope change', async () => {
  authenticatedProtocol()
  let gets = 0
  mocks.protocol.mockImplementation((data, ports) => {
    if (data.type === 'PWA_CONTROL_GET') {
      gets++
      ports[0].postMessage({
        ok: true,
        value: {
          epoch: `epoch-${gets}`,
          controlScope: (gets === 1 ? 'a' : 'b').repeat(64),
          enrollmentId: null,
          disabled: false,
        },
      })
    } else ports[0].postMessage({ ok: false, code: 'stale_epoch' })
  })
  await expect(bindWorkerSession(null)).rejects.toThrow(
    'Device enrollment changed',
  )
  expect(
    mocks.protocol.mock.calls.filter(
      ([data]) => data.type === 'PWA_SESSION_READY',
    ),
  ).toHaveLength(1)
})

it('allows the bounded READY verification to finish after the ordinary message deadline', async () => {
  vi.useFakeTimers()
  authenticatedProtocol()
  const normal = mocks.protocol.getMockImplementation()!
  mocks.protocol.mockImplementation((data, ports) => {
    if (data.type === 'PWA_SESSION_READY')
      setTimeout(() => normal(data, ports), 5_000)
    else normal(data, ports)
  })
  const binding = bindWorkerSession(null)
  await vi.advanceTimersByTimeAsync(5_000)
  expect((await binding).controlScope).toBe('a'.repeat(64))
})

it('allows disabled-state lookup to finish bounded native cleanup before replying', async () => {
  vi.useFakeTimers()
  authenticatedProtocol()
  const normal = mocks.protocol.getMockImplementation()!
  mocks.protocol.mockImplementation((data, ports) => {
    if (data.type === 'PWA_CONTROL_GET') setTimeout(() => normal(data, ports), 4_000)
    else normal(data, ports)
  })
  const binding = bindWorkerSession(null)
  await vi.advanceTimersByTimeAsync(4_000)
  expect((await binding).controlScope).toBe('a'.repeat(64))
})
