import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../api/models'
import { BalanceCurrencyMismatchError } from '../lib/balance-utils'
import { TimePeriod } from '../lib/types'
import { useBalanceData } from './useBalanceData'
import type * as SpliceAPI from '../api/clients/spliceAPI'

const mocks = vi.hoisted(() => ({
  useGetAllBalances: vi.fn(),
}))

vi.mock('../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useBalanceQueryControllerGetAllBalances: mocks.useGetAllBalances,
  }
})

function createResult(currency: string) {
  return [
    {
      date: '2026-06-15',
      balances: {
        account: {
          account: {
            id: 'account',
            name: 'Account',
            type: AccountType.depository,
          },
          effectiveBalance: {
            balance: {
              money: { amount: 10000, currency },
              sign: MoneyWithSignSign.positive,
            },
          },
        },
      },
    },
  ]
}

beforeEach(() => {
  mocks.useGetAllBalances.mockReturnValue({
    data: createResult('EUR'),
    isPending: false,
    error: null,
    refetch: vi.fn(),
  })
})

describe('useBalanceData currency safety', () => {
  it('infers a consistent unit until the user reporting currency is known', () => {
    const { result } = renderHook(() =>
      useBalanceData(TimePeriod.month, undefined),
    )

    expect(result.current.error).toBeUndefined()
    expect(result.current.data?.netWorth.money).toEqual({
      amount: 10000,
      currency: 'EUR',
    })
  })

  it('surfaces a typed error instead of dashboard data when conversion is missing', () => {
    const { result } = renderHook(() => useBalanceData(TimePeriod.month, 'USD'))

    expect(result.current.data).toBeUndefined()
    expect(result.current.error).toBeInstanceOf(BalanceCurrencyMismatchError)
  })
})
