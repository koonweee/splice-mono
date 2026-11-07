import { describe, expect, it } from 'vitest'
import {
  adjustedAccountBalance,
  hasAccountValueAdjustments,
  parseAccountPercentage,
} from './account-value-adjustments'

describe('account value adjustments', () => {
  it('recognizes identity defaults and normalizes decimal drafts', () => {
    expect(hasAccountValueAdjustments({})).toBe(false)
    expect(
      hasAccountValueAdjustments({
        expectedValuePercent: '100.00',
        expectedTaxPercent: '0.0',
      }),
    ).toBe(false)
    expect(hasAccountValueAdjustments({ expectedValuePercent: '50' })).toBe(
      true,
    )
    expect(parseAccountPercentage('.5')).toBe('0.5')
    expect(parseAccountPercentage('1000.00')).toBe('1000')
    expect(parseAccountPercentage('100', true)).toBe('100')
  })
  it.each(['0', '-1', 'Infinity', '1e2', ''])(
    'rejects invalid value %s',
    (value) => {
      expect(parseAccountPercentage(value)).toBeUndefined()
    },
  )
  it('previews exact values with once-rounded fractions and preserved signs', () => {
    expect(
      adjustedAccountBalance(
        { money: { amount: '10000000', currency: 'USD' }, sign: 'positive' },
        {
          expectedValuePercent: '50',
          expectedTaxPercent: '30',
        },
      ).money.amount,
    ).toBe('3500000')
    expect(
      adjustedAccountBalance(
        { money: { amount: '1', currency: 'JPY' }, sign: 'negative' },
        {
          expectedValuePercent: '50',
          expectedTaxPercent: '50',
        },
      ),
    ).toEqual({ money: { amount: '0', currency: 'JPY' }, sign: 'negative' })
  })
})
