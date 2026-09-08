import { parseAppearance } from '../design-system/appearance-preference'
import { TimePeriod } from '../types'
import { getPendingLogout } from './logout-state'
import type { AppearancePreference } from '../design-system/appearance'
import type {
  DashboardSeriesResponse,
  DashboardSummaryResponse,
} from '../../api/models'

export type HomeSnapshot = {
  schemaVersion: 1
  identity: string
  authEpoch: string
  savedAt: number
  period: TimePeriod
  endDate: string
  presentation: {
    currency: string
    timezone: string
    appearance: AppearancePreference
    maskBalances: boolean
    hideZeroBalanceAccounts: boolean
  }
  summary: { data: DashboardSummaryResponse; updatedAt: number }
  series: { data: DashboardSeriesResponse; updatedAt: number } | null
}
export type HomeSnapshotInput = Omit<
  HomeSnapshot,
  'schemaVersion' | 'authEpoch'
> & { authEpoch?: string }
export const HOME_SNAPSHOT_MAX_AGE = 7 * 24 * 60 * 60 * 1000
export const HOME_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024
const EPOCH_KEY = 'splice:home-snapshot-epoch'
const IDENTITY_KEY = 'splice:home-snapshot-identity'
const BLOCK_COOKIE = 'splice_snapshot_blocked'
let revision = 0
let blocked = false
const listeners = new Set<() => void>()
export const subscribeHomeSnapshot = (listener: () => void) => {
  listeners.add(listener)
  const changed = (event: StorageEvent) => {
    if ([EPOCH_KEY, IDENTITY_KEY].includes(event.key ?? '')) listener()
  }
  window.addEventListener('storage', changed)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', changed)
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
const only = (value: Record<string, unknown>, keys: string) =>
  Object.keys(value).every((key) => keys.split(' ').includes(key))
const string = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 512
const nullableString = (value: unknown) => value === null || string(value)
const date = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
const currency = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z][A-Z0-9]{1,19}$/.test(value)
const timestamp = (value: unknown, now: number): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= now
const finiteOptional = (value: unknown) =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value))
function money(value: unknown) {
  return (
    record(value) &&
    only(value, 'money sign') &&
    (value.sign === 'positive' || value.sign === 'negative') &&
    record(value.money) &&
    only(value.money, 'amount currency') &&
    currency(value.money.currency) &&
    typeof value.money.amount === 'string' &&
    /^(0|[1-9]\d{0,77})$/.test(value.money.amount)
  )
}
function account(value: unknown) {
  return (
    record(value) &&
    only(
      value,
      'id name customName type subType valuationMode institutionName archivedAt syncedAt effectiveBalance convertedEffectiveBalance changeAmount changePercent',
    ) &&
    string(value.id) &&
    string(value.name) &&
    nullableString(value.customName) &&
    nullableString(value.subType) &&
    nullableString(value.institutionName) &&
    nullableString(value.archivedAt) &&
    nullableString(value.syncedAt) &&
    [
      'investment',
      'credit',
      'depository',
      'loan',
      'brokerage',
      'other',
      'crypto_wallet',
    ].includes(String(value.type)) &&
    ['balance', 'holdings'].includes(String(value.valuationMode)) &&
    money(value.effectiveBalance) &&
    (value.convertedEffectiveBalance === undefined ||
      money(value.convertedEffectiveBalance)) &&
    (value.changeAmount === undefined || money(value.changeAmount)) &&
    finiteOptional(value.changePercent)
  )
}
/** Validate every rendered branch before allowing untrusted persisted JSON into Home. */
export function isHomeSnapshot(
  value: unknown,
  now = Date.now(),
): value is HomeSnapshot {
  try {
    if (
      !record(value) ||
      !only(
        value,
        'schemaVersion identity authEpoch savedAt period endDate presentation summary series',
      ) ||
      value.schemaVersion !== 1 ||
      !string(value.identity) ||
      !string(value.authEpoch) ||
      !timestamp(value.savedAt, now) ||
      now - value.savedAt > HOME_SNAPSHOT_MAX_AGE ||
      !Object.values(TimePeriod).includes(value.period as TimePeriod) ||
      !date(value.endDate)
    )
      return false
    const p = value.presentation
    if (
      !record(p) ||
      !only(
        p,
        'currency timezone appearance maskBalances hideZeroBalanceAccounts',
      ) ||
      !currency(p.currency) ||
      !string(p.timezone) ||
      !parseAppearance(p.appearance) ||
      !record(p.appearance) ||
      !only(p.appearance, 'mode accent monospaceAmounts') ||
      typeof p.maskBalances !== 'boolean' ||
      typeof p.hideZeroBalanceAccounts !== 'boolean'
    )
      return false
    new Intl.DateTimeFormat('en', { timeZone: p.timezone }).format()
    const validResponse = (entry: unknown) =>
      record(entry) &&
      only(entry, 'data updatedAt') &&
      timestamp(entry.updatedAt, value.savedAt as number) &&
      record(entry.data) &&
      entry.data.period === value.period &&
      entry.data.endDate === value.endDate &&
      date(entry.data.startDate) &&
      entry.data.startDate <= (value.endDate as string) &&
      entry.data.reportingCurrency === p.currency &&
      string(entry.data.generatedAt) &&
      Number.isFinite(Date.parse(entry.data.generatedAt))
    if (
      !validResponse(value.summary) ||
      !record(value.summary) ||
      !record(value.summary.data)
    )
      return false
    const summary = value.summary.data
    if (
      !only(
        summary,
        'period startDate endDate reportingCurrency generatedAt netWorth changeAmount changePercent assets liabilities',
      ) ||
      !money(summary.netWorth) ||
      !money(summary.changeAmount) ||
      !finiteOptional(summary.changePercent) ||
      !Array.isArray(summary.assets) ||
      !summary.assets.every(account) ||
      !Array.isArray(summary.liabilities) ||
      !summary.liabilities.every(account)
    )
      return false
    if (value.series !== null) {
      if (
        !validResponse(value.series) ||
        !record(value.series) ||
        !record(value.series.data)
      )
        return false
      const series = value.series.data
      if (
        series.startDate !== summary.startDate ||
        !only(
          series,
          'period startDate endDate reportingCurrency generatedAt points',
        ) ||
        !Array.isArray(series.points) ||
        series.points.length > 122 ||
        !series.points.every(
          (point: unknown) =>
            record(point) &&
            only(point, 'date netWorth') &&
            date(point.date) &&
            money(point.netWorth),
        )
      )
        return false
    }
    return (
      new TextEncoder().encode(JSON.stringify(value)).byteLength <=
      HOME_SNAPSHOT_MAX_BYTES
    )
  } catch {
    return false
  }
}

