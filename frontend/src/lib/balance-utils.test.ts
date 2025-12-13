import { describe, expect, it } from 'vitest'
import { MoneyWithSignSign } from '../api/models'
import { createMoneyWithSign, getSignedAmount } from './balance-utils'

describe('balance-utils', () => {
  describe('getSignedAmount', () => {
    it('should return correct float amount for USD', () => {
      const amount = getSignedAmount({
        money: { amount: 12345, currency: 'USD' },
        sign: MoneyWithSignSign.positive,
      })
      expect(amount).toBe(123.45)
    })

    it('should return negative amount for negative USD', () => {
      const amount = getSignedAmount({
        money: { amount: 12345, currency: 'USD' },
        sign: MoneyWithSignSign.negative,
      })
      expect(amount).toBe(-123.45)
    })

    it('should return correct amount for ETH', () => {
      // 1.5 ETH
      const amount = getSignedAmount({
        money: { amount: 1500000000000000000, currency: 'ETH' },
        sign: MoneyWithSignSign.positive,
      })
      expect(amount).toBe(1.5)
    })

    it('should return correct amount for BTC', () => {
      // 0.025 BTC
      const amount = getSignedAmount({
        money: { amount: 2500000, currency: 'BTC' },
        sign: MoneyWithSignSign.positive,
      })
      expect(amount).toBe(0.025)
    })
  })

  describe('createMoneyWithSign', () => {
    it('should create correct object for USD', () => {
      const result = createMoneyWithSign(123.45, 'USD')
      expect(result).toEqual({
        money: { amount: 12345, currency: 'USD' },
        sign: MoneyWithSignSign.positive,
      })
    })

    it('should create correct object for negative USD', () => {
      const result = createMoneyWithSign(-123.45, 'USD')
      expect(result).toEqual({
        money: { amount: 12345, currency: 'USD' },
        sign: MoneyWithSignSign.negative,
      })
    })

    it('should create correct object for ETH', () => {
      const result = createMoneyWithSign(1.5, 'ETH')
      expect(result).toEqual({
        money: { amount: 1500000000000000000, currency: 'ETH' },
        sign: MoneyWithSignSign.positive,
      })
    })

    it('should create correct object for BTC', () => {
      const result = createMoneyWithSign(0.025, 'BTC')
      expect(result).toEqual({
        money: { amount: 2500000, currency: 'BTC' },
        sign: MoneyWithSignSign.positive,
      })
    })
  })
})
