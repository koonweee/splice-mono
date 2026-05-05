import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginCard } from './LoginCard'

const mocks = vi.hoisted(() => ({
  startGoogleLogin: vi.fn(),
}))

vi.mock('../lib/auth', () => ({
  startGoogleLogin: mocks.startGoogleLogin,
}))

function renderLoginCard(redirect?: string) {
  return render(
    <MantineProvider>
      <LoginCard redirect={redirect} />
    </MantineProvider>,
  )
}

describe('LoginCard', () => {
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
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders a single Google login button without password fields', () => {
    renderLoginCard()

    expect(
      screen.getByRole('button', { name: /continue with google/i }),
    ).toBeTruthy()
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByLabelText(/email/i)).toBeNull()
    expect(screen.queryByLabelText(/password/i)).toBeNull()
  })

  it('starts Google OAuth with the requested redirect', () => {
    renderLoginCard('/transactions?flow=credit')

    fireEvent.click(
      screen.getByRole('button', { name: /continue with google/i }),
    )

    expect(mocks.startGoogleLogin).toHaveBeenCalledWith(
      '/transactions?flow=credit',
    )
  })
})
