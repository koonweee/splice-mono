import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ConfirmedLoggedOutError,
  TransientAuthError,
} from '../lib/session-refresh'
import { LandingPage } from './index'
import type { ReactNode } from 'react'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useSearch: vi.fn(),
  useSession: vi.fn(),
  refetch: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode
    to: string
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  createFileRoute: () => (config: unknown) => config,
  useNavigate: () => mocks.navigate,
  useSearch: () => mocks.useSearch(),
}))

vi.mock('../lib/session', () => ({
  useSession: () => mocks.useSession(),
}))

vi.mock('../components/LoginCard', () => ({
  LoginCard: ({ redirect }: { redirect?: string }) => (
    <div data-testid="login-card">{redirect}</div>
  ),
}))

describe('LandingPage', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      writable: true,
    })
    mocks.navigate.mockReset()
    mocks.useSearch.mockReset()
    mocks.useSession.mockReset()
    mocks.refetch.mockReset()
    mocks.useSearch.mockReturnValue({})
    mocks.refetch.mockResolvedValue({})
  })

  afterEach(() => {
    cleanup()
  })

  it('shows app entry when the session query succeeds', () => {
    mocks.useSession.mockReturnValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
      isPending: false,
      error: null,
      refetch: mocks.refetch,
    })

    renderLandingPage()

    expect(
      screen.getByRole('link', { name: /enter splice/i }).getAttribute('href'),
    ).toBe('/home')
  })

  it('shows login only after confirmed logged-out state', () => {
    mocks.useSearch.mockReturnValue({ login: true, redirect: '/transactions' })
    mocks.useSession.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new ConfirmedLoggedOutError(),
      refetch: mocks.refetch,
    })

    renderLandingPage()

    expect(screen.getByTestId('login-card').textContent).toBe('/transactions')
  })

  it('does not show login while session is still unknown', () => {
    mocks.useSearch.mockReturnValue({ login: true })
    mocks.useSession.mockReturnValue({
      data: undefined,
      isPending: true,
      error: null,
      refetch: mocks.refetch,
    })

    renderLandingPage()

    expect(screen.queryByTestId('login-card')).toBeNull()
    expect(
      screen.getByRole('button', { name: /checking session/i }),
    ).not.toBeNull()
  })

  it('offers retry instead of login for transient session errors', () => {
    mocks.useSession.mockReturnValue({
      data: undefined,
      isPending: false,
      error: new TransientAuthError(),
      refetch: mocks.refetch,
    })

    renderLandingPage()

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(screen.queryByTestId('login-card')).toBeNull()
    expect(mocks.refetch).toHaveBeenCalledTimes(1)
  })
})

function renderLandingPage() {
  return render(
    <MantineProvider>
      <LandingPage />
    </MantineProvider>,
  )
}
