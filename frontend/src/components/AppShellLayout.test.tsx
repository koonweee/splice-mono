import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
