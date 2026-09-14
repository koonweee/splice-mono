/** Bounded, public lifecycle metadata only. Never pass request bodies or user data. */
type Detail = Record<string, string | number | boolean | null>
type Entry = { at: number; event: string; detail: Detail }
const events: Array<Entry> = []
// Fixed lifecycle keys survive high-volume cache traffic; repeated stages replace
// only their own timestamp, keeping this bounded for long-running workers.
const milestones = new Map<string, Entry>()
const milestoneNames = new Set([
  'worker:runtime',
  'worker:install:start',
  'worker:install:end',
  'worker:install:error',
  'worker:activate:start',
  'worker:activate:end',
  'worker:activate:error',
  'worker:activate-cache:start',
  'worker:activate-cache:end',
  'worker:activate-cache:error',
  'worker:claim:start',
  'worker:claim:end',
  'worker:claim:error',
])
const pending = new Map<number, Entry>()
let sequence = 0
const key = 'splice-pwa-diagnostics-v1'
let failure: unknown
export function recordPwaDiagnostic(event: string, detail: Detail = {}) {
  const entry = { at: Date.now(), event, detail }
  events.push(entry)
  if (milestoneNames.has(event)) milestones.set(event, entry)
  if (events.length > 160) events.shift()
}
export function diagnosticSnapshot() {
  return {
    build:
      typeof __SPLICE_BUILD_ID__ === 'string'
        ? __SPLICE_BUILD_ID__
        : 'development',
    events: [...events],
    milestones: [...milestones.values()],
    pending: [...pending.values()],
  }
}
export async function tracePwa<T>(
  event: string,
  action: () => Promise<T>,
  detail: Detail = {},
): Promise<T> {
  const id = ++sequence
  const started = Date.now()
  if (pending.size < 64) pending.set(id, { at: started, event, detail })
  recordPwaDiagnostic(`${event}:start`, { ...detail, id })
  try {
    const result = await action()
    recordPwaDiagnostic(`${event}:end`, { id, elapsed: Date.now() - started })
    return result
  } catch (cause) {
    recordPwaDiagnostic(`${event}:error`, {
      id,
      elapsed: Date.now() - started,
      // Error messages can contain URLs or private payloads; retain only class.
      kind: cause instanceof Error ? cause.name : 'unknown',
    })
    throw cause
  } finally {
    pending.delete(id)
  }
}
export function preservePwaFailure(
  workers: unknown = [],
  page = diagnosticSnapshot(),
) {
  failure = { at: Date.now(), page, workers }
  try {
    localStorage.setItem(key, JSON.stringify(failure))
  } catch {
    /* Diagnostics must work even when storage fails. */
  }
}
export function exportPwaDiagnostics() {
  let saved = failure
  try {
    saved ??= JSON.parse(localStorage.getItem(key) ?? 'null')
  } catch {
    /* Use memory. */
  }
  return JSON.stringify(
    {
      version: 1,
      failure: saved,
      current: diagnosticSnapshot(),
      environment:
        typeof navigator === 'undefined'
          ? null
          : {
              userAgent: navigator.userAgent,
              online: navigator.onLine,
              visibility: document.visibilityState,
              standalone: window.matchMedia('(display-mode: standalone)')
                .matches,
            },
    },
    null,
    2,
  )
}