/** LocalStorage is the synchronous, cross-document eligibility boundary. */
export function getHomeSnapshotEpoch(): string | null {
  if (
    typeof window === 'undefined' ||
    blocked ||
    getPendingLogout() ||
    document.cookie
      .split(';')
      .some((part) => part.trim() === `${BLOCK_COOKIE}=1`)
  )
    return null
  try {
    const stored = window.localStorage.getItem(EPOCH_KEY)
    if (stored) return stored
    const epoch = crypto.randomUUID()
    window.localStorage.setItem(EPOCH_KEY, epoch)
    return window.localStorage.getItem(EPOCH_KEY) === epoch ? epoch : null
  } catch {
    return null
  }
}

/** All operations are bounded, including browsers that never finish opening IDB. */
function operation<T>(
  fallback: T,
  run: (store: IDBObjectStore, complete: (value: T) => void) => void,
  mode: IDBTransactionMode,
): Promise<T> {
  return new Promise((resolve) => {
    let database: IDBDatabase | undefined
    let transaction: IDBTransaction | undefined
    let finished = false
    const finish = (value: T) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      database?.close()
      resolve(value)
    }
    const timer = setTimeout(() => {
      try {
        transaction?.abort()
      } catch {
        /* already completed */
      }
      finish(fallback)
    }, 500)
    try {
      const request = indexedDB.open('splice-home-snapshot', 1)
      request.onupgradeneeded = () =>
        request.result.createObjectStore('snapshot')
      request.onerror = () => finish(fallback)
      request.onblocked = () => finish(fallback)
      request.onsuccess = () => {
        database = request.result
        if (finished) {
          database.close()
          return
        }
        try {
          transaction = database.transaction('snapshot', mode)
          transaction.onerror = () => finish(fallback)
          transaction.onabort = () => finish(fallback)
          let result = fallback
          transaction.oncomplete = () => finish(result)
          run(transaction.objectStore('snapshot'), (value) => {
            result = value
          })
        } catch {
          finish(fallback)
        }
      }
    } catch {
      finish(fallback)
    }
  })
}

