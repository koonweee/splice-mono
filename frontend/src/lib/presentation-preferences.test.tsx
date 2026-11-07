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
        hideDiscountedAccounts: false,
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

it('reconciles midnight and timezone changes without relabeling before reconciliation', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-07T00:01:00Z'))
  function Day() {
    const { today, reconcileDate } = usePresentationPreferences()
    return (
      <>
        <span>{today}</span>
        <button onClick={() => reconcileDate('UTC')}>UTC</button>
        <button onClick={() => reconcileDate('America/Los_Angeles')}>LA</button>
      </>
    )
  }
  render(
    <PresentationProvider
      initial={readPresentationCookies(
        'splice_mask_balances=1',
        null,
        new Date('2026-09-06T23:59:00Z'),
      )}
    >
      <Day />
    </PresentationProvider>,
  )
  expect(screen.getByText('2026-09-06')).toBeTruthy()
  act(() => screen.getByText('UTC').click())
  expect(screen.getByText('2026-09-07')).toBeTruthy()
  act(() => screen.getByText('LA').click())
  expect(screen.getByText('2026-09-06')).toBeTruthy()
  vi.useRealTimers()
})

it('adopts resolved launch preferences and date before rendering children without undoing local masking', () => {
  const observations: Array<string> = []
  function Probe() {
    const { today, maskBalances, setMaskBalances } =
      usePresentationPreferences()
    observations.push(today)
    return (
      <button onClick={() => setMaskBalances(true)}>
        {today}:{String(maskBalances)}
      </button>
    )
  }
  const initial = {
    appearance: { mode: 'dark' as const, accent: null },
    today: '2026-09-08',
    maskBalances: true,
  }
  const view = render(
    <PresentationProvider initial={initial}>
      <Probe />
    </PresentationProvider>,
  )
  const resolved = { ...initial, today: '2026-09-07', maskBalances: false }
  observations.length = 0
  view.rerender(
    <PresentationProvider initial={resolved}>
      <Probe />
    </PresentationProvider>,
  )
  expect(observations.every((date) => date === '2026-09-07')).toBe(true)
  expect(screen.getByText('2026-09-07:false')).toBeTruthy()
  act(() => screen.getByRole('button').click())
  view.rerender(
    <PresentationProvider initial={{ ...resolved }}>
      <Probe />
    </PresentationProvider>,
  )
  expect(screen.getByText('2026-09-07:true')).toBeTruthy()
})

it('restores and persists discounted account visibility without changing masking', () => {
  function Filter() {
    const { hideDiscountedAccounts, setHideDiscountedAccounts, maskBalances } =
      usePresentationPreferences()
    return (
      <button onClick={() => setHideDiscountedAccounts((current) => !current)}>
        {String(hideDiscountedAccounts)}:{String(maskBalances)}
      </button>
    )
  }
  const initial = readPresentationCookies(
    'splice_hide_discounted_accounts=1; splice_mask_balances=0',
    null,
    now,
  )
  expect(initial.hideDiscountedAccounts).toBe(true)
  render(
    <PresentationProvider initial={initial}>
      <Filter />
    </PresentationProvider>,
  )
  act(() => screen.getByRole('button').click())
  expect(screen.getByText('false:false')).toBeTruthy()
  expect(document.cookie).toContain('splice_hide_discounted_accounts=0')
  expect(
    readPresentationCookies(document.cookie, null, now).hideDiscountedAccounts,
  ).toBe(false)
})
