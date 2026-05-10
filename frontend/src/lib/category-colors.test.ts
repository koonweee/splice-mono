import { describe, expect, it } from 'vitest'
import {
  generateCategoryColor,
  getCategoryColorStyles,
  getContrastRatio,
  getDisplayCategoryColor,
  getReadableTextColor,
  normalizeHexColor,
} from './category-colors'

describe('category color helpers', () => {
  it('normalizes valid hex colors and rejects invalid colors', () => {
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc')
    expect(normalizeHexColor(' #A1B2C3 ')).toBe('#a1b2c3')
    expect(normalizeHexColor('red')).toBeNull()
    expect(normalizeHexColor('#12')).toBeNull()
  })

  it('chooses readable black or white text for arbitrary backgrounds', () => {
    expect(getReadableTextColor('#ffffff')).toBe('#000000')
    expect(getReadableTextColor('#000000')).toBe('#ffffff')
    expect(getContrastRatio('#ffffff', '#000000')).toBeCloseTo(21)
  })

  it('returns stable fallback colors for invalid or missing values', () => {
    expect(getDisplayCategoryColor(null, 'UNCATEGORIZED')).toBe('#868e96')
    expect(getDisplayCategoryColor('nope', 'BALANCE_ADJUSTMENT')).toBe(
      '#4c6ef5',
    )
  })

  it('builds contrast-aware styles and generated colors', () => {
    expect(getCategoryColorStyles('#fff').color).toBe('#000000')
    expect(getCategoryColorStyles('#111').color).toBe('#ffffff')
    expect(generateCategoryColor()).toMatch(/^#[0-9a-f]{6}$/)
  })
})
