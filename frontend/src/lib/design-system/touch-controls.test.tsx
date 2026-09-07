import { Checkbox, MantineProvider, Radio, Switch } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InteractiveRow } from '../../components/InteractiveRow'
import { components } from './components'

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

describe('choice touch targets', () => {
  it.each(['checkbox', 'radio'] as const)(
    'activates %s padding once without opening its row',
    (kind) => {
      const changed = vi.fn()
      const opened = vi.fn()
      const control =
        kind === 'checkbox' ? (
          <Checkbox aria-label="Select item" onChange={changed} />
        ) : (
          <Radio aria-label="Select item" onChange={changed} />
        )
      render(
        <MantineProvider theme={{ components }}>
          <InteractiveRow actionLabel="Open item" onActivate={opened}>
            {control}
          </InteractiveRow>
        </MantineProvider>,
      )
      const input = screen.getByRole(kind, { name: 'Select item' })
      const body = input.closest('.splice-choice-body')!
      fireEvent.click(body)
      expect(changed).toHaveBeenCalledTimes(1)
      expect(opened).not.toHaveBeenCalled()
    },
  )
  it('keeps label activation native and respects disabled choices', () => {
    const changed = vi.fn()
    render(
      <MantineProvider theme={{ components }}>
        <Checkbox label="Enabled" onChange={changed} />
        <Checkbox label="Disabled" disabled onChange={changed} />
        <Switch label="Notifications" onChange={changed} />
      </MantineProvider>,
    )
    fireEvent.click(screen.getByText('Enabled'))
    expect(changed).toHaveBeenCalledTimes(1)
    fireEvent.click(
      screen
        .getByRole('checkbox', { name: 'Disabled' })
        .closest('.splice-choice-body')!,
    )
    expect(changed).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByText('Notifications'))
    expect(changed).toHaveBeenCalledTimes(2)
  })
})
