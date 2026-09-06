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

  it('uses the supplied skeleton only for a cold query and preserves live child state during refresh', () => {
    const { rerender } = render(
      <MantineProvider>
        <DataState
          hasData={false}
          isLoading
          loadingFallback={<div data-testid="account-shape" />}
        >
          Loaded rows
        </DataState>
      </MantineProvider>,
    )
    expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true')
    expect(
      screen.getByTestId('account-shape').closest('[aria-hidden="true"]'),
    ).toBeTruthy()
    expect(screen.queryByText('Loaded rows')).toBeNull()

    const content = (
      <input aria-label="Account name draft" defaultValue="Original" />
    )
    rerender(
      <MantineProvider>
        <DataState hasData>{content}</DataState>
      </MantineProvider>,
    )
    const draft = screen.getByRole<HTMLInputElement>('textbox', {
      name: 'Account name draft',
    })
    fireEvent.change(draft, { target: { value: 'Unsaved name' } })
    draft.focus()
    rerender(
      <MantineProvider>
        <DataState hasData isFetching>
          {content}
        </DataState>
      </MantineProvider>,
    )
    expect(screen.getByRole('textbox')).toBe(draft)
    expect(draft.value).toBe('Unsaved name')
    expect(document.activeElement).toBe(draft)
    expect(screen.queryByTestId('account-shape')).toBeNull()
    rerender(
      <MantineProvider>
        <DataState hasData isError>
          {content}
        </DataState>
      </MantineProvider>,
    )
    expect(screen.getByRole('textbox')).toBe(draft)
    expect(draft.value).toBe('Unsaved name')
    expect(document.activeElement).toBe(draft)
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss loading error' }),
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('textbox')).toBe(draft)
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
