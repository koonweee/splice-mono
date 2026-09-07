import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  applyAppearance,
  decodeAppearance,
  encodeAppearance,
  previewAppearance,
  readStoredAppearance,
} from './appearance-preferences'
import { DEFAULT_APPEARANCE } from './design-system/appearance'

afterEach(() => vi.unstubAllGlobals())
describe('appearance persistence', () => {
  it('validates bounded encoded input and never interprets legacy names', () => {
    for (const value of [
      'dracula',
      '%',
      'x'.repeat(257),
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
