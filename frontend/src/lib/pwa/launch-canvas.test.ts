import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BASES } from '../design-system/bases'
import { launchCanvasBootstrap, readLaunchAppearance } from './launch-canvas'

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  })
})
afterEach(() => {
  document.cookie = 'splice_appearance=; Max-Age=0; Path=/'
  localStorage.removeItem('splice:appearance')
  document.documentElement.removeAttribute('style')
  vi.unstubAllGlobals()
})
it.each([false, true])(
  'uses device appearance before local launch when dark=%s',
  (dark) => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: dark })),
    )
    document.cookie = `splice_appearance=${encodeURIComponent(JSON.stringify({ mode: 'auto', accent: null }))}; Path=/`
    const script = launchCanvasBootstrap.match(
      /<script>([\s\S]*)<\/script>/,
    )?.[1]
    if (!script) throw new Error('Missing canvas bootstrap')
    window.eval(script)
    expect(
      document.documentElement.style.getPropertyValue('--splice-launch-canvas'),
    ).toBe(BASES[dark ? 'dark' : 'light'].canvas)
    expect(document.documentElement.style.colorScheme).toBe(
      dark ? 'dark' : 'light',
    )
    expect(readLaunchAppearance()?.mode).toBe('auto')
  },
)
it.each(['light', 'dark', 'oled'] as const)(
  'sets the %s canvas before application rendering',
  (mode) => {
    const value = encodeURIComponent(JSON.stringify({ mode, accent: null }))
    document.cookie = `splice_appearance=${value}; Path=/`
    const script = launchCanvasBootstrap.match(
      /<script>([\s\S]*)<\/script>/,
    )?.[1]
    if (!script) throw new Error('Missing canvas bootstrap')
    window.eval(script)
    expect(
      document.documentElement.style.getPropertyValue('--splice-launch-canvas'),
    ).toBe(BASES[mode].canvas)
    expect(readLaunchAppearance()?.mode).toBe(mode)
  },
)
it('uses valid local appearance when cookies are absent and safely rejects corrupt preferences', () => {
  localStorage.setItem(
    'splice:appearance',
    encodeURIComponent(JSON.stringify({ mode: 'oled', accent: null })),
  )
  expect(readLaunchAppearance()?.mode).toBe('oled')
  localStorage.setItem('splice:appearance', 'broken')
  expect(readLaunchAppearance()).toBeNull()
})