export async function readHomeSnapshot(): Promise<HomeSnapshot | null> {
  const epoch = getHomeSnapshotEpoch()
  const expected = revision
  if (!epoch) return null
  const result = await operation<HomeSnapshot | null>(
    null,
    (store, complete) => {
      const request = store.get('home')
      request.onsuccess = () => {
        const value: unknown = request.result
        if (isHomeSnapshot(value) && value.authEpoch === epoch) complete(value)
      }
    },
    'readonly',
  )
  return expected === revision && epoch === getHomeSnapshotEpoch()
    ? result
    : null
}

export async function saveHomeSnapshot(
  input: HomeSnapshotInput,
): Promise<void> {
  const epoch = getHomeSnapshotEpoch()
  const expected = revision
  if (!epoch || (input.authEpoch !== undefined && input.authEpoch !== epoch))
    return
  try {
    if (window.localStorage.getItem(IDENTITY_KEY) !== input.identity) return
  } catch {
    return
  }
  const snapshot = { ...input, schemaVersion: 1, authEpoch: epoch }
  if (!isHomeSnapshot(snapshot)) return
  // Serialize now so caller mutations cannot change a queued write.
  const copy: HomeSnapshot = JSON.parse(JSON.stringify(snapshot))
  await operation(
    undefined,
    (store) => {
      if (expected !== revision || epoch !== getHomeSnapshotEpoch()) return
      const request = store.get('home')
      request.onsuccess = () => {
        if (expected !== revision || epoch !== getHomeSnapshotEpoch()) return
        const previous: unknown = request.result
        if (
          isHomeSnapshot(previous) &&
          previous.authEpoch === epoch &&
          previous.savedAt > copy.savedAt
        )
          return
        store.put(copy, 'home')
      }
    },
    'readwrite',
  )
}

/** Eligibility changes synchronously, before asynchronous data deletion. */
export function clearHomeSnapshot(): Promise<boolean> {
  revision += 1
  if (typeof window === 'undefined') return Promise.resolve(true)
  let durable = false
  try {
    const epoch = crypto.randomUUID()
    window.localStorage.setItem(EPOCH_KEY, epoch)
    durable = window.localStorage.getItem(EPOCH_KEY) === epoch
    if (!durable) throw new Error('Epoch write failed')
    window.localStorage.removeItem(IDENTITY_KEY)
  } catch {
    blocked = true
    // Verify the fallback: browsers can silently reject cookie writes too.
    try {
      document.cookie = `${BLOCK_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=31536000`
      durable =
        durable ||
        document.cookie
          .split(';')
          .some((part) => part.trim() === `${BLOCK_COOKIE}=1`)
    } catch {
      /* Deletion must be acknowledged when no durable marker is available. */
    }
  }
  listeners.forEach((listener) => listener())
  const deletion = operation(
    false,
    (store, complete) => {
      const request = store.delete('home')
      request.onsuccess = () => complete(true)
    },
    'readwrite',
  )
  // A successful epoch/cookie boundary already makes old data ineligible;
  // otherwise only committed deletion can acknowledge local sign-out safety.
  return durable ? Promise.resolve(true) : deletion
}

export function setHomeSnapshotIdentity(identity: string) {
  if (typeof window === 'undefined') return
  try {
    const previous = window.localStorage.getItem(IDENTITY_KEY)
    if (previous && previous !== identity) clearHomeSnapshot()
    window.localStorage.setItem(IDENTITY_KEY, identity)
  } catch {
    clearHomeSnapshot()
  }
}
