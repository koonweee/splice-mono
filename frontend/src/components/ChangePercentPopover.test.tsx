import { MantineProvider } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangePercentPopover } from './ChangePercentPopover'

vi.mock('../lib/responsive', () => ({ useSupportsHover: () => true }))
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('absolute change popup', () => {
  it('opens on the first focused click and toggles through keyboard activation', async () => {
    render(
      <MantineProvider>
        <ChangePercentPopover
          changeAmount={{
            money: { amount: '30000', currency: 'USD' },
            sign: 'positive',
          }}
          changePercent={2}
          color="var(--splice-positive)"
        />
      </MantineProvider>,
    )
    const trigger = screen.getByRole('button', {
      name: 'Show absolute change +$300.00',
    })
    // Browsers focus a pointer target before dispatching its click.
    fireEvent.focus(trigger)
    fireEvent.click(trigger)
    await waitFor(() =>
      expect(trigger.getAttribute('aria-expanded')).toBe('true'),
    )
    expect(await screen.findByText('+$300.00')).toBeTruthy()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.keyDown(trigger, { key: ' ' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    fireEvent.blur(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.mouseEnter(trigger)
    fireEvent.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })
})
