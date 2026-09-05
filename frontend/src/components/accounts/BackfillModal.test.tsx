import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackfillModal } from './BackfillModal'

const state = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }))
vi.mock('../../api/clients/spliceAPI', () => ({
  useBalanceSnapshotControllerImportCsv: () => state,
  getAccountControllerFindAllQueryKey: () => ['accounts'],
  getBalanceQueryControllerGetBalancesQueryKey: () => ['balances'],
  getBalanceQueryControllerGetAllBalancesQueryKey: () => ['all-balances'],
}))
vi.mock('@mantine/notifications', () => ({ notifications: { show: vi.fn() } }))

beforeEach(() => {
  state.isPending = false
  state.mutate.mockReset()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})
afterEach(cleanup)

function setup() {
  const onClose = vi.fn()
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <MantineProvider>
        <BackfillModal opened onClose={onClose} />
      </MantineProvider>
    </QueryClientProvider>,
  )
  const form = view.baseElement.querySelector('form')!
  const input =
    view.baseElement.querySelector<HTMLInputElement>('input[type=file]')!
  return { onClose, form, input }
}

describe('CSV editor', () => {
  it('validates a missing file through form submission', async () => {
    const { form } = setup()
    fireEvent.submit(form)
    expect(await screen.findByText('Please select a file')).toBeTruthy()
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it('keeps the selected file after failure so the import can be retried', async () => {
    state.mutate.mockImplementation((_input, callbacks) => {
      callbacks.onError({
        response: {
          data: { message: ['Invalid date column.', 'Use YYYY-MM-DD.'] },
        },
      })
      callbacks.onSettled()
    })
    const { form, input, onClose } = setup()
    const file = new File(['date,balance'], 'balances.csv', {
      type: 'text/csv',
    })
    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.submit(form)
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Invalid date column. Use YYYY-MM-DD.',
    )
    expect(screen.getByText('balances.csv')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.submit(form)
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(2))
    expect(state.mutate.mock.calls[1][0]).toEqual({ data: { file } })
  })

  it('does not submit or dismiss while importing', () => {
    state.isPending = true
    const { form, input, onClose } = setup()
    fireEvent.change(input, {
      target: { files: [new File([''], 'balances.csv')] },
    })
    fireEvent.submit(form)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(state.mutate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('blocks repeated submits before the mutation hook rerenders', () => {
    const { form, input, onClose } = setup()
    fireEvent.change(input, {
      target: { files: [new File([''], 'balances.csv')] },
    })
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(state.mutate).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
