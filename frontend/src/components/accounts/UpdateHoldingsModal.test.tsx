import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UpdateHoldingsModal } from './UpdateHoldingsModal'
import type * as ManualInvestmentApi from '../../api/manualInvestment'
import type { Account } from '../../api/models'

const mockFns = vi.hoisted(() => ({
  replaceSnapshotMutate: vi.fn(),
}))

vi.mock('../../api/manualInvestment', async () => {
  const actual: typeof ManualInvestmentApi = await vi.importActual(
    '../../api/manualInvestment',
  )

  return {
    ...actual,
    useReplaceManualInvestmentSnapshot: () => ({
      mutate: mockFns.replaceSnapshotMutate,
      isPending: false,
    }),
  }
})

function makeAccount(): Account {
  return {
    id: 'account-1',
    userId: 'user-1',
    name: 'Brokerage',
    customName: null,
    availableBalance: {
      money: { amount: 0, currency: 'USD' },
      sign: 'positive',
    },
    currentBalance: {
      money: { amount: 0, currency: 'USD' },
      sign: 'positive',
    },
    type: 'investment',
    subType: 'brokerage',
    externalAccountId: null,
    bankLinkId: null,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    manualValuationMode: 'holdings',
  }
}

function renderModal() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MantineProvider>
        <UpdateHoldingsModal
          opened
          onClose={() => {}}
          account={makeAccount()}
          snapshot={{
            id: 'snapshot-1',
            accountId: 'account-1',
            userId: 'user-1',
            snapshotDate: '2026-04-15',
            cashBalance: {
              money: { amount: 10000, currency: 'USD' },
              sign: 'positive',
            },
            holdings: [
              {
                id: 'holding-1',
                instrumentId: 'instrument-1',
                symbol: 'VOO',
                quantity: 2,
              },
            ],
            createdAt: '2026-04-15T00:00:00.000Z',
            updatedAt: '2026-04-15T00:00:00.000Z',
          }}
        />
      </MantineProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockFns.replaceSnapshotMutate.mockReset()
  Object.defineProperty(window, 'matchMedia', {
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
    configurable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('UpdateHoldingsModal', () => {
  it('disables snapshot date changes when editing an existing snapshot', () => {
    renderModal()

    expect(screen.getByLabelText('Snapshot Date').hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Save Snapshot' }))

    expect(mockFns.replaceSnapshotMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        date: '2026-04-15',
      }),
      expect.any(Object),
    )
  })
})
