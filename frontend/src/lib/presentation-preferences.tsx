import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { createIsomorphicFn } from '@tanstack/react-start'
import {
  APPEARANCE_COOKIE,
  decodeAppearance,
  normalizeAppearance,
} from './appearance-preferences'
import type { AppearancePreference } from './design-system/appearance'
import type { ReactNode } from 'react'
import type { User } from '../api/models/user'

export const MASK_COOKIE = 'splice_mask_balances'
export const HOME_BALANCES_HIDDEN_STORAGE_KEY = 'splice:home-balances-hidden'
export interface PresentationPreferences {
  appearance: AppearancePreference
  maskBalances: boolean | null
  today: string
}

export function readPresentationCookies(
  cookie: string,
  user?: User | null,
  now = new Date(),
): PresentationPreferences {
  const entries = new Map(
    cookie.split(';').map((part) => {
      const [key, ...value] = part.trim().split('=')
      return [key, value.join('=')]
    }),
  )
  let today: string
  try {
    today = new Intl.DateTimeFormat('en-CA', {
      timeZone: user?.settings.timezone ?? 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    today = now.toISOString().slice(0, 10)
  }
  return {
    appearance: user
      ? normalizeAppearance(user.settings.appearance)
      : normalizeAppearance(decodeAppearance(entries.get(APPEARANCE_COOKIE))),
    maskBalances:
      entries.get(MASK_COOKIE) === '1'
        ? true
        : entries.get(MASK_COOKIE) === '0'
          ? false
          : null,
    today,
  }
}

export const getPresentationPreferences = createIsomorphicFn()
  .server(async (user?: User | null) => {
    const { getRequestHeader } = await import('@tanstack/react-start/server')
    return readPresentationCookies(getRequestHeader('cookie') ?? '', user)
  })
  .client(async (user?: User | null) =>
    readPresentationCookies(document.cookie, user),
  )

export function writePreferenceCookie(name: typeof MASK_COOKIE, value: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
}

const PresentationContext = createContext({
  maskBalances: true,
  setMaskBalances: (_value: boolean | ((value: boolean) => boolean)) => {},
  today: '',
  reconcileDate: (_timezone: string): boolean => false,
})

export function PresentationProvider({
  initial,
  children,
}: {
  initial: PresentationPreferences
  children: ReactNode
}) {
  const [today, setToday] = useState(initial.today)
  const currentDay = useRef(today)
  const [initialDay, setInitialDay] = useState(initial.today)
  if (initial.today && initialDay !== initial.today) {
    setInitialDay(initial.today)
    setToday(initial.today)
    currentDay.current = initial.today
  }
  const reconcileDate = useCallback((timezone: string) => {
    let next: string
    try {
      next = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
    } catch {
      next = new Date().toISOString().slice(0, 10)
    }
    if (next === currentDay.current) return false
    currentDay.current = next
    setToday(next)
    return true
  }, [])
  // Unknown legacy preferences must mask every monetary surface until migration.
  const [maskBalances, setMasked] = useState(initial.maskBalances ?? true)
  const [initialMask, setInitialMask] = useState(initial.maskBalances)
  if (initialMask !== initial.maskBalances) {
    setInitialMask(initial.maskBalances)
    if (initial.maskBalances !== null) setMasked(initial.maskBalances)
  }
  useEffect(() => {
    if (initial.maskBalances === null) {
      let hidden = false
      try {
        hidden =
          window.localStorage.getItem(HOME_BALANCES_HIDDEN_STORAGE_KEY) ===
          'true'
      } catch {
        /* use existing default */
      }
      setMasked(hidden)
      writePreferenceCookie(MASK_COOKIE, hidden ? '1' : '0')
    }
    const sync = (event: StorageEvent) => {
      if (event.key === HOME_BALANCES_HIDDEN_STORAGE_KEY) {
        const hidden = event.newValue === 'true'
        setMasked(hidden)
        writePreferenceCookie(MASK_COOKIE, hidden ? '1' : '0')
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [initial.maskBalances])
  const setMaskBalances = (value: boolean | ((value: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(maskBalances) : value
    setMasked(next)
    writePreferenceCookie(MASK_COOKIE, next ? '1' : '0')
    try {
      window.localStorage.setItem(
        HOME_BALANCES_HIDDEN_STORAGE_KEY,
        JSON.stringify(next),
      )
    } catch {
      /* cookie remains authoritative */
    }
  }
  return (
    <PresentationContext.Provider
      value={{ maskBalances, setMaskBalances, today, reconcileDate }}
    >
      {children}
    </PresentationContext.Provider>
  )
}

export const usePresentationPreferences = () => useContext(PresentationContext)
