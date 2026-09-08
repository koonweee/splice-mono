import { MantineProvider } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderRefreshStatus } from './HeaderRefreshStatus'

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 10,
    y: 10,
    width: 44,
    height: 44,
    top: 10,
    left: 10,
    right: 54,
    bottom: 54,
    toJSON: () => ({}),
  })
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
  vi.restoreAllMocks()
})

describe('HeaderRefreshStatus', () => {
  it('exposes saved-data detail and retry on tap, then removes failure feedback during refresh', async () => {
    const retry = vi.fn()
    const { rerender } = render(
      <MantineProvider env="test">
        <HeaderRefreshStatus
          status={{ phase: 'offline', lastSuccessfulAt: 1000000 }}
          onRetry={retry}
        />
      </MantineProvider>,
    )
    fireEvent.click(
      screen.getByRole('button', { name: /Offline · Showing saved data from/ }),
    )
    expect(await screen.findByRole('dialog')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
    rerender(
      <MantineProvider env="test">
        <HeaderRefreshStatus
          status={{ phase: 'refreshing', lastSuccessfulAt: 1000000 }}
          onRetry={retry}
        />
      </MantineProvider>,
    )
    expect(screen.queryByRole('button', { name: /Offline/ })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(
      'Updating saved data',
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('omits unknown dates and dismisses detail with Escape while restoring focus', async () => {
    render(
      <MantineProvider env="test">
        <HeaderRefreshStatus
          status={{ phase: 'error', lastSuccessfulAt: null }}
          onRetry={vi.fn()}
        />
      </MantineProvider>,
    )
    const trigger = screen.getByRole('button', { name: "Couldn't refresh" })
    trigger.focus()
    fireEvent.click(trigger)
    const retry = await screen.findByRole('button', { name: 'Retry' })
    retry.focus()
    fireEvent.keyDown(retry, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(trigger)
    expect(screen.getByRole('status').textContent).toBe("Couldn't refresh")
  })
})
