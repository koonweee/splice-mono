import { MantineProvider } from '@mantine/core'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { lazy } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeferredFeature } from './DeferredFeature'
import { DataState } from './DataState'
import { LoadingSkeleton } from './loading/LoadingSkeleton'

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

function OwnerShape() {
  return (
    <div data-testid="owner-shape">
      <span>Known column</span>
      <span aria-hidden>Unknown content</span>
    </div>
  )
}
function DataFeature({ ready }: { ready: boolean }) {
  return (
    <DataState
      hasData={ready}
      isLoading={!ready}
      loadingFallback={<OwnerShape />}
    >
      <input aria-label="Draft" defaultValue="Loaded value" />
    </DataState>
  )
}

describe('explicit feature loading ownership', () => {
  it('uses the owner fallback through independently held module and data phases', async () => {
    let release: (value: { default: typeof DataFeature }) => void = () => {}
    const Feature = lazy(
      () =>
        new Promise<{ default: typeof DataFeature }>((resolve) => {
          release = resolve
        }),
    )
    const view = (ready: boolean) => (
      <MantineProvider>
        <DeferredFeature
          label="Example"
          fallback={
            <LoadingSkeleton>
              <OwnerShape />
            </LoadingSkeleton>
          }
        >
          <Feature ready={ready} />
        </DeferredFeature>
      </MantineProvider>
    )
    const { rerender } = render(view(false))
    expect(screen.getByTestId('owner-shape')).toBeTruthy()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    await act(() => {
      release({ default: DataFeature })
    })
    await waitFor(() => expect(screen.getByTestId('owner-shape')).toBeTruthy())
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getAllByRole('status')).toHaveLength(1)
    rerender(view(true))
    expect(screen.getByRole('textbox', { name: 'Draft' })).toBeTruthy()
    expect(screen.queryByTestId('owner-shape')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('exposes one announcement and makes decorative descendants inert when boundaries compose', () => {
    render(
      <MantineProvider>
        <LoadingSkeleton label="Loading account…">
          <LoadingSkeleton label="Loading chart…">
            <button>Decorative action</button>
          </LoadingSkeleton>
        </LoadingSkeleton>
      </MantineProvider>,
    )
    expect(screen.getAllByRole('status', { hidden: true })).toHaveLength(1)
    expect(screen.queryByRole('button')).toBeNull()
    expect(
      screen.getByText('Decorative action').closest('[inert]'),
    ).toBeTruthy()
  })
})
