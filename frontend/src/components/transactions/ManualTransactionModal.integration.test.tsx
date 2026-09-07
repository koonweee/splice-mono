import { MantineProvider } from '@mantine/core'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fixtureAccounts, fixtureUser } from '../../../workbench/fixtures'
import {
  fixtureCategories,
  fixtureTransactions,
} from '../../../workbench/page-fixtures'
import { axiosInstance } from '../../lib/browser-api-client'
import { createMutationCache } from '../../lib/query-invalidation'
import { configureQueryPolicy } from '../../lib/query-policy'
import { ManualTransactionModal } from './ManualTransactionModal'
import type { AxiosAdapter } from 'axios'
import type { CategorySelectOption } from '../categories/CategorySelect'

// Only the isomorphic boundary and category picker are substituted. Generated
// mutation hooks, MutationCache, query policy and browser transport are real.
vi.mock(
  '../../api/axios',
  async () => await import('../../lib/browser-api-client'),
)
vi.mock('../categories/CategorySelect', () => ({
  CategorySelect: ({
    data,
    value,
    onChange,
  }: {
    data: Array<CategorySelectOption>
    value: string
    onChange: (value: string) => void
  }) => (
    <select
      aria-label="Category"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      <option value="">Select category</option>
      {data.map((item) => (
        <option key={item.value} value={item.value}>
          {item.secondary}
        </option>
      ))}
    </select>
  ),
}))
let client: QueryClient
const originalAdapter = axiosInstance.defaults.adapter
let adapter: ReturnType<typeof vi.fn<AxiosAdapter>>
const accounts = [fixtureAccounts[1]]
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  client = new QueryClient({ mutationCache: createMutationCache(() => client) })
  configureQueryPolicy(client)
  client.setQueryData(['/user/me'], fixtureUser)
  adapter = vi.fn<AxiosAdapter>()
  axiosInstance.defaults.adapter = adapter
})
afterEach(() => {
  cleanup()
  client.clear()
  axiosInstance.defaults.adapter = originalAdapter
  onlineManager.setOnline(true)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function mount() {
  const onClose = vi.fn()
  const tree = (nextAccounts = accounts) => (
    <MantineProvider>
      <QueryClientProvider client={client}>
        <ManualTransactionModal
          opened
          accounts={nextAccounts}
          categories={fixtureCategories}
          defaultAccountId="cash"
          onClose={onClose}
        />
      </QueryClientProvider>
    </MantineProvider>
  )
  const rendered = render(tree())
  fireEvent.change(
    screen.getByRole<HTMLInputElement>('textbox', { name: /^Amount/ }),
    {
      target: { value: '-12.34' },
    },
  )
  fireEvent.change(
    screen.getByRole<HTMLInputElement>('textbox', { name: /^Merchant/ }),
    {
      target: { value: 'Coffee shop' },
    },
  )
  fireEvent.change(screen.getByLabelText(/^Date/), {
    target: { value: '2026-09-07' },
  })
  fireEvent.change(screen.getByLabelText('Category'), {
    target: { value: 'food' },
  })
  return { ...rendered, onClose, tree }
}

describe('manual save recovery with real TanStack mutations', () => {
  it('fails an offline submit without sending or silently replaying after reconnect, retaining the draft', async () => {
    const rendered = mount()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    onlineManager.setOnline(false)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText(/Your changes have not been sent/)
    expect(adapter).not.toHaveBeenCalled()
    expect(
      client
        .getMutationCache()
        .getAll()
        .every((mutation) => !mutation.state.isPaused),
    ).toBe(true)
    expect(
      screen.getByRole<HTMLInputElement>('textbox', { name: /^Merchant/ })
        .value,
    ).toBe('Coffee shop')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    await act(async () => {
      onlineManager.setOnline(true)
      await Promise.resolve()
    })
    expect(adapter).not.toHaveBeenCalled()
    expect(rendered.onClose).not.toHaveBeenCalled()
  })
  it('blocks repeat creation after a lost response and reads saved entries before the user decides', async () => {
    const rendered = mount()
    adapter.mockImplementation((config) => {
      if (config.method === 'post')
        return Promise.reject(
          new AxiosError('Response lost', 'ERR_NETWORK', config),
        )
      return Promise.resolve({
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {
          data: [
            {
              ...fixtureTransactions[0],
              id: 'saved',
              source: 'manual',
              accountId: 'cash',
              merchantName: 'Coffee shop',
              categoryId: 'food',
              providerDate: '2026-09-07',
              amount: {
                money: { amount: '1234', currency: 'USD' },
                sign: 'negative',
              },
            },
          ],
          hasMore: false,
          nextCursor: null,
          total: null,
          pageIndex: null,
          pageSize: 50,
        },
      })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Save confirmation missing')
    expect(rendered.onClose).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
    ).toBe(true)
    fireEvent.submit(
      screen.getByRole('button', { name: 'Save' }).closest('form')!,
    )
    expect(
      adapter.mock.calls.filter(([config]) => config.method === 'post'),
    ).toHaveLength(1)
    fireEvent.click(
      screen.getByRole('button', { name: 'Check saved transactions' }),
    )
    await screen.findByText('1 saved entry matches these details.')
    expect(
      adapter.mock.calls.filter(([config]) => config.method === 'post'),
    ).toHaveLength(1)
    expect(
      adapter.mock.calls.find(([config]) => config.method === 'get')?.[0],
    ).toMatchObject({
      url: '/transaction',
      params: {
        accountId: 'cash',
        startDate: '2026-09-07',
        endDate: '2026-09-07',
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(rendered.onClose).toHaveBeenCalledOnce()
  })
  it('does not interpret a failed reconciliation read as proof the write failed', async () => {
    mount()
    adapter.mockImplementation((config) =>
      Promise.reject(new AxiosError('Unavailable', 'ERR_NETWORK', config)),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByText('Save confirmation missing')
    fireEvent.click(
      screen.getByRole('button', { name: 'Check saved transactions' }),
    )
    await screen.findByText(
      'Unable to check saved entries. Reconnect and try again.',
    )
    expect(
      screen.queryByRole('button', { name: 'Try saving again' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled'),
    ).toBe(true)
  })
  it('does not reset typed data when an account refresh returns new object identities', async () => {
    const rendered = mount()
    rendered.rerender(rendered.tree(structuredClone(accounts)))
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLInputElement>('textbox', { name: /^Merchant/ })
          .value,
      ).toBe('Coffee shop'),
    )
    expect(
      screen.getByRole<HTMLInputElement>('textbox', { name: /^Amount/ }).value,
    ).toBe('-12.34')
  })
})
