import { describe, expect, it } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../api/models'
import {
  BalanceCurrencyMismatchError,
  calculateNetWorthForDate,
  createMoneyWithSign,
  getSignedAmount,
  isZeroBalanceAccount,
} from './balance-utils'
import type { AccountBalanceResult } from '../api/models'

describe('balance-utils', () => {
  describe('getSignedAmount', () => {
    it('should return exact decimal amount for USD', () => {
      const amount = getSignedAmount({
        money: { amount: '12345', currency: 'USD' },
        sign: MoneyWithSignSign.positive,
      })
      expect(amount).toBe('123.45')
    })

    it('should return negative amount for negative USD', () => {
      const amount = getSignedAmount({
        money: { amount: '12345', currency: 'USD' },
        sign: MoneyWithSignSign.negative,
      })
      expect(amount).toBe('-123.45')
    })

    it('should return correct amount for ETH', () => {
      // 1.5 ETH
      const amount = getSignedAmount({
        money: { amount: '1500000000000000000', currency: 'ETH' },
        sign: MoneyWithSignSign.positive,
      })
      expect(amount).toBe('1.5')
    })

    it('should return correct amount for BTC', () => {
      // 0.025 BTC
      const amount = getSignedAmount({
        money: { amount: '2500000', currency: 'BTC' },
        sign: MoneyWithSignSign.positive,
      })
      expect(amount).toBe('0.025')
    })
  })

  describe('createMoneyWithSign', () => {
    it('should create correct object for USD', () => {
      const result = createMoneyWithSign('123.45', 'USD')
      expect(result).toEqual({
        money: { amount: '12345', currency: 'USD' },
        sign: MoneyWithSignSign.positive,
      })
    })

    it('should create correct object for negative USD', () => {
      const result = createMoneyWithSign('-123.45', 'USD')
      expect(result).toEqual({
        money: { amount: '12345', currency: 'USD' },
        sign: MoneyWithSignSign.negative,
      })
    })

    it('should create correct object for ETH', () => {
      const result = createMoneyWithSign('1.5', 'ETH')
      expect(result).toEqual({
        money: { amount: '1500000000000000000', currency: 'ETH' },
        sign: MoneyWithSignSign.positive,
      })
    })

    it('should create correct object for BTC', () => {
      const result = createMoneyWithSign('0.025', 'BTC')
      expect(result).toEqual({
        money: { amount: '2500000', currency: 'BTC' },
        sign: MoneyWithSignSign.positive,
      })
    })
  })

  describe('isZeroBalanceAccount', () => {
    it('should return true for a zero effective balance', () => {
      expect(
        isZeroBalanceAccount({
          effectiveBalance: {
            money: { amount: '0', currency: 'USD' },
            sign: MoneyWithSignSign.positive,
          },
        }),
      ).toBe(true)
    })

    it('should return true for a zero converted balance', () => {
      expect(
        isZeroBalanceAccount({
          effectiveBalance: {
            money: { amount: '12345', currency: 'USD' },
            sign: MoneyWithSignSign.positive,
          },
          convertedEffectiveBalance: {
            money: { amount: '0', currency: 'EUR' },
            sign: MoneyWithSignSign.negative,
          },
        }),
      ).toBe(true)
    })

    it('should return false for a non-zero balance', () => {
      expect(
        isZeroBalanceAccount({
          effectiveBalance: {
            money: { amount: '1', currency: 'USD' },
            sign: MoneyWithSignSign.positive,
          },
        }),
      ).toBe(false)
    })
  })

  describe('calculateNetWorthForDate', () => {
    const createAccountBalance = (
      amount: number,
      currency: string,
      type: AccountBalanceResult['account']['type'] = AccountType.depository,
    ): AccountBalanceResult => {
      const balance = {
        money: { amount: String(Math.abs(amount)), currency },
        sign:
          amount < 0 ? MoneyWithSignSign.negative : MoneyWithSignSign.positive,
      }
      return {
        account: {
          id: currency,
          name: `${currency} account`,
          type,
          subType: null,
          valuationMode: 'balance',
          availableBalance: balance,
          currentBalance: balance,
          createdAt: '2026-10-07T00:00:00Z',
          updatedAt: '2026-10-07T00:00:00Z',
          userId: 'user',
        },
        availableBalance: { balance },
        currentBalance: { balance },
        effectiveBalance: { balance },
      }
    }

    it.each([AccountType.credit, AccountType.loan])(
      'subtracts %s debt and adds lender credits',
      (type) => {
        expect(
          calculateNetWorthForDate({
            debt: createAccountBalance(5109, 'SGD', type),
          }),
        ).toBe(-5109n)
        expect(
          calculateNetWorthForDate({
            credit: createAccountBalance(-5109, 'SGD', type),
          }),
        ).toBe(5109n)
        expect(
          calculateNetWorthForDate({
            zero: createAccountBalance(0, 'SGD', type),
          }),
        ).toBe(0n)
      },
    )

    it('preserves negative asset balances', () => {
      expect(
        calculateNetWorthForDate({
          overdraft: createAccountBalance(-5109, 'SGD'),
        }),
      ).toBe(-5109n)
    })

    it('adds a card credit in the reporting currency after conversion', () => {
      const credit = createAccountBalance(-3406, 'USD', AccountType.credit)
      credit.effectiveBalance.convertedBalance = {
        money: { amount: '5109', currency: 'SGD' },
        sign: MoneyWithSignSign.negative,
      }
      expect(calculateNetWorthForDate({ credit }, 'SGD')).toBe(5109n)
    })

    it('includes the S$51.09 card credit in the reported S$524,359.68 net worth', () => {
      expect(
        calculateNetWorthForDate(
          {
            assets: createAccountBalance(52898704, 'SGD'),
            debt: createAccountBalance(467845, 'SGD', AccountType.credit),
            credit: createAccountBalance(-5109, 'SGD', AccountType.credit),
          },
          'SGD',
        ),
      ).toBe(52435968n)
    })

    it('rejects adding balances with different non-zero currencies', () => {
      expect(() =>
        calculateNetWorthForDate(
          {
            usd: createAccountBalance(10000, 'USD'),
            eur: createAccountBalance(5000, 'EUR'),
          },
          'USD',
        ),
      ).toThrowError(BalanceCurrencyMismatchError)
    })

    it('preserves same-currency totals and ignores a foreign zero', () => {
      expect(
        calculateNetWorthForDate(
          {
            usd: createAccountBalance(10000, 'USD'),
            usdTwo: createAccountBalance(2500, 'USD'),
            eurZero: createAccountBalance(0, 'EUR'),
          },
          'USD',
        ),
      ).toBe(12500n)
    })
  })
})
