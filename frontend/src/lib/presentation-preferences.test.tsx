import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import {
  PresentationProvider,
  readPresentationCookies,
  usePresentationPreferences,
} from './presentation-preferences'
import type { User } from '../api/models/user'

vi.mock('@tanstack/react-start', () => ({
  createIsomorphicFn: () => ({
    server: () => ({ client: (fn: unknown) => fn }),
  }),
}))
afterEach(cleanup)
const now = new Date('2026-09-06T02:00:00Z')
const user = (theme = 'dracula') =>
  ({ settings: { theme, timezone: 'America/Los_Angeles' } }) as User
function Sample() {
  const { maskBalances, setMaskBalances } = usePresentationPreferences()
  return (
    <button onClick={() => setMaskBalances(!maskBalances)}>
      {maskBalances ? 'Hidden' : '$123'}
    </button>
  )
}
describe('presentation preferences before hydration', () => {
  it.each(['splice-light', 'splice-dark', 'dracula', 'oled-black'])(
    'uses saved %s instead of a stale browser theme',
    (theme) => {
      expect(
        readPresentationCookies('splice_theme=splice-light', user(theme), now),
      ).toEqual({ theme, maskBalances: null, today: '2026-09-05' })
    },
  )
  it('validates cookies and defaults unknown masking to masked SSR HTML', () => {
    const initial = readPresentationCookies(
      'splice_theme=bogus; splice_mask_balances=bogus',
      null,
      now,
    )
    expect(initial.theme).toBe('splice-dark')
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
