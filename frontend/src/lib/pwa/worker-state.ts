export type StoredWorkerControl = {
  epoch: string
  controlScope: string | null
  enrollmentId: string | null
  disabled: boolean
  lastBadgeAsOf: string | null
}
export function validWorkerControlScope(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

const DATABASE = 'splice-pwa-control-v1'
let queue: Promise<unknown> = Promise.resolve()

export function serializeWorkerState<T>(action: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> =>
    typeof navigator.locks?.request === 'function'
      ? await navigator.locks.request('splice-pwa-control', action)
      : await action()
  const result = queue.then(run, run)
  queue = result.catch(() => undefined)
  return result
}

/** Only opaque control metadata is durable; never notification text or counts. */
export async function changeWorkerControl(
  change: (current: StoredWorkerControl) => StoredWorkerControl = (current) =>
    current,
): Promise<StoredWorkerControl> {
  return new Promise((resolve, reject) => {
    let timedOut = false
    let database: IDBDatabase | undefined
    const timer = setTimeout(() => {
      timedOut = true
      database?.close()
      reject(new Error('Device state storage timed out.'))
    }, 3_000)
    const open = indexedDB.open(DATABASE, 1)
    open.onupgradeneeded = () => open.result.createObjectStore('control')
    open.onerror = () => {
      clearTimeout(timer)
      reject(new Error('Device state storage unavailable.'))
    }
    open.onsuccess = () => {
      database = open.result
      if (timedOut) {
        database.close()
        return
      }
      const transaction = database.transaction('control', 'readwrite')
      const store = transaction.objectStore('control')
      const read = store.get('current')
      let value: StoredWorkerControl
      read.onsuccess = () => {
        const previous = read.result as StoredWorkerControl | undefined
        const persistedScope: unknown = previous?.controlScope
        const usable = previous && (validWorkerControlScope(persistedScope) || (persistedScope === null && previous.disabled))
        value = change(
          usable
            ? previous
            : {
                epoch: crypto.randomUUID(),
                controlScope: null,
                enrollmentId: null,
                disabled: true,
                lastBadgeAsOf: null,
              },
        )
        store.put(value, 'current')
      }
      transaction.oncomplete = () => {
        clearTimeout(timer)
        database?.close()
        resolve(value)
      }
      transaction.onabort = transaction.onerror = () => {
        clearTimeout(timer)
        database?.close()
        reject(new Error('Device state could not be saved.'))
      }
    }
  })
}

export function validBadgeSnapshot(
  count: unknown,
  timestamp: unknown,
): count is number {
  return (
    typeof count === 'number' &&
    Number.isSafeInteger(count) &&
    count >= 0 &&
    typeof timestamp === 'string' &&
    Number.isFinite(Date.parse(timestamp))
  )
}

export function acceptsBadgeSnapshot(
  current: StoredWorkerControl,
  timestamp: string,
) {
  // Equal snapshots never overwrite each other; foreground reconciliation will
  // supply a newer timestamp. ISO UTC timestamps retain database precision.
  return !current.lastBadgeAsOf || timestamp > current.lastBadgeAsOf
}

export function safeNotificationDestination(
  candidate: unknown,
  origin: string,
): string | null {
  if (typeof candidate !== 'string' || candidate.includes('\\')) return null
  try {
    const target = new URL(candidate, origin)
    if (
      target.origin !== origin ||
      !['/transactions', '/accounts'].includes(target.pathname)
    )
      return null
    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return null
  }
}
