import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ValueAdjustmentsSection } from './ValueAdjustmentsSection'
import type { Account } from '../../api/models'

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), pending: false }))
vi.mock('../../hooks/useAccountMetadataMutation', () => ({
  useAccountMetadataMutation: () => ({
    mutate: mocks.mutate,
    isPending: mocks.pending,
  }),
}))
const account: Account = {
  id: 'account-test',
  userId: 'user-test',
  name: 'RSUs',
  type: 'investment',
  subType: 'brokerage',
  valuationMode: 'balance',
  bankLinkId: 'provider-link',
  currentBalance: {
    money: { amount: '10000000', currency: 'USD' },
    sign: 'positive',
  },
  availableBalance: {
    money: { amount: '0', currency: 'USD' },
    sign: 'positive',
  },
  createdAt: '2026-11-07T00:00:00Z',
  updatedAt: '2026-11-07T00:00:00Z',
}
function setup(props: { account?: Account; balancesHidden?: boolean } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <MantineProvider>
      <QueryClientProvider client={client}>
        <ValueAdjustmentsSection
          account={props.account ?? account}
          balancesHidden={props.balancesHidden}
        />
      </QueryClientProvider>
    </MantineProvider>,
  )
  return { ...view, client }
}
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  mocks.mutate.mockReset()
  mocks.pending = false
})
afterEach(cleanup)
describe('ValueAdjustmentsSection', () => {
  it('shows only a quiet Add action when unset and defaults the editor', () => {
    setup()
    expect(screen.queryByLabelText('Expected value')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(
      screen.getByLabelText<HTMLInputElement>('Expected value').value,
    ).toBe('100')
    expect(screen.getByLabelText<HTMLInputElement>('Expected tax').value).toBe(
      '0',
    )
    expect(
      screen.queryByText(/Used in net worth|Percentage of the balance/),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText('Expected value')).toBeNull()
    expect(mocks.mutate).not.toHaveBeenCalled()
  })
  it('previews 35k from a 100k base and saves both fields without changing base', async () => {
    const { client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.change(
      screen.getByLabelText<HTMLInputElement>('Expected value'),
      {
        target: { value: '50' },
      },
    )
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('Expected tax'), {
      target: { value: '30' },
    })
    expect(screen.getByRole('status').textContent).toContain('35,000')
    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }),
    )
    expect(mocks.mutate.mock.calls[0][0]).toEqual({
      id: account.id,
      data: { expectedValuePercent: '50', expectedTaxPercent: '30' },
    })
    expect(account.currentBalance.money.amount).toBe('10000000')
    await act(() =>
      mocks.mutate.mock.calls[0][1].onSuccess({
        ...account,
        expectedValuePercent: '50',
        expectedTaxPercent: '30',
      }),
    )
    expect(screen.queryByLabelText('Expected value')).toBeNull()
    expect(invalidate).toHaveBeenCalled()
  })
  it('rejects zero value and tax above 100, and allows value above 100', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.change(
      screen.getByLabelText<HTMLInputElement>('Expected value'),
      {
        target: { value: '0' },
      },
    )
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled,
    ).toBe(true)
    fireEvent.change(
      screen.getByLabelText<HTMLInputElement>('Expected value'),
      {
        target: { value: '150.5' },
      },
    )
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('Expected tax'), {
      target: { value: '101' },
    })
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled,
    ).toBe(true)
    fireEvent.change(screen.getByLabelText<HTMLInputElement>('Expected tax'), {
      target: { value: '100' },
    })
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled,
    ).toBe(false)
  })
  it('retains a failed draft and guards repeated submission', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.change(
      screen.getByLabelText<HTMLInputElement>('Expected value'),
      {
        target: { value: '75' },
      },
    )
    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }),
    )
    fireEvent.click(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }),
    )
    expect(mocks.mutate).toHaveBeenCalledTimes(1)
    await act(() =>
      mocks.mutate.mock.calls[0][1].onError(new Error('Unavailable')),
    )
    expect(
      screen.getByLabelText<HTMLInputElement>('Expected value').value,
    ).toBe('75')
    expect(screen.getByRole('alert')).toBeTruthy()
  })
  it('removes adjustments by saving identity defaults', () => {
    setup({
      account: {
        ...account,
        expectedValuePercent: '50',
        expectedTaxPercent: '30',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove adjustments' }))
    expect(mocks.mutate.mock.calls[0][0].data).toEqual({
      expectedValuePercent: '100',
      expectedTaxPercent: '0',
    })
  })
  it('masks both base and adjusted preview values', () => {
    setup({ balancesHidden: true })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.queryByText(/100,000/)).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('****')
  })
})
