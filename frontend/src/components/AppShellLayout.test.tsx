import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PresentationProvider } from '../lib/presentation-preferences'
import { AppShellLayout } from './AppShellLayout'
import type { ComponentProps } from 'react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, ...props }: { to: string } & ComponentProps<'a'>) => (
    <a {...props} href={to} />
  ),
}))

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

describe('shared app shell', () => {
  it('exposes navigation only while open and preserves preparation/logout callbacks', () => {
    const prepare = vi.fn()
    const logout = vi.fn()
    render(
      <MantineProvider>
        <AppShellLayout
          pathname="/home"
          onLogout={logout}
          onPrepareDestination={prepare}
        >
          <h1>Home content</h1>
        </AppShellLayout>
      </MantineProvider>,
    )
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    const settings = screen.getByRole('link', { name: 'Settings' })
    fireEvent.focus(settings)
    expect(prepare).toHaveBeenCalledWith('/settings')
    fireEvent.click(settings)
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Home content' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(logout).toHaveBeenCalledOnce()
  })
})

it('toggles account visibility beside the eye with a changing accessible action', () => {
  render(
    <MantineProvider>
      <PresentationProvider
        initial={{
          today: '2026-09-06',
          appearance: { mode: 'dark', accent: null },
          maskBalances: false,
        }}
      >
        <AppShellLayout pathname="/home" onLogout={() => {}}>
          Home
        </AppShellLayout>
      </PresentationProvider>
    </MantineProvider>,
  )
  const hide = screen.getByRole('button', {
    name: 'Hide accounts below 100% expected value',
  })
  expect(hide.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(hide)
  const show = screen.getByRole('button', {
    name: 'Show accounts below 100% expected value',
  })
  expect(show.getAttribute('aria-pressed')).toBe('true')
  expect(
    screen
      .getByRole('button', { name: 'Hide balances' })
      .getAttribute('aria-pressed'),
  ).toBe('false')
  fireEvent.click(show)
  expect(
    screen
      .getByRole('button', { name: 'Hide accounts below 100% expected value' })
      .getAttribute('aria-pressed'),
  ).toBe('false')
})

it('keeps a saved Home filter fixed while still allowing local balance masking', () => {
  render(
    <MantineProvider>
      <AppShellLayout pathname="/home" readOnly onLogout={() => {}}>
        Saved Home
      </AppShellLayout>
    </MantineProvider>,
  )
  expect(
    screen
      .getByRole('button', { name: 'Hide accounts below 100% expected value' })
      .hasAttribute('disabled'),
  ).toBe(true)
  expect(
    screen
      .getByRole('button', { name: /^(Show|Hide) balances$/ })
      .hasAttribute('disabled'),
  ).toBe(false)
})
