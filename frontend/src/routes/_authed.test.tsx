import { describe, expect, it, vi } from 'vitest'
import { ConfirmedLoggedOutError, TransientAuthError } from '../lib/session-refresh'
import { requireAuthedSession } from './_authed'

vi.mock('@tanstack/react-router', () => ({
  Link: () => null,
  Outlet: () => null,
  createFileRoute: () => (config: unknown) => config,
  redirect: (options: unknown) => {
    const error = new Error('redirect')
    Object.assign(error, { options })
    throw error
  },
  useLocation: () => ({ pathname: '/home' }),
}))

describe('requireAuthedSession', () => {
  const location = {
    pathname: '/transactions',
    href: '/transactions?page=1#row',
  }

  it('allows the route when the session query succeeds', async () => {
    const queryClient = {
      ensureQueryData: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }),
    }

    await expect(
      requireAuthedSession({ location, queryClient }),
    ).resolves.toBeUndefined()

    expect(queryClient.ensureQueryData).toHaveBeenCalledTimes(1)
  })

  it('redirects only for confirmed logged-out failures', async () => {
    const queryClient = {
      ensureQueryData: vi.fn().mockRejectedValue(new ConfirmedLoggedOutError()),
    }

    await expect(
      requireAuthedSession({ location, queryClient }),
    ).rejects.toMatchObject({
      options: {
        to: '/',
        search: {
          login: true,
          redirect: '/transactions?page=1#row',
        },
      },
    })
  })

  it('lets transient session failures surface instead of redirecting to login', async () => {
    const error = new TransientAuthError()
    const queryClient = {
      ensureQueryData: vi.fn().mockRejectedValue(error),
    }

    await expect(
      requireAuthedSession({ location, queryClient }),
    ).rejects.toBe(error)
  })
})
