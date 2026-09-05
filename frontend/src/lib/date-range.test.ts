import { describe, expect, it } from 'vitest'
import { formatDateRangeLabel } from './date-range'

describe('formatDateRangeLabel', () => {
  it('keeps both endpoints and the year in compact ranges', () => {
    expect(formatDateRangeLabel(['2026-08-01', '2026-08-31'])).toBe(
      'Aug 1–31, 2026',
    )
    expect(formatDateRangeLabel(['2026-07-15', '2026-08-31'])).toBe(
      'Jul 15–Aug 31, 2026',
    )
    expect(formatDateRangeLabel(['2025-12-15', '2026-01-10'])).toBe(
      'Dec 15, 2025–Jan 10, 2026',
    )
  })

  it('distinguishes a single day, partial range, and no date filter', () => {
    expect(formatDateRangeLabel(['2026-08-01', '2026-08-01'])).toBe(
      'Aug 1, 2026',
    )
    expect(formatDateRangeLabel(['2026-08-01', null])).toBe('From Aug 1, 2026')
    expect(formatDateRangeLabel([null, '2026-08-31'])).toBe(
      'Until Aug 31, 2026',
    )
    expect(formatDateRangeLabel([null, null])).toBe('All dates')
  })
})
