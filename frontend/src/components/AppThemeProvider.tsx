import { MantineProvider } from '@mantine/core'
import { useEffect, useLayoutEffect, useState } from 'react'
import { designVariables } from '../lib/design-system/variables'
import {
  DEFAULT_APPEARANCE,
  parseAppearance,
  resolveAppearance,
} from '../lib/design-system/appearance'
import {
  APPEARANCE_CHANGE_EVENT,
  APPEARANCE_COOKIE,
  APPEARANCE_STORAGE_KEY,
  applyAppearance,
  decodeAppearance,
  encodeAppearance,
  readStoredAppearance,
  writeAppearanceCookie,
} from '../lib/appearance-preferences'
import type { AppearancePreference } from '../lib/design-system/appearance'
import type { ReactNode } from 'react'

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

export function AppThemeProvider({
  children,
  initialAppearance = DEFAULT_APPEARANCE,
  authenticated = false,
}: {
  children: ReactNode
  initialAppearance?: AppearancePreference
  authenticated?: boolean
}) {
  const [appearance, setAppearance] = useState(initialAppearance)
  const resolved = resolveAppearance(appearance)
  const initialKey = encodeAppearance(initialAppearance)
  useIsomorphicLayoutEffect(() => {
    const handlePreview = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const value = parseAppearance(event.detail)
      if (value) setAppearance(value)
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== APPEARANCE_STORAGE_KEY) return
      const value = decodeAppearance(event.newValue) ?? DEFAULT_APPEARANCE
      setAppearance(value)
      writeAppearanceCookie(value)
    }
    window.addEventListener(APPEARANCE_CHANGE_EVENT, handlePreview)
    window.addEventListener('storage', handleStorage)
    if (authenticated)
      applyAppearance(decodeAppearance(initialKey) ?? DEFAULT_APPEARANCE)
    else if (
      !document.cookie
        .split(';')
        .some((entry) => entry.trim().startsWith(`${APPEARANCE_COOKIE}=`))
    )
      applyAppearance(readStoredAppearance())
    return () => {
      window.removeEventListener(APPEARANCE_CHANGE_EVENT, handlePreview)
      window.removeEventListener('storage', handleStorage)
    }
  }, [authenticated, initialKey])
  useIsomorphicLayoutEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved.colors.canvas)
  }, [resolved.colors.canvas])
  return (
    <MantineProvider
      cssVariablesResolver={designVariables}
      defaultColorScheme={resolved.colorScheme}
      forceColorScheme={resolved.colorScheme}
      theme={resolved.theme}
    >
      {children}
    </MantineProvider>
  )
}
