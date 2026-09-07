import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import {
  PresentationProvider,
  readPresentationCookies,
  usePresentationPreferences,
} from './presentation-preferences'
import { encodeAppearance } from './appearance-preferences'
import type { AppearanceMode } from './design-system/appearance'
import type { User } from '../api/models/user'

vi.mock('@tanstack/react-start', () => ({
  createIsomorphicFn: () => ({
    server: () => ({ client: (fn: unknown) => fn }),
  }),
}))
afterEach(cleanup)
const now = new Date('2026-09-06T02:00:00Z')
const user = (mode: AppearanceMode = 'dark') =>
  ({
    settings: {
      appearance: { mode, accent: '#b399cf' },
      timezone: 'America/Los_Angeles',
    },
  }) as User
function Sample() {
  const { maskBalances, setMaskBalances } = usePresentationPreferences()
  return (
    <button onClick={() => setMaskBalances(!maskBalances)}>
      {maskBalances ? 'Hidden' : '$123'}
    </button>
  )
}
describe('presentation preferences before hydration', () => {
  it.each(['light', 'dark', 'oled'] as const)(
    'uses saved %s instead of a stale browser theme',
    (mode) => {
      expect(
        readPresentationCookies(
          `splice_appearance=${encodeAppearance({ mode: 'light', accent: null })}`,
          user(mode),
          now,
        ),
      ).toEqual({
        appearance: { mode, accent: '#b399cf' },
        maskBalances: null,
        today: '2026-09-05',
      })
    },
  )
  it('validates cookies and defaults unknown masking to masked SSR HTML', () => {
    const initial = readPresentationCookies(
      'splice_appearance=bogus; splice_mask_balances=bogus',
      null,
      now,
    )
    expect(initial.appearance).toEqual({ mode: 'dark', accent: '#83b59b' })
    const html = renderToString(
      <PresentationProvider initial={initial}>
        <Sample />
      </PresentationProvider>,
    )
    expect(html).toContain('Hidden')
    expect(html).not.toContain('$123')
  })
  it('migrates hidden localStorage and mirrors toggles into the SSR cookie', () => {
    const storage = new Map([['splice:home-balances-hidden', 'true']])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    })
    render(
      <PresentationProvider initial={readPresentationCookies('', null, now)}>
        <Sample />
      </PresentationProvider>,
    )
    expect(screen.getByText('Hidden')).toBeTruthy()
    expect(document.cookie).toContain('splice_mask_balances=1')
    act(() => screen.getByRole('button').click())
    expect(screen.getByText('$123')).toBeTruthy()
    expect(document.cookie).toContain('splice_mask_balances=0')
    expect(storage.get('splice:home-balances-hidden')).toBe('false')
    vi.unstubAllGlobals()
  })
})
