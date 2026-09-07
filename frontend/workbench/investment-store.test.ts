import { describe, expect, it } from 'vitest'
import { createFixtureApi } from './fixture-api'
import { money } from './fixtures'
import type {
  Account,
  ManualBrokeragePortfolioResponse,
} from '../src/api/models'

const draft = {
  name: 'Fixture portfolio',
  accountCurrency: 'USD',
  positions: [{ symbol: 'EXM', quantity: '2' }],
}

describe('investment workbench fixtures', () => {
  it('registers newly created balance accounts for detail and empty investment reads', async () => {
    const api = createFixtureApi()
    const account = await api<Account>({
      url: '/account',
      method: 'POST',
      data: {
        name: 'New cash',
        type: 'depository',
        subType: 'checking',
        currentBalance: money('200'),
        availableBalance: money('200'),
      },
    })
    expect(await api({ url: `/account/${account.id}` })).toMatchObject({
      name: 'New cash',
      currentBalance: money('200'),
    })
    expect(
      await api({ url: `/investment/account/${account.id}/holdings/latest` }),
    ).toMatchObject({ holdings: [] })
  })
  it('creates, replaces and refreshes fixed quotes with reconciled balances', async () => {
    const api = createFixtureApi()
    const created = await api<ManualBrokeragePortfolioResponse>({
      url: '/investment/manual-account',
      method: 'POST',
      data: draft,
    })
    const path = `/investment/account/${created.account.id}`
    expect(created.account.currentBalance).toEqual(money('9267'))
    expect(created.snapshot.accountValue).toEqual(
      created.account.currentBalance,
    )
    expect(created.snapshot.holdings[0]).toMatchObject({
      quantity: '2',
      institutionValue: '84.2468',
      accountValue: '92.67148',
    })
    const saved = await api<ManualBrokeragePortfolioResponse>({
      url: `${path}/manual-holdings`,
      method: 'PUT',
      data: {
        positions: [
          { symbol: 'EXM', quantity: '3' },
          { symbol: 'ZERO', quantity: '100' },
        ],
      },
    })
    expect(saved.account.currentBalance).toEqual(money('13901'))
    expect(
      await api({ url: `${path}/refresh-prices`, method: 'POST' }),
    ).toEqual(saved)
    expect(await api({ url: `${path}/holdings/latest` })).toEqual(
      saved.snapshot,
    )
    expect(await api({ url: `/account/${created.account.id}` })).toEqual(
      saved.account,
    )
    expect(await api({ url: `${path}/activity` })).toMatchObject({
      data: [],
      total: 0,
    })
    expect(await createFixtureApi()({ url: '/account' })).toHaveLength(4)
  })
  it('rejects invalid positions before replacing the portfolio', async () => {
    const api = createFixtureApi()
    const created = await api<ManualBrokeragePortfolioResponse>({
      url: '/investment/manual-account',
      method: 'POST',
      data: draft,
    })
    const path = `/investment/account/${created.account.id}`
    await expect(
      api({
        url: `${path}/manual-holdings`,
        method: 'PUT',
        data: {
          positions: [
            { symbol: 'EXM', quantity: '3' },
            { symbol: 'MISSING', quantity: '1' },
          ],
        },
      }),
    ).rejects.toThrow('fixture securities')
    expect(await api({ url: `${path}/holdings/latest` })).toEqual(
      created.snapshot,
    )
    expect(await api({ url: `/account/${created.account.id}` })).toEqual(
      created.account,
    )
    const failing = createFixtureApi({ failure: 'writes' })
    await expect(
      failing({
        url: '/investment/manual-account',
        method: 'POST',
        data: draft,
      }),
    ).rejects.toMatchObject({ response: { status: 503 } })
    expect(await failing({ url: '/account' })).toHaveLength(4)
  })
})

it('exposes an isolated editable holdings scenario and preserves it on a failed write', async () => {
  const api = createFixtureApi({ manualHoldings: true })
  const account = await api<Account>({ url: '/account/investment' })
  expect(account.valuationMode).toBe('holdings')
  expect(account.currentBalance).toEqual(money('9267'))
  const result = await api<ManualBrokeragePortfolioResponse>({
    method: 'PUT',
    url: '/investment/account/investment/manual-holdings',
    data: { positions: [{ symbol: 'EXM', quantity: '3' }] },
  })
  expect(result.account.currentBalance).toEqual(money('13901'))
  const failing = createFixtureApi({ manualHoldings: true, failure: 'writes' })
  await expect(
    failing({
      method: 'PUT',
      url: '/investment/account/investment/manual-holdings',
      data: { positions: [{ symbol: 'EXM', quantity: '3' }] },
    }),
  ).rejects.toThrow()
  expect(await failing({ url: '/account/investment' })).toEqual(account)
  expect(
    await createFixtureApi()({ url: '/account/investment' }),
  ).toMatchObject({ valuationMode: 'balance' })
})
