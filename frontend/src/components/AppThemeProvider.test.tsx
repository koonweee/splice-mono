import { useMantineTheme } from '@mantine/core'
import { act, cleanup, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { typographyFonts } from '../lib/design-system/typography'
import { resolveAppearance } from '../lib/design-system/appearance'
import {
  APPEARANCE_STORAGE_KEY,
  encodeAppearance,
  previewAppearance,
} from '../lib/appearance-preferences'
import { AppThemeProvider } from './AppThemeProvider'

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
  vi.stubGlobal('localStorage', {
    getItem: () => encodeAppearance({ mode: 'light', accent: null }),
    setItem: vi.fn(),
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('server-first appearance provider', () => {
  it('follows live device changes in Auto, updates browser chrome, and cleans up without persisting a different preference', () => {
    const listeners = new Set<() => void>()
    let dark = false
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn((query: string) => ({
        get matches() {
          return query === '(prefers-color-scheme: dark)' && dark
        },
        addEventListener: (_event: string, listener: () => void) => {
          if (query === '(prefers-color-scheme: dark)') listeners.add(listener)
        },
        removeEventListener: (_event: string, listener: () => void) => {
          listeners.delete(listener)
        },
      })),
    })
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
    const preference = {
      mode: 'auto' as const,
      accent: '#83b59b',
      accents: { light: '#ce9a7e', dark: '#b399cf' },
    }
    function Probe() {
      const theme = useMantineTheme()
      return (
        <output data-testid="canvas">
          {theme.other.splice['--splice-canvas']}
        </output>
      )
    }
    const view = render(
      <AppThemeProvider
        initialAppearance={preference}
        restoreStoredAppearance={false}
      >
        <Probe />
      </AppThemeProvider>,
    )
    expect(document.documentElement.dataset.mantineColorScheme).toBe('light')
    expect(screen.getByTestId('canvas').textContent).toBe(
      resolveAppearance(preference, 'light').colors.canvas,
    )
    act(() => {
      dark = true
      listeners.forEach((listener) => listener())
    })
    expect(document.documentElement.dataset.mantineColorScheme).toBe('dark')
    expect(meta.content).toBe(
      resolveAppearance(preference, 'dark').colors.canvas,
    )
    expect(localStorage.setItem).not.toHaveBeenCalled()
    act(() => previewAppearance({ ...preference, mode: 'oled' }))
    act(() => {
      dark = false
      listeners.forEach((listener) => listener())
    })
    expect(screen.getByTestId('canvas').textContent).toBe('#000000')
    act(() => previewAppearance(preference))
    expect(document.documentElement.dataset.mantineColorScheme).toBe('light')
    view.unmount()
    expect(listeners.size).toBe(0)
    meta.remove()
  })
  it('renders the saved amount font on the server and updates it on preview and cross-tab saves', () => {
    const preference = {
      mode: 'dark' as const,
      accent: null,
      monospaceAmounts: true,
    }
    function FontProbe() {
      const theme = useMantineTheme()
      return (
        <output data-testid="amount-font">
          {theme.other.splice['--splice-font-amount']}
        </output>
      )
    }
    const content = (
      <AppThemeProvider authenticated initialAppearance={preference}>
        <FontProbe />
      </AppThemeProvider>
    )
    expect(renderToString(content)).toContain(typographyFonts.mono)
    render(content)
    expect(screen.getByTestId('amount-font').textContent).toBe(
      typographyFonts.mono,
    )
    act(() => previewAppearance({ ...preference, monospaceAmounts: false }))
    expect(screen.getByTestId('amount-font').textContent).toBe(
      typographyFonts.body,
    )
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: APPEARANCE_STORAGE_KEY,
          newValue: encodeAppearance(preference),
        }),
      ),
    )
    expect(screen.getByTestId('amount-font').textContent).toBe(
      typographyFonts.mono,
    )
  })
  it('includes the resolved OLED canvas in server markup', () => {
    const html = renderToString(
      <AppThemeProvider
        initialAppearance={{ mode: 'oled', accent: '#abcdef' }}
        authenticated
      >
        <div>Content</div>
      </AppThemeProvider>,
    )
    expect(html).toMatch(/--mantine-color-body:\s*#000000/)
    expect(html).toMatch(/--splice-header:\s*#000000/)
  })
  it('prefers authenticated appearance over stale browser storage and adopts account changes', () => {
    const view = render(
      <AppThemeProvider
        authenticated
        initialAppearance={{ mode: 'oled', accent: '#abcdef' }}
      >
        <div />
      </AppThemeProvider>,
    )
    expect(document.documentElement.dataset.mantineColorScheme).toBe('dark')
    view.rerender(
      <AppThemeProvider
        authenticated
        initialAppearance={{ mode: 'light', accent: null }}
      >
        <div />
      </AppThemeProvider>,
    )
    expect(document.documentElement.dataset.mantineColorScheme).toBe('light')
  })
  it('supports draft preview and cross-tab saved changes', () => {
    render(
      <AppThemeProvider
        authenticated
        initialAppearance={{ mode: 'dark', accent: '#83b59b' }}
      >
        <div />
      </AppThemeProvider>,
    )
    act(() => previewAppearance({ mode: 'light', accent: null }))
    expect(document.documentElement.dataset.mantineColorScheme).toBe('light')
    act(() =>
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: APPEARANCE_STORAGE_KEY,
          newValue: encodeAppearance({ mode: 'oled', accent: null }),
        }),
      ),
    )
    expect(document.documentElement.dataset.mantineColorScheme).toBe('dark')
  })
})

it('adopts snapshot appearance without migrating unrelated storage during local launch', () => {
  document.cookie = 'splice_appearance=; Max-Age=0; Path=/'
  const view = render(
    <AppThemeProvider
      restoreStoredAppearance={false}
      initialAppearance={{ mode: 'dark', accent: null }}
    >
      <div />
    </AppThemeProvider>,
  )
  expect(document.cookie).not.toContain('splice_appearance=')
  view.rerender(
    <AppThemeProvider
      restoreStoredAppearance={false}
      initialAppearance={{ mode: 'light', accent: null }}
    >
      <div />
    </AppThemeProvider>,
  )
  expect(document.documentElement.dataset.mantineColorScheme).toBe('light')
  expect(document.cookie).not.toContain('splice_appearance=')
})
