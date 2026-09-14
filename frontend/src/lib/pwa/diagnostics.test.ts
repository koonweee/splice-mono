import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value)
    }),
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
describe('PWA diagnostic capture', () => {
  it('preserves unfinished operations and a fixed failure snapshot while retry continues', async () => {
    const d = await import('./diagnostics')
    let finish!: () => void
    const operation = d.tracePwa(
      'cache:open',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const snapshot = d.diagnosticSnapshot()
    expect(snapshot.pending[0].event).toBe('cache:open')
    d.preservePwaFailure([], snapshot)
    finish()
    await operation
    d.recordPwaDiagnostic('retry:start')
    const report = JSON.parse(d.exportPwaDiagnostics())
    expect(report.failure.page.pending).toHaveLength(1)
    expect(report.current.pending).toHaveLength(0)
    expect(
      report.failure.page.events.some(
        (e: { event: string }) => e.event === 'retry:start',
      ),
    ).toBe(false)
    vi.resetModules()
    const reloaded = await import('./diagnostics')
    expect(
      JSON.parse(reloaded.exportPwaDiagnostics()).failure.page.pending,
    ).toHaveLength(1)
  })
  it('retains activation milestones after cache traffic replaces the rolling log', async () => {
    const d = await import('./diagnostics')
    d.recordPwaDiagnostic('worker:runtime')
    await d.tracePwa('worker:activate', async () => {
      await d.tracePwa('worker:claim', () => Promise.resolve())
    })
    for (let i = 0; i < 400; i++) d.recordPwaDiagnostic('cache:keys:start')
    const snapshot = d.diagnosticSnapshot()
    expect(
      snapshot.events.every((entry) => entry.event === 'cache:keys:start'),
    ).toBe(true)
    expect(snapshot.milestones.map((entry) => entry.event)).toEqual([
      'worker:runtime',
      'worker:activate:start',
      'worker:claim:start',
      'worker:claim:end',
      'worker:activate:end',
    ])
  })
  it('bounds history and excludes raw exception messages', async () => {
    const d = await import('./diagnostics')
    for (let i = 0; i < 200; i++) d.recordPwaDiagnostic('worker:state')
    await expect(
      d.tracePwa('cache:open', () =>
        Promise.reject(new Error('private secret')),
      ),
    ).rejects.toThrow()
    expect(d.diagnosticSnapshot().events).toHaveLength(160)
    expect(d.exportPwaDiagnostics()).not.toContain('private secret')
  })
  it('exports from memory when persistent storage fails', async () => {
    const d = await import('./diagnostics')
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('unavailable')
    })
    d.preservePwaFailure()
    expect(JSON.parse(d.exportPwaDiagnostics()).failure).toBeTruthy()
    vi.restoreAllMocks()
  })
})
