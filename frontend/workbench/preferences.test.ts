import { describe, expect, it } from 'vitest'
import { appearanceFromSearch } from './preferences'

describe('workbench amount font', () => {
  it('carries Auto and distinct Light/Dark accents into the real provider and settings fixtures', () => {
    expect(
      appearanceFromSearch(
        'mode=auto&accent=neutral&lightAccent=%23CE9A7E&darkAccent=neutral',
      ).preference,
    ).toEqual({
      mode: 'auto',
      accent: null,
      accents: { light: '#ce9a7e', dark: null },
    })
  })
  it('passes the comparison control into the same saved appearance shape used by pages', () => {
    expect(
      appearanceFromSearch('mode=oled&accent=neutral&monospace=true')
        .preference,
    ).toEqual({ mode: 'oled', accent: null, monospaceAmounts: true })
    expect(
      appearanceFromSearch('monospace=false').preference.monospaceAmounts,
    ).not.toBe(true)
  })
})
