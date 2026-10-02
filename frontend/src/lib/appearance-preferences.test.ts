import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  appearanceEqual,
  applyAppearance,
  decodeAppearance,
  encodeAppearance,
  previewAppearance,
  readStoredAppearance,
} from './appearance-preferences'
import { DEFAULT_APPEARANCE } from './design-system/appearance'

afterEach(() => vi.unstubAllGlobals())
describe('appearance persistence', () => {
  it('round-trips per-mode accents and detects changes in an inactive mode', () => {
    const value = {
      mode: 'auto' as const,
      accent: '#83b59b',
      accents: { light: '#ce9a7e', dark: null, oled: '#b399cf' },
      monospaceAmounts: true,
    }
    expect(decodeAppearance(encodeAppearance(value))).toEqual(value)
    expect(
      appearanceEqual(value, {
        ...value,
        accents: { ...value.accents, light: '#86aee0' },
      }),
    ).toBe(false)
    expect(
      appearanceEqual(
        { mode: 'dark', accent: null },
        {
          mode: 'dark',
          accent: null,
          accents: { light: null, dark: null, oled: null },
        },
      ),
    ).toBe(true)
  })
  it('round-trips the amount-font choice and treats omitted/false as the same default', () => {
    const value = {
      mode: 'dark' as const,
      accent: null,
      monospaceAmounts: true,
    }
    expect(decodeAppearance(encodeAppearance(value))).toEqual(value)
    expect(appearanceEqual(value, { ...value, monospaceAmounts: false })).toBe(
      false,
    )
    expect(
      appearanceEqual(
        { mode: 'dark', accent: null },
        { ...value, monospaceAmounts: false },
      ),
    ).toBe(true)
    expect(
      decodeAppearance(
        encodeURIComponent(
          JSON.stringify({ ...value, monospaceAmounts: 'yes' }),
        ),
      ),
    ).toBeNull()
  })
  it('validates bounded encoded input and never interprets legacy names', () => {
    for (const value of [
      'dracula',
      '%',
      'x'.repeat(1025),
      encodeURIComponent('{"mode":"oled"}'),
      encodeURIComponent('{"mode":"light","accent":"#fff"}'),
    ])
      expect(decodeAppearance(value)).toBeNull()
    expect(
      decodeAppearance(encodeAppearance({ mode: 'oled', accent: null })),
    ).toEqual({ mode: 'oled', accent: null })
  })
  it('preview dispatches without persisting and save uses only the new key', () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem: () => null, setItem })
    previewAppearance({ mode: 'light', accent: null })
    expect(setItem).not.toHaveBeenCalled()
    applyAppearance({ mode: 'oled', accent: '#ABCDEF' })
    expect(setItem).toHaveBeenCalledExactlyOnceWith(
      APPEARANCE_STORAGE_KEY,
      encodeAppearance({ mode: 'oled', accent: '#abcdef' }),
    )
    expect(document.cookie).toContain('splice_appearance=')
  })
  it('falls back safely if browser storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    })
    expect(readStoredAppearance()).toEqual(DEFAULT_APPEARANCE)
    expect(() => applyAppearance({ mode: 'light', accent: null })).not.toThrow()
  })
})
