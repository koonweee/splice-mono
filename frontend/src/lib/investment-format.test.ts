import { describe, expect, it } from 'vitest'
import {
  formatInvestmentQuantity,
  formatInvestmentQuote,
  formatInvestmentValue,
} from './investment-format'

describe('investment display formatting', () => {
  it('preserves quote precision while values use currency units', () => {
    const input = { value: '120.123456', currency: 'USD' }

    expect(formatInvestmentQuote(input)).toBe('$120.1235')
    expect(formatInvestmentValue(input)).toBe('$120.12')
    expect(formatInvestmentQuote({ ...input, value: '120.250000000000' })).toBe(
      '$120.25',
    )
  })

  it('keeps fractional fees when requested without treating them as minor units', () => {
    expect(
      formatInvestmentValue({
        value: '1.1234',
        currency: 'EUR',
        preserveFractionalPrecision: true,
      }),
    ).toBe('€1.1234')
    expect(formatInvestmentValue({ value: '120025', currency: 'USD' })).toBe(
      '$120,025.00',
    )
  })

  it('uses native currency precision for values and preserves fractional quotes', () => {
    expect(formatInvestmentValue({ value: '12345', currency: 'JPY' })).toBe(
      '¥12,345',
    )
    expect(formatInvestmentQuote({ value: '12345.125', currency: 'JPY' })).toBe(
      '¥12,345.125',
    )
    expect(
      formatInvestmentValue({ value: '0.01234567', currency: 'BTC' }),
    ).toBe('0.012346')
  })

  it('identifies native currencies in cross-currency holdings', () => {
    expect(
      formatInvestmentQuote({
        value: '7.0512',
        currency: 'SGD',
        showCurrencyCode: true,
      }),
    ).toMatch(/^SGD\s7\.0512$/)
    expect(
      formatInvestmentValue({
        value: '1410',
        currency: 'SGD',
        showCurrencyCode: true,
      }),
    ).toMatch(/^SGD\s1,410\.00$/)
    expect(
      formatInvestmentValue({
        value: '0.01234567',
        currency: 'BTC',
        showCurrencyCode: true,
      }),
    ).toBe('0.012346 (BTC)')
  })

  it('formats fractional share quantities without currency or storage padding', () => {
    expect(formatInvestmentQuantity('97.000000000000')).toBe('97')
    expect(formatInvestmentQuantity('10.1234567')).toBe('10.123457')
  })

  it('preserves missing and invalid provider values', () => {
    for (const format of [formatInvestmentQuote, formatInvestmentValue]) {
      expect(format({ value: null, currency: 'USD' })).toBe('--')
      expect(format({ value: 'not-a-number', currency: 'USD' })).toBe(
        'not-a-number',
      )
    }
    expect(formatInvestmentQuantity(null)).toBe('--')
    expect(formatInvestmentQuantity('not-a-number')).toBe('not-a-number')
  })
})
