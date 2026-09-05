import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './accounts'
import type { ComponentType } from 'react'

const mocks = vi.hoisted(() => ({
  accountsQuery: vi.fn(),
  refetch: vi.fn(),
  invalidateQueries: vi.fn(),
  sync: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: { component: ComponentType }) => ({
    ...config,
    useSearch: () => ({}),
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}))

vi.mock('../../api/clients/spliceAPI', () => ({
  useAccountControllerFindAll: mocks.accountsQuery,
  getAccountControllerFindAllQueryKey: () => ['/account'],
  useBankLinkControllerSyncAllAccounts: () => ({
    mutate: mocks.sync,
    isPending: false,
  }),
}))

vi.mock('@/components/accounts/AddAccountModal', () => ({
  AddAccountModal: () => null,
}))
vi.mock('@/components/accounts/BackfillModal', () => ({
  BackfillModal: () => null,
}))
vi.mock('@/components/accounts/InstitutionSection', () => ({
  InstitutionSection: ({
    accounts,
  }: {
    accounts: Array<{ id: string; name: string }>
  }) => (
    <div>
      {accounts.map((account) => (
        <span key={account.id}>{account.name}</span>
      ))}
    </div>
  ),
}))

const AccountsPage = (Route as unknown as { component: ComponentType })
  .component

function page() {
  return (
    <MantineProvider>
      <AccountsPage />
    </MantineProvider>
  )
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Accounts page states', () => {
  it('keeps the header through loading and failure and retries the account query', () => {
    mocks.accountsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      error: null,
      refetch: mocks.refetch,
    })
    const view = render(page())
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Loading accounts')

    mocks.accountsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error('Unavailable'),
      refetch: mocks.refetch,
    })
    view.rerender(page())
    expect(screen.getByRole('heading', { name: 'Accounts' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add account' })).toBeTruthy()
    expect(screen.queryByText('No accounts found')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('retains cached accounts after a failed refresh', () => {
    mocks.accountsQuery.mockReturnValue({
      data: [{ id: 'account-1', name: 'Everyday Checking', bankLink: null }],
      isLoading: false,
      isFetching: false,
      error: new Error('Unavailable'),
      refetch: mocks.refetch,
    })
    render(page())
    expect(screen.getByText('Everyday Checking')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'Failed to load accounts',
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
