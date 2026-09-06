import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountType, MoneyWithSignSign } from '../api/models'
import { CompactAccountRow } from './CompactAccountRow'
import type { AccountSummaryData } from '../lib/balance-utils'

afterEach(cleanup)

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  Object.defineProperty(window, 'ResizeObserver', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    })),
  })
})

const account: AccountSummaryData = {
  id: 'account-1',
  name: 'Everyday Checking',
  type: AccountType.depository,
  valuationMode: 'balance',
  effectiveBalance: {
    money: { amount: '125000', currency: 'USD' },
    sign: MoneyWithSignSign.positive,
  },
  changeAmount: {
    money: { amount: '2500', currency: 'USD' },
    sign: MoneyWithSignSign.positive,
  },
  changePercent: 2,
}

function renderRow(onClick = vi.fn()) {
  render(
    <MantineProvider>
      <CompactAccountRow
        account={account}
        balancesHidden={false}
        isLiability={false}
        onClick={onClick}
      />
    </MantineProvider>,
  )

  return onClick
}

describe('CompactAccountRow', () => {
  it('keeps the row action and change popover as separate controls', () => {
    const onClick = renderRow()
    const rowAction = screen.getByRole('button', {
      name: 'Open account details for Everyday Checking',
    })
    const changeAction = screen.getByRole('button', {
      name: /Show absolute change/,
    })

    expect(rowAction.contains(changeAction)).toBe(false)

    fireEvent.click(changeAction)
    expect(onClick).not.toHaveBeenCalled()

    fireEvent.click(rowAction)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows row press feedback for keyboard activation only', () => {
    const onClick = renderRow()
    const rowAction = screen.getByRole('button', {
      name: 'Open account details for Everyday Checking',
    })
    const changeAction = screen.getByRole('button', {
      name: /Show absolute change/,
    })
    const row = rowAction.parentElement

    fireEvent.keyDown(rowAction, { key: ' ' })
    expect(row?.getAttribute('data-pressed')).toBe('true')
    fireEvent.keyUp(rowAction, { key: ' ' })
    expect(row?.getAttribute('data-pressed')).toBeNull()

    fireEvent.keyDown(changeAction, { key: 'Enter' })
    expect(row?.getAttribute('data-pressed')).toBeNull()
    expect(onClick).not.toHaveBeenCalled()
  })
})
