import { MantineProvider } from '@mantine/core'
import { useEffect, useLayoutEffect, useState } from 'react'
import {
  DEFAULT_THEME_PRESET_ID,
  THEME_CHANGE_EVENT,
  getThemePreset,
  readStoredThemePresetId,
} from '../lib/theme'
import type { ThemePresetId } from '../lib/theme'
import type { ReactNode } from 'react'

const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [themePresetId, setThemePresetId] = useState<ThemePresetId>(
    DEFAULT_THEME_PRESET_ID,
  )
  const preset = getThemePreset(themePresetId)

  useIsomorphicLayoutEffect(() => {
    const handleThemeChange = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.theme) {
        setThemePresetId(getThemePreset(event.detail.theme).id)
        return
      }

      setThemePresetId(readStoredThemePresetId())
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    window.addEventListener('storage', handleThemeChange)
    setThemePresetId(readStoredThemePresetId())

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
      window.removeEventListener('storage', handleThemeChange)
    }
  }, [])

  useIsomorphicLayoutEffect(() => {
    if (themePresetId === readStoredThemePresetId()) {
      document.documentElement.removeAttribute('data-splice-theme-loading')
    }
  }, [themePresetId])

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
