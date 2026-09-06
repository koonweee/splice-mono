import { describe, expect, it } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../api/models'
import { TimePeriod } from './types'
import {
  BalanceCurrencyMismatchError,
  transformToAccountChartData,
  transformToDashboardData,
} from './balance-utils'

// Helper to create mock result
const createMockResult = (date: string, amount: number) => ({
  date,
  balances: {
    acc1: {
      account: {
        id: 'acc1',
        name: 'Test Account',
        type: AccountType.depository,
      },
      effectiveBalance: {
        balance: {
          money: { amount: String(Math.abs(amount) * 100), currency: 'USD' },
          sign:
            amount >= 0
              ? MoneyWithSignSign.positive
              : MoneyWithSignSign.negative,
        },
      },
    },
  },
})

describe('balance-utils transform', () => {
  const mockResults = [
    createMockResult('2023-01-01', 100),
    createMockResult('2023-01-02', 110),
    createMockResult('2023-02-01', 120),
    createMockResult('2023-02-15', 130),
  ]

  describe('transformToDashboardData', () => {
    it('should retain month starts and the latest date for year periods', () => {
      const data = transformToDashboardData(mockResults as any, TimePeriod.year)
      expect(data.chartData).toHaveLength(3)
      expect(data.chartData[0].label).toContain('Jan 1')
      expect(data.chartData[0].date).toBe('2023-01-01')
      expect(data.chartData[1].label).toContain('Feb 1')
      expect(data.chartData[2].date).toBe('2023-02-15')
    })

    it('should not filter dates for month period', () => {
      const data = transformToDashboardData(
        mockResults as any,
        TimePeriod.month,
      )
      expect(data.chartData).toHaveLength(4)
    })

    it('should use account-level latestSyncedAt for account summaries', () => {
      const data = transformToDashboardData(
        [
          {
            date: '2026-06-01',
            balances: {
              acc1: {
                account: {
                  id: 'acc1',
                  name: 'Forward-filled Account',
                  type: AccountType.investment,
                },
                effectiveBalance: {
                  balance: {
                    money: { amount: '10000', currency: 'USD' },
                    sign: MoneyWithSignSign.positive,
                  },
                },
                latestSyncedAt: '2026-05-25T07:06:11.560Z',
              },
            },
          },
        ] as any,
        TimePeriod.month,
      )

      expect(data.assets[0].syncedAt).toBe('2026-05-25T07:06:11.560Z')
    })

    it('carries the account valuation mode into account summaries', () => {
      const result = createMockResult('2026-06-15', 100)
      result.balances.acc1.account = {
        ...result.balances.acc1.account,
        valuationMode: 'holdings',
      } as typeof result.balances.acc1.account

      const data = transformToDashboardData([result] as never, TimePeriod.month)

      expect(data.assets[0].valuationMode).toBe('holdings')
    })

    it('orders assets and liabilities by converted values when present', () => {
      const makeBalance = (amount: number, currency = 'USD') => ({
        money: { amount: String(amount), currency },
        sign: MoneyWithSignSign.positive,
      })
      const data = transformToDashboardData(
        [
          {
            date: '2026-06-15',
            balances: {
              eurAsset: {
                account: {
                  id: 'eurAsset',
                  name: 'EUR asset',
                  type: AccountType.depository,
                },
                effectiveBalance: {
                  balance: makeBalance(100000, 'EUR'),
                  convertedBalance: makeBalance(80000),
                },
              },
              usdAsset: {
                account: {
                  id: 'usdAsset',
                  name: 'USD asset',
                  type: AccountType.depository,
                },
                effectiveBalance: { balance: makeBalance(90000) },
              },
              jpyLiability: {
                account: {
                  id: 'jpyLiability',
                  name: 'JPY liability',
                  type: AccountType.loan,
                },
                effectiveBalance: {
                  balance: makeBalance(10000000, 'JPY'),
                  convertedBalance: makeBalance(50000),
                },
              },
              usdLiability: {
                account: {
                  id: 'usdLiability',
                  name: 'USD liability',
                  type: AccountType.credit,
                },
                effectiveBalance: { balance: makeBalance(60000) },
              },
            },
          },
        ] as any,
        TimePeriod.month,
      )

      expect(data.assets.map((account) => account.id)).toEqual([
        'usdAsset',
        'eurAsset',
      ])
      expect(data.liabilities.map((account) => account.id)).toEqual([
        'usdLiability',
        'jpyLiability',
      ])
    })

    it('fails closed when a non-zero foreign balance is missing conversion', () => {
      const result = {
        date: '2026-06-15',
        balances: {
          usd: {
            account: {
              id: 'usd',
              name: 'USD account',
              type: AccountType.depository,
            },
            effectiveBalance: {
              balance: {
                money: { amount: '10000', currency: 'USD' },
                sign: MoneyWithSignSign.positive,
              },
            },
          },
          eur: {
            account: {
              id: 'eur',
              name: 'EUR account',
              type: AccountType.depository,
            },
            effectiveBalance: {
              balance: {
                money: { amount: '5000', currency: 'EUR' },
                sign: MoneyWithSignSign.positive,
              },
            },
          },
        },
      }

      expect(() =>
        transformToDashboardData([result] as any, TimePeriod.month, 'USD'),
      ).toThrowError(BalanceCurrencyMismatchError)
    })

    it('allows an unconverted foreign zero without changing the reporting unit', () => {
      const result = {
        date: '2026-06-15',
        balances: {
          usd: {
            account: {
              id: 'usd',
              name: 'USD account',
              type: AccountType.depository,
            },
            effectiveBalance: {
              balance: {
                money: { amount: '10000', currency: 'USD' },
                sign: MoneyWithSignSign.positive,
              },
            },
          },
          eurZero: {
            account: {
              id: 'eurZero',
              name: 'Empty EUR account',
              type: AccountType.depository,
            },
            effectiveBalance: {
              balance: {
                money: { amount: '0', currency: 'EUR' },
                sign: MoneyWithSignSign.positive,
              },
            },
          },
        },
      }

      const data = transformToDashboardData(
        [result] as any,
        TimePeriod.month,
        'USD',
      )

      expect(data.netWorth.money).toEqual({ amount: '10000', currency: 'USD' })
      expect(data.chartData[0].value).toBe(100)
    })

    it('uses the API currency for an all-zero series before user settings load', () => {
      const result = {
        date: '2026-06-15',
        balances: {
          eurZero: {
            account: {
              id: 'eurZero',
              name: 'Empty EUR account',
              type: AccountType.depository,
            },
            effectiveBalance: {
              balance: {
                money: { amount: '0', currency: 'EUR' },
                sign: MoneyWithSignSign.positive,
              },
            },
          },
          jpyZero: {
            account: {
              id: 'jpyZero',
              name: 'Empty JPY account',
              type: AccountType.depository,
            },
            effectiveBalance: {
              balance: {
                money: { amount: '0', currency: 'JPY' },
                sign: MoneyWithSignSign.positive,
              },
            },
          },
        },
      }

      const data = transformToDashboardData([result] as any, TimePeriod.month)

      expect(data.netWorth.money).toEqual({ amount: '0', currency: 'EUR' })
      expect(data.changeAmount?.money).toEqual({ amount: '0', currency: 'EUR' })
    })

    it('lets a non-zero balance establish the unit after a foreign zero', () => {
      const result = {
        date: '2026-06-15',
        balances: {
          eurZero: {
            account: {
              id: 'eurZero',
              name: 'Empty EUR account',
              type: AccountType.depository,
            },
            effectiveBalance: {
              balance: {
                money: { amount: '0', currency: 'EUR' },
                sign: MoneyWithSignSign.positive,
              },
            },
          },
          usd: {
            account: {
              id: 'usd',
              name: 'USD account',
              type: AccountType.depository,
            },
            effectiveBalance: {
              balance: {
                money: { amount: '10000', currency: 'USD' },
                sign: MoneyWithSignSign.positive,
              },
            },
          },
        },
      }

      const data = transformToDashboardData([result] as any, TimePeriod.month)

      expect(data.netWorth.money).toEqual({ amount: '10000', currency: 'USD' })
      expect(data.changeAmount?.money).toEqual({
        amount: '0',
        currency: 'USD',
      })
    })

    it('labels a change to an unconverted foreign zero in the non-zero unit', () => {
      const makeResult = (date: string, amount: number, currency: string) => ({
        date,
        balances: {
          account: {
            account: {
              id: 'account',
              name: 'Account',
              type: AccountType.depository,
            },
            effectiveBalance: {
              balance: {
                money: { amount: String(amount), currency },
                sign: MoneyWithSignSign.positive,
              },
            },
          },
        },
      })

      const data = transformToDashboardData(
        [
          makeResult('2026-06-01', 10000, 'USD'),
          makeResult('2026-06-15', 0, 'EUR'),
        ] as any,
        TimePeriod.month,
        'USD',
      )

      expect(data.changeAmount?.money).toEqual({
        amount: '10000',
        currency: 'USD',
      })
      expect(data.assets[0].changeAmount?.money).toEqual({
        amount: '10000',
        currency: 'USD',
      })
    })
  })

  describe('transformToAccountChartData', () => {
    it('should retain month starts and the latest date for year periods', () => {
      const data = transformToAccountChartData(
        mockResults as any,
        'acc1',
        TimePeriod.year,
      )
      expect(data).toHaveLength(3)
      expect(data[0].label).toContain('Jan 1')
      expect(data[0].date).toBe('2023-01-01')
      expect(data[1].label).toContain('Feb 1')
      expect(data[2].date).toBe('2023-02-15')
    })

    it('should not filter dates for month period', () => {
      const data = transformToAccountChartData(
        mockResults as any,
        'acc1',
        TimePeriod.month,
      )
      expect(data).toHaveLength(4)
    })

    it('fails closed when effective history values switch currencies', () => {
      const results = [
        createMockResult('2026-06-01', 100),
        {
          ...createMockResult('2026-06-02', 100),
          balances: {
            acc1: {
              ...createMockResult('2026-06-02', 100).balances.acc1,
              effectiveBalance: {
                balance: {
                  money: { amount: '10000', currency: 'EUR' },
                  sign: MoneyWithSignSign.positive,
                },
              },
            },
          },
        },
      ]

      expect(() =>
        transformToAccountChartData(results as any, 'acc1', TimePeriod.month),
      ).toThrowError(BalanceCurrencyMismatchError)
    })
  })
})
