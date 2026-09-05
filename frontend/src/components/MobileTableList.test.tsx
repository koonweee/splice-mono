import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MobileTableList } from './MobileTableList'

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
afterEach(cleanup)

it('keeps its rows and forwards retry after a failed refresh', () => {
  const onRetry = vi.fn()
  render(
    <MantineProvider>
      <MobileTableList
        ariaLabel="Rules"
        data={[{ id: 'rule-1', name: 'Coffee shops' }]}
        emptyMessage="No rules"
        isError
        onRetry={onRetry}
        getRowKey={(row) => row.id}
        renderRow={(row) => <span>{row.name}</span>}
      />
    </MantineProvider>,
  )
  expect(screen.getByRole('region', { name: 'Rules' }).textContent).toContain(
    'Coffee shops',
  )
  expect(screen.queryByText('No rules')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(onRetry).toHaveBeenCalledOnce()
})
