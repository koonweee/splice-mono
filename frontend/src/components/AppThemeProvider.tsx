import { MantineProvider } from '@mantine/core'
import { useEffect, useLayoutEffect, useState } from 'react'
import {
  DEFAULT_THEME_PRESET_ID,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  applyThemePresetId,
  getThemePreset,
  readStoredThemePresetId,
} from '../lib/theme'
import type { ThemePresetId } from '../lib/theme'
import type { ReactNode } from 'react'

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

export function AppThemeProvider({
  children,
  initialTheme = DEFAULT_THEME_PRESET_ID,
  authenticated = false,
}: {
  children: ReactNode
  initialTheme?: ThemePresetId
  authenticated?: boolean
}) {
  const [themePresetId, setThemePresetId] =
    useState<ThemePresetId>(initialTheme)
  const preset = getThemePreset(themePresetId)

  useIsomorphicLayoutEffect(() => {
    const handleThemeChange = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== THEME_STORAGE_KEY)
        return
      if (event instanceof CustomEvent && event.detail?.theme) {
        setThemePresetId(getThemePreset(event.detail.theme).id)
        return
      }

      setThemePresetId(readStoredThemePresetId())
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    window.addEventListener('storage', handleThemeChange)
    if (authenticated) applyThemePresetId(initialTheme)
    else if (
      !document.cookie
        .split(';')
        .some((entry) => entry.trim().startsWith('splice_theme='))
    )
      applyThemePresetId(readStoredThemePresetId())

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
      window.removeEventListener('storage', handleThemeChange)
    }
  }, [authenticated, initialTheme])

  return (
    <MantineProvider
      defaultColorScheme={preset.colorScheme}
      forceColorScheme={preset.colorScheme}
      theme={preset.theme}
    >
      {children}
    </MantineProvider>
  )
}
