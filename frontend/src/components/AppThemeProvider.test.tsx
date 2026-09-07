import { useMantineTheme } from '@mantine/core'
import { act, cleanup, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { typographyFonts } from '../lib/design-system/typography'
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
