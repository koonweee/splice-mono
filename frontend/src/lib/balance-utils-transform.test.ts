import { describe, expect, it } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../api/models'
import { TimePeriod } from './types'
import {
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
          money: { amount: amount * 100, currency: 'USD' },
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
    it('should filter dates for year period (only 1st of month)', () => {
      const data = transformToDashboardData(mockResults as any, TimePeriod.year)
      expect(data.chartData).toHaveLength(2)
      expect(data.chartData[0].label).toContain('Jan 1')
      expect(data.chartData[0].date).toBe('2023-01-01')
      expect(data.chartData[1].label).toContain('Feb 1')
    })

    it('should not filter dates for month period', () => {
      const data = transformToDashboardData(
        mockResults as any,
        TimePeriod.month,
      )
      expect(data.chartData).toHaveLength(4)
    })
  })

  describe('transformToAccountChartData', () => {
    it('should filter dates for year period (only 1st of month)', () => {
      const data = transformToAccountChartData(
        mockResults as any,
        'acc1',
        TimePeriod.year,
      )
      expect(data).toHaveLength(2)
      expect(data[0].label).toContain('Jan 1')
      expect(data[0].date).toBe('2023-01-01')
      expect(data[1].label).toContain('Feb 1')
    })

    it('should not filter dates for month period', () => {
      const data = transformToAccountChartData(
        mockResults as any,
        'acc1',
        TimePeriod.month,
      )
      expect(data).toHaveLength(4)
    })
  })
})
