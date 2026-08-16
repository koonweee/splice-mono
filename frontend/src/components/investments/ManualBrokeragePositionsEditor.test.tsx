import { MantineProvider } from '@mantine/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManualBrokeragePositionsEditor } from './ManualBrokeragePositionsEditor'
import type {
  ManualBrokeragePositionDraft,
  ManualBrokerageSecurityResult,
} from './ManualBrokeragePositionsEditor'

const result: ManualBrokerageSecurityResult = {
  symbol: 'C6L.SI',
  name: 'Singapore Airlines Limited',
  quoteType: 'EQUITY',
  exchangeCode: 'SES',
  exchangeName: 'Singapore Exchange',
  currency: 'SGD',
  marketIdentifierCode: 'XSES',
}

function TestEditor({
  initialPositions = [],
  searchSecurities = vi.fn().mockResolvedValue([result]),
}: {
  initialPositions?: Array<ManualBrokeragePositionDraft>
  searchSecurities?: (
    query: string,
    signal?: AbortSignal,
  ) => Promise<Array<ManualBrokerageSecurityResult>>
}) {
  const [positions, setPositions] = useState(initialPositions)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return (
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <ManualBrokeragePositionsEditor
          onChange={setPositions}
          positions={positions}
          searchSecurities={searchSecurities}
        />
      </MantineProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 44,
    height: 44,
    left: 0,
    right: 400,
    top: 0,
    width: 400,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ManualBrokeragePositionsEditor', () => {
  it('searches, selects an exchange-specific symbol, and preserves fractional quantities', async () => {
    const searchSecurities = vi.fn().mockResolvedValue([result])
    render(<TestEditor searchSecurities={searchSecurities} />)

    const searchInput = screen.getByLabelText('Search stocks and ETFs')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, {
      target: { value: 'C6L' },
    })

    expect(
      await screen.findByRole('button', { name: 'Add C6L.SI', hidden: true }),
    ).toBeTruthy()
    expect(searchSecurities).toHaveBeenCalledWith(
      'C6L',
      expect.any(AbortSignal),
    )
    expect(screen.getByText(/Singapore Exchange · SGD/)).toBeTruthy()

    fireEvent.click(
      screen.getByRole('button', { name: 'Add C6L.SI', hidden: true }),
    )
    const quantity = screen.getByLabelText('C6L.SI quantity')
    fireEvent.change(quantity, { target: { value: '200.125' } })

    expect((quantity as HTMLInputElement).value).toBe('200.125')
    expect(screen.queryByText('Enter a quantity greater than 0')).toBeNull()
  })

  it('prevents a duplicate symbol and removes positions', async () => {
    render(
      <TestEditor
        initialPositions={[
          { symbol: 'C6L.SI', quantity: '200', security: result },
        ]}
      />,
    )

    const searchInput = screen.getByLabelText('Search stocks and ETFs')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, {
      target: { value: 'C6L' },
    })
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Add C6L.SI',
        hidden: true,
      }),
    )
    expect(screen.getByRole('alert').textContent).toContain(
      'C6L.SI is already in this brokerage',
    )
    expect(screen.getAllByLabelText('C6L.SI quantity')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Remove C6L.SI' }))
    expect(screen.getByText('No positions added yet.')).toBeTruthy()
  })

  it('shows inline quantity validation', () => {
    render(
      <TestEditor
        initialPositions={[
          {
            symbol: 'GOOGL',
            quantity: '1',
            security: { ...result, symbol: 'GOOGL' },
          },
        ]}
      />,
    )

    fireEvent.change(screen.getByLabelText('GOOGL quantity'), {
      target: { value: '0' },
    })
    expect(screen.getByText('Enter a quantity greater than 0')).toBeTruthy()
  })

  it('renders empty and error search states', async () => {
    const searchSecurities = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('offline'))
    const rendered = render(<TestEditor searchSecurities={searchSecurities} />)

    let searchInput = screen.getByLabelText('Search stocks and ETFs')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, {
      target: { value: 'ZZZ' },
    })
    expect(
      await screen.findByText('No supported stocks or ETFs found.'),
    ).toBeTruthy()

    rendered.unmount()
    render(<TestEditor searchSecurities={searchSecurities} />)
    searchInput = screen.getByLabelText('Search stocks and ETFs')
    fireEvent.focus(searchInput)
    fireEvent.change(searchInput, {
      target: { value: 'FAIL' },
    })
    await waitFor(() =>
      expect(screen.getByRole('alert', { hidden: true }).textContent).toContain(
        'Stock search failed',
      ),
    )
  })
})
