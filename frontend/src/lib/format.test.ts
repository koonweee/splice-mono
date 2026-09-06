import { describe, expect, it } from 'vitest'
import { MoneyWithSignSign } from '../api/models'
import {
  formatAccountType,
  formatCalendarDate,
  formatDateTime,
  formatMoneyNumber,
  formatMoneyWithSign,
  formatPercent,
  getDecimalPlaces,
} from './format'

describe('format utils', () => {
  describe('formatCalendarDate', () => {
    it('keeps calendar dates independent of the device time zone', () => {
      expect(formatCalendarDate('2026-05-20')).toBe('May 20, 2026')
      expect(formatCalendarDate('2024-02-29')).toBe('Feb 29, 2024')
    })

    it('does not reinterpret invalid dates or timestamps as calendar dates', () => {
      expect(formatCalendarDate('2026-02-29')).toBe('2026-02-29')
      expect(formatCalendarDate('2026-13-01')).toBe('2026-13-01')
      expect(formatCalendarDate('2026-05-20T00:00:00Z')).toBe(
        '2026-05-20T00:00:00Z',
      )
      expect(formatCalendarDate('not-a-date')).toBe('not-a-date')
    })
  })

  describe('formatDateTime', () => {
    it('pretty formats date-only values without a timezone shift', () => {
      expect(formatDateTime('2026-05-20')).toBe('May 20, 2026')
    })

    it('pretty formats timestamps and preserves invalid provider values', () => {
      expect(formatDateTime('2026-05-20T14:35:00')).toBe(
        'May 20, 2026, 2:35 PM',
      )
      expect(formatDateTime('not-a-date')).toBe('not-a-date')
    })

    it('retains real midnight timestamps as local date and time', () => {
      expect(formatDateTime('2026-05-20T00:00:00')).toBe(
        'May 20, 2026, 12:00 AM',
      )
    })
  })

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
          money: { amount: '12345', currency: 'USD' },
          sign: MoneyWithSignSign.positive,
        },
      })
      expect(result).toBe('$123.45')
    })

    it('should format negative USD correctly', () => {
      const result = formatMoneyWithSign({
        value: {
          money: { amount: '12345', currency: 'USD' },
          sign: MoneyWithSignSign.negative,
        },
      })
      expect(result).toBe('-$123.45')
    })

    it('should format JPY correctly (0 decimals)', () => {
      const result = formatMoneyWithSign({
        value: {
          money: { amount: '12345', currency: 'JPY' },
          sign: MoneyWithSignSign.positive,
        },
      })
      expect(result).toBe('¥12,345')
    })

    it('should format JPY correctly with 0 decimals override', () => {
      const result = formatMoneyWithSign({
        value: {
          money: { amount: '12345', currency: 'JPY' },
          sign: MoneyWithSignSign.positive,
        },
        decimals: 0,
      })
      expect(result).toBe('¥12,345')
    })

    it('should format BTC correctly without currency symbol', () => {
      // 0.01234567 BTC = 1234567 satoshis
      const result = formatMoneyWithSign({
        value: {
          money: { amount: '1234567', currency: 'BTC' },
          sign: MoneyWithSignSign.positive,
        },
      })
      // BTC should format without the $ symbol and with max 6 decimal places (rounded)
      expect(result).toBe('0.012346')
    })

    it('should format ETH correctly', () => {
      // 1.5 ETH = 1.5 * 10^18
      const result = formatMoneyWithSign({
        value: {
          money: { amount: '1500000000000000000', currency: 'ETH' },
          sign: MoneyWithSignSign.positive,
        },
        appendCurrency: true,
      })
      // Crypto currencies should format without the $ symbol and with max 6 decimal places
      expect(result).toBe('1.500000 (ETH)')
    })

    it('should format BTC with appendCurrency correctly', () => {
      const result = formatMoneyWithSign({
        value: {
          money: { amount: '123456789', currency: 'BTC' }, // 123456789 satoshis = 1.23456789 BTC
          sign: MoneyWithSignSign.positive,
        },
        appendCurrency: true,
      })
      // BTC should format without $ symbol and with max 6 decimal places with currency appended (rounded)
      expect(result).toBe('1.234568 (BTC)')
    })

    it('should format zero-decimal fiat currencies without fake cents', () => {
      const result = formatMoneyNumber({
        value: 12345,
        currency: 'JPY',
      })

      expect(result).toBe('¥12,345')
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

  describe('formatAccountType', () => {
    it('should format crypto wallet type correctly', () => {
      expect(formatAccountType('crypto_wallet')).toBe('Crypto wallet')
    })

    it('should format crypto exchange subType correctly', () => {
      expect(formatAccountType('crypto exchange')).toBe('Crypto exchange')
    })

    it('should format non-custodial wallet subType correctly', () => {
      expect(formatAccountType('non-custodial wallet')).toBe(
        'Non-custodial wallet',
      )
    })

    it('should handle regular account types with default formatting', () => {
      expect(formatAccountType('checking')).toBe('Checking')
      expect(formatAccountType('savings')).toBe('Savings')
      expect(formatAccountType('home equity')).toBe('Home equity') // API model has space, not underscore
    })

    it('should handle undefined and null values', () => {
      expect(formatAccountType(undefined)).toBe('')
      expect(formatAccountType(null)).toBe('')
    })

    it('should format unknown types with capitalized first letter and spaces', () => {
      expect(formatAccountType('unknown_type')).toBe('Unknown type')
      expect(formatAccountType('another_cool_type')).toBe('Another cool type')
    })
  })
})
