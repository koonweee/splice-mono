import {
  assertAuthGeneration,
  getAuthGeneration,
  subscribeAuthBoundary,
} from './auth-generation'
import { resolveApiUrl } from './api-base-url'

const REFRESH_LOCK_NAME = 'splice-refresh-token'
const REFRESH_LOCK_STORAGE_KEY = 'splice_refresh_lock'
const REFRESH_SUCCESS_STORAGE_KEY = 'splice_refresh_success_at'
const REFRESH_LOCK_TIMEOUT_MS = 10_000
const REFRESH_LOCK_SETTLE_MS = 50
const REFRESH_BROADCAST_CHANNEL = 'splice-auth-refresh'

type RefreshBroadcastMessage = {
  type: 'success' | 'failure'
  completedAt: number
}

type RefreshStorageLock = {
  owner: string
  expiresAt: number
}

type NavigatorWithLocks = Navigator & {
  locks?: {
    request: <T>(
      name: string,
      options: { mode: 'exclusive' },
      callback: () => Promise<T>,
    ) => Promise<T>
  }
}

let refreshState: { generation: number; promise: Promise<void> } | undefined
let refreshChannel: BroadcastChannel | null = null
let lastRefreshCompletedAt = 0

export class ConfirmedLoggedOutError extends Error {
  constructor(message = 'Session is not authenticated') {
    super(message)
    this.name = 'ConfirmedLoggedOutError'
  }
}

export class TransientAuthError extends Error {
  constructor(message = 'Session could not be refreshed') {
    super(message)
    this.name = 'TransientAuthError'
  }
}

export function isConfirmedLoggedOutError(
  error: unknown,
): error is ConfirmedLoggedOutError {
  return error instanceof ConfirmedLoggedOutError
}

export function isTransientAuthError(
  error: unknown,
): error is TransientAuthError {
  return error instanceof TransientAuthError
}

export function isConfirmedRefreshFailureStatus(status: number): boolean {
  return status === 400 || status === 401 || status === 403
}

export function isTransientRefreshFailureStatus(status: number): boolean {
  return status >= 500
}

export async function refreshSession(): Promise<void> {
  const generation = getAuthGeneration()
  if (refreshState?.generation === generation) return refreshState.promise
  const startedAt = Date.now()
  const controller = new AbortController()
  const unsubscribe = subscribeAuthBoundary(() => {
    if (getAuthGeneration() !== generation) controller.abort()
  })
  let rejectCancelled!: () => void
  const cancelled = new Promise<never>((_resolve, reject) => {
    rejectCancelled = () =>
      reject(new DOMException('Session changed', 'AbortError'))
    controller.signal.addEventListener('abort', rejectCancelled, { once: true })
  })
  const promise = Promise.race([
    withRefreshLock(startedAt, generation, controller.signal),
    cancelled,
  ]).then(() => assertAuthGeneration(generation))
  const state = { generation, promise }
  refreshState = state
  try {
    await promise
  } finally {
    unsubscribe()
    controller.signal.removeEventListener('abort', rejectCancelled)
    if (refreshState === state) refreshState = undefined
  }
}

async function withRefreshLock(
  startedAt: number,
  generation: number,
  signal: AbortSignal,
): Promise<void> {
  if (typeof navigator !== 'undefined') {
    const locks = Reflect.get(navigator, 'locks') as
      | NavigatorWithLocks['locks']
      | undefined
    if (locks !== undefined) {
      return locks.request(
        REFRESH_LOCK_NAME,
        { mode: 'exclusive' },
        async () => {
          assertAuthGeneration(generation)
          if (getLastRefreshCompletedAt() > startedAt) {
            return
          }

          await performRefresh(generation, signal)
        },
      )
    }
  }

  if (typeof window === 'undefined') {
    return performRefresh(generation, signal)
  }

  return withStorageRefreshLock(startedAt, generation, signal)
}

async function withStorageRefreshLock(
  startedAt: number,
  generation: number,
  signal: AbortSignal,
): Promise<void> {
  const lockOwner = await tryAcquireStorageLock()
  if (lockOwner) {
    try {
      assertAuthGeneration(generation)
      if (getLastRefreshCompletedAt() > startedAt) {
        return
      }
      await performRefresh(generation, signal)
      return
    } finally {
      releaseStorageLock(lockOwner)
    }
  }

  const received = await waitForRefreshBroadcast(startedAt)
  assertAuthGeneration(generation)
  if (received === 'success' || getLastRefreshCompletedAt() > startedAt) {
    return
  }

  if (isStorageLockExpired()) {
    return withStorageRefreshLock(startedAt, generation, signal)
  }

  throw new TransientAuthError('Timed out waiting for session refresh')
}

