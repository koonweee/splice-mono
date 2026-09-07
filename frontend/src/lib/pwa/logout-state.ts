export const PENDING_LOGOUT_KEY = 'splice:pending-logout'
export const PENDING_LOGOUT_COOKIE = 'splice_logout_pending'
export type PendingLogout = {
  id: string
  mode: 'device' | 'all'
  issuedAt?: number
}
type LogoutRecord = Omit<PendingLogout, 'mode'> & {
  mode: PendingLogout['mode'] | 'cleared'
}
function latestRecord(): LogoutRecord | null {
  if (typeof window === 'undefined') return null
  let stored: LogoutRecord | null = null
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem(PENDING_LOGOUT_KEY) ?? 'null',
    )
    if (
      value &&
      typeof value === 'object' &&
      'id' in value &&
      typeof value.id === 'string' &&
      'mode' in value &&
      ['device', 'all', 'cleared'].includes(String(value.mode))
    ) {
      const issuedAt = 'issuedAt' in value ? value.issuedAt : undefined
      stored = {
        id: value.id,
        mode: value.mode as LogoutRecord['mode'],
        ...(typeof issuedAt === 'number' &&
        Number.isSafeInteger(issuedAt) &&
        issuedAt >= 0 &&
        issuedAt < Number.MAX_SAFE_INTEGER - 1
          ? { issuedAt }
          : {}),
      }
    }
  } catch {
    /* Cookie remains a fail-closed fallback. */
  }
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PENDING_LOGOUT_COOKIE}=`))
  if (!cookie) return stored
  const [mode, id, issuedAt] = cookie.slice(cookie.indexOf('=') + 1).split('.')
  let record: LogoutRecord | null = null
  if (
    ['device', 'all', 'cleared'].includes(mode) &&
    id &&
    /^[a-f0-9-]{36}$/i.test(id)
  ) {
    record = {
      id,
      mode: mode as LogoutRecord['mode'],
      ...(issuedAt &&
      /^\d{1,16}$/.test(issuedAt) &&
      Number.isSafeInteger(Number(issuedAt)) &&
      Number(issuedAt) < Number.MAX_SAFE_INTEGER - 1
        ? { issuedAt: Number(issuedAt) }
        : {}),
    }
  } else if (['1', 'device', 'all'].includes(mode)) {
    record = { id: `legacy-${mode}`, mode: mode === 'all' ? 'all' : 'device' }
  }
  // Timestamped records reconcile readable-but-unwritable storage with cookies.
  // A durable acknowledgement tombstone prevents a failed remove from reviving
  // an already completed logout on the next page load.
  return record && (!stored || (record.issuedAt ?? 0) >= (stored.issuedAt ?? 0))
    ? record
    : stored
}
export function getPendingLogout(): PendingLogout | null {
  const record = latestRecord()
  return record && record.mode !== 'cleared'
    ? { ...record, mode: record.mode }
    : null
}
function writeRecord(record: LogoutRecord) {
  try {
    window.localStorage.setItem(PENDING_LOGOUT_KEY, JSON.stringify(record))
  } catch {
    /* Keep cookie privacy boundary. */
  }
  document.cookie = `${PENDING_LOGOUT_COOKIE}=${record.mode}.${record.id}.${record.issuedAt}; Path=/; SameSite=Lax; Max-Age=2592000${location.protocol === 'https:' ? '; Secure' : ''}`
}
export function setPendingLogout(mode: PendingLogout['mode']): PendingLogout {
  const pending = {
    id: crypto.randomUUID(),
    mode,
    issuedAt: Math.max(Date.now(), (latestRecord()?.issuedAt ?? 0) + 1),
  }
  writeRecord(pending)
  return pending
}
export function clearPendingLogout(expectedId?: string) {
  if (typeof window === 'undefined') return
  const current = latestRecord()
  if (expectedId && (current?.id !== expectedId || current.mode === 'cleared'))
    return
  writeRecord({
    id: crypto.randomUUID(),
    mode: 'cleared',
    issuedAt: Math.max(Date.now(), (current?.issuedAt ?? 0) + 1),
  })
}
