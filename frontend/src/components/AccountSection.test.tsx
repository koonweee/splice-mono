import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSection } from './AccountSection'
import type { AccountSummaryData } from '../lib/balance-utils'

let supportsHover = true
vi.mock('../lib/responsive', () => ({ useSupportsHover: () => supportsHover }))
vi.mock('./CompactAccountRow', () => ({ CompactAccountRow: () => null }))
beforeEach(() => {
  supportsHover = true
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const account = (
  id: string,
  type: AccountSummaryData['type'],
  amount: string,
): AccountSummaryData => ({
  id,
  name: id,
  type,
  valuationMode: 'balance',
  effectiveBalance: { money: { amount, currency: 'USD' }, sign: 'positive' },
})
const mount = (accounts: Array<AccountSummaryData>, hidden = false) => {
  const select = vi.fn()
  render(
    <MantineProvider env="test">
      <AccountSection
        title="Assets"
        accounts={accounts}
        balancesHidden={hidden}
        isLiability={false}
        onAccountClick={select}
      />
    </MantineProvider>,
  )
  return select
}

describe('asset group amounts', () => {
  it('reveals exact combined investment totals on hover without rounding through Number', async () => {
    mount([
      account('brokerage', 'brokerage', '9007199254740992'),
      account('investment', 'investment', '1'),
    ])
    const trigger = screen.getByRole('button', {
      name: 'Show investment total',
    })
    expect(trigger.textContent).toBe('100.0%')
    fireEvent.mouseEnter(trigger)
    expect(await screen.findByText('$90,071,992,547,409.93')).toBeTruthy()
    fireEvent.mouseLeave(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
  it('uses converted signed balances and supports taps and keyboard activation', async () => {
    supportsHover = false
    const converted = account('foreign', 'depository', '50000')
    converted.effectiveBalance.money.currency = 'EUR'
    converted.convertedEffectiveBalance = {
      money: { amount: '15000', currency: 'USD' },
      sign: 'positive',
    }
    const overdraft = account('overdraft', 'depository', '2500')
    overdraft.effectiveBalance.sign = 'negative'
    const select = mount([converted, overdraft])
    const trigger = screen.getByRole('button', {
      name: 'Show depository total',
    })
    fireEvent.mouseEnter(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.focus(trigger)
    fireEvent.click(trigger)
    expect(await screen.findByText('$125.00')).toBeTruthy()
    expect(select).not.toHaveBeenCalled()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(trigger, { key: ' ' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    fireEvent.blur(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })
  it('never reveals hidden totals through text or accessible labels', async () => {
    mount([account('cash', 'depository', '12500')], true)
    fireEvent.click(
      screen.getByRole('button', { name: 'Show depository total' }),
    )
    expect(await screen.findByText('****')).toBeTruthy()
    expect(document.body.textContent).not.toContain('$125.00')
    expect(screen.queryByLabelText(/125/)).toBeNull()
  })
  it('shows a zero total and declines to label mixed unconverted currencies as one amount', async () => {
    mount([account('other', 'other', '0')])
    fireEvent.click(screen.getByRole('button', { name: 'Show other total' }))
    expect(await screen.findByText('$0.00')).toBeTruthy()
    cleanup()
    const foreign = account('foreign', 'depository', '100')
    foreign.effectiveBalance.money.currency = 'EUR'
    mount([account('cash', 'depository', '100'), foreign])
    expect(
      screen.queryByRole('button', { name: 'Show depository total' }),
    ).toBeNull()
    expect(screen.getByText('100.0%')).toBeTruthy()
  })
})