async function performRefresh(
  generation: number,
  signal: AbortSignal,
): Promise<void> {
  try {
    assertAuthGeneration(generation)
    const response = await fetch(resolveApiUrl('/user/refresh'), {
      signal,
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    assertAuthGeneration(generation)
    if (response.ok) {
      lastRefreshCompletedAt = Date.now()
      postRefreshMessage('success')
      return
    }

    if (isConfirmedRefreshFailureStatus(response.status)) {
      postRefreshMessage('failure')
      throw new ConfirmedLoggedOutError()
    }

    postRefreshMessage('failure')
    throw new TransientAuthError(
      `Session refresh failed with status ${response.status}`,
    )
  } catch (error) {
    assertAuthGeneration(generation)
    if (isConfirmedLoggedOutError(error) || isTransientAuthError(error)) {
      throw error
    }

    postRefreshMessage('failure')
    throw new TransientAuthError()
  }
}

async function tryAcquireStorageLock(): Promise<string | null> {
  try {
    if (!isStorageLockExpired()) {
      return null
    }

    const owner = crypto.randomUUID()
    window.localStorage.setItem(
      REFRESH_LOCK_STORAGE_KEY,
      JSON.stringify({
        owner,
        expiresAt: Date.now() + REFRESH_LOCK_TIMEOUT_MS,
      } satisfies RefreshStorageLock),
    )
    await sleep(REFRESH_LOCK_SETTLE_MS)
    return getStorageLockOwner() === owner ? owner : null
  } catch {
    return crypto.randomUUID()
  }
}

function releaseStorageLock(owner: string): void {
  try {
    if (getStorageLockOwner() !== owner) {
      return
    }
    window.localStorage.removeItem(REFRESH_LOCK_STORAGE_KEY)
  } catch {
    // Ignore storage failures; the lock has a short expiry.
  }
}

function isStorageLockExpired(): boolean {
  try {
    const lock = getStorageLock()
    return lock === null || lock.expiresAt <= Date.now()
  } catch {
    return true
  }
}

function getStorageLockOwner(): string | null {
  return getStorageLock()?.owner ?? null
}

function getStorageLock(): RefreshStorageLock | null {
  const rawLock = window.localStorage.getItem(REFRESH_LOCK_STORAGE_KEY)
  if (!rawLock) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(rawLock)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'owner' in parsed &&
      'expiresAt' in parsed &&
      typeof parsed.owner === 'string' &&
      typeof parsed.expiresAt === 'number' &&
      Number.isFinite(parsed.expiresAt)
    ) {
      return {
        owner: parsed.owner,
        expiresAt: parsed.expiresAt,
      }
    }
  } catch {
    return null
  }

  return null
}

function waitForRefreshBroadcast(
  startedAt: number,
): Promise<'success' | 'failure' | 'timeout'> {
  return new Promise((resolve) => {
    const channel = getRefreshChannel()
    const timeout = window.setTimeout(() => {
      channel?.removeEventListener('message', handleMessage)
      resolve('timeout')
    }, REFRESH_LOCK_TIMEOUT_MS)

    function handleMessage(event: MessageEvent<RefreshBroadcastMessage>) {
      if (event.data.completedAt <= startedAt) {
        return
      }

      window.clearTimeout(timeout)
      channel?.removeEventListener('message', handleMessage)
      resolve(event.data.type)
    }

    channel?.addEventListener('message', handleMessage)
  })
}

function postRefreshMessage(type: RefreshBroadcastMessage['type']): void {
  const completedAt = Date.now()
  if (type === 'success') {
    lastRefreshCompletedAt = completedAt
    storeLastRefreshCompletedAt(completedAt)
  }
  getRefreshChannel()?.postMessage({ type, completedAt })
}

function getRefreshChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null
  }

  refreshChannel ??= new BroadcastChannel(REFRESH_BROADCAST_CHANNEL)
  refreshChannel.onmessage = (event: MessageEvent<RefreshBroadcastMessage>) => {
    if (event.data.type === 'success') {
      lastRefreshCompletedAt = Math.max(
        lastRefreshCompletedAt,
        event.data.completedAt,
      )
    }
  }
  return refreshChannel
}

function getLastRefreshCompletedAt(): number {
  try {
    const storedCompletedAt = Number(
      window.localStorage.getItem(REFRESH_SUCCESS_STORAGE_KEY),
    )
    if (Number.isFinite(storedCompletedAt)) {
      lastRefreshCompletedAt = Math.max(
        lastRefreshCompletedAt,
        storedCompletedAt,
      )
    }
  } catch {
    // Storage is an optional cross-tab coordination aid.
  }

  return lastRefreshCompletedAt
}

function storeLastRefreshCompletedAt(completedAt: number): void {
  try {
    window.localStorage.setItem(
      REFRESH_SUCCESS_STORAGE_KEY,
      String(completedAt),
    )
  } catch {
    // Storage is an optional cross-tab coordination aid.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
