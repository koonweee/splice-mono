import { describe, expect, it } from 'vitest'
import { appearanceFromSearch } from './preferences'

describe('workbench amount font', () => {
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
