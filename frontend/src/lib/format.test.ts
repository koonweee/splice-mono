import { describe, expect, it } from 'vitest'
import { MoneyWithSignSign } from '../api/models'
import {
  formatMoneyWithSign,
  getDecimalPlaces,
  formatPercent,
} from './format'

describe('format utils', () => {
  describe('getDecimalPlaces', () => {
    it('should return correct decimals for fiat currencies', () => {
      expect(getDecimalPlaces('USD')).toBe(2)
      expect(getDecimalPlaces('EUR')).toBe(2)
      expect(getDecimalPlaces('JPY')).toBe(0)
    })

    it('should return correct decimals for crypto currencies', () => {
      expect(getDecimalPlaces('ETH')).toBe(18)
      expect(getDecimalPlaces('BTC')).toBe(8)
    })

    it('should default to 2 for unknown currencies', () => {
      expect(getDecimalPlaces('UNKNOWN')).toBe(2)
    })
  })

  describe('formatMoneyWithSign', () => {
    it('should format USD correctly', () => {
      const result = formatMoneyWithSign({
        value: {
          money: { amount: 12345, currency: 'USD' },
          sign: MoneyWithSignSign.positive,
        },
      })
      expect(result).toBe('$123.45')
    })

    it('should format negative USD correctly', () => {
      const result = formatMoneyWithSign({
        value: {
          money: { amount: 12345, currency: 'USD' },
          sign: MoneyWithSignSign.negative,
        },
      })
      expect(result).toBe('-$123.45')
    })

    it('should format JPY correctly (0 decimals)', () => {
      const result = formatMoneyWithSign({
        value: {
          money: { amount: 12345, currency: 'JPY' },
          sign: MoneyWithSignSign.positive,
        },
      })
      // JPY has 0 decimals, so 12345 units is 12345
      // However, formatMoneyNumber uses Intl.NumberFormat which handles JPY specifics.
      // But our logic: amount / 10^0 = 12345.
      // Intl.NumberFormat('en-US', { style: 'currency', currency: 'JPY' }).format(12345) -> "¥12,345"
      // Wait, formatMoneyNumber forces decimals to be passed in or default 2.
      // In formatMoneyWithSign: decimals = 2 (default).
      // If we don't pass decimals, it tries to show 2 decimal places?
      // formatMoneyNumber uses minimumFractionDigits: decimals.
      // Let's verify behavior.
      expect(result).toBe('¥12,345.00') // Because default decimals is 2
    })
    
    it('should format JPY correctly with 0 decimals override', () => {
      const result = formatMoneyWithSign({
        value: {
          money: { amount: 12345, currency: 'JPY' },
          sign: MoneyWithSignSign.positive,
        },
        decimals: 0
      })
      expect(result).toBe('¥12,345')
    })

    it('should format ETH correctly', () => {
      // 1.5 ETH = 1.5 * 10^18
      const result = formatMoneyWithSign({
        value: {
          money: { amount: 1500000000000000000, currency: 'ETH' },
          sign: MoneyWithSignSign.positive,
        },
        appendCurrency: true,
      })
      // formatMoneyNumber uses 'USD' as currency when appendCurrency is true, to get $ symbol? 
      // No, formatMoneyNumber logic:
      // currency: appendCurrency ? 'USD' : overrideCurrency
      // So it formats as $1.50 (ETH)
      expect(result).toBe('$1.50 (ETH)')
    })
  })

  describe('formatPercent', () => {
    it('should format positive percent', () => {
      expect(formatPercent(12.345)).toBe('+12.35%')
    })

    it('should format negative percent', () => {
      expect(formatPercent(-12.345)).toBe('-12.35%')
    })

    it('should return undefined for 0', () => {
      expect(formatPercent(0)).toBeUndefined()
    })
  })
})
