import { act, cleanup, render } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
