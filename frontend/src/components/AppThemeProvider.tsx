import { MantineProvider } from '@mantine/core'
import { useEffect, useState } from 'react'
import {
  THEME_CHANGE_EVENT,
  getThemePreset,
  readStoredThemePresetId,
} from '../lib/theme'
import type { ThemePresetId } from '../lib/theme'
import type { ReactNode } from 'react'

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [themePresetId, setThemePresetId] = useState<ThemePresetId>(
    readStoredThemePresetId,
  )
  const preset = getThemePreset(themePresetId)

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.theme) {
        setThemePresetId(getThemePreset(event.detail.theme).id)
        return
      }

      setThemePresetId(readStoredThemePresetId())
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    window.addEventListener('storage', handleThemeChange)

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
      window.removeEventListener('storage', handleThemeChange)
    }
  }, [])

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
