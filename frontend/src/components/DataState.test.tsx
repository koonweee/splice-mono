import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataState } from './DataState'

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

describe('DataState', () => {
  it('keeps existing results visible during a failed refresh and retries explicitly', () => {
    const onRetry = vi.fn()
    render(
      <MantineProvider>
        <DataState
          hasData
          isError
          errorMessage="Could not refresh accounts"
          onRetry={onRetry}
        >
          <div>Everyday Checking</div>
        </DataState>
      </MantineProvider>,
    )

    expect(screen.getByText('Everyday Checking')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'Could not refresh accounts',
    )
    expect(screen.queryByText('No results found.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('distinguishes initial loading, error retry, and an empty response', () => {
    const onRetry = vi.fn()
    const { rerender } = render(
      <MantineProvider>
        <DataState hasData={false} isLoading emptyMessage="No accounts" />
      </MantineProvider>,
    )
    expect(screen.getByRole('status').textContent).toContain('Loading results')
    expect(screen.queryByText('No accounts')).toBeNull()

    rerender(
      <MantineProvider>
        <DataState
          hasData={false}
          isError
          isFetching
          onRetry={onRetry}
          emptyMessage="No accounts"
        />
      </MantineProvider>,
    )
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.queryByText('No accounts')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).not.toHaveBeenCalled()

    rerender(
      <MantineProvider>
        <DataState hasData={false} emptyMessage="No accounts" />
      </MantineProvider>,
    )
    expect(screen.getByRole('status').textContent).toBe('No accounts')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
