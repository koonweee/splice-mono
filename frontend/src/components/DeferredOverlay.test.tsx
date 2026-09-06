import { MantineProvider } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { lazy } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeferredOverlay } from './DeferredOverlay'
import { AnalysisAuditHeader } from './analysis/AnalysisAuditHeader'

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('deferred overlays', () => {
  it('opens a closeable modal while its editor code is pending', () => {
    const Pending = lazy(() => new Promise<never>(() => {})),
      onClose = vi.fn()
    render(
      <MantineProvider>
        <DeferredOverlay label="Add account" onClose={onClose}>
          <Pending />
        </DeferredOverlay>
      </MantineProvider>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Add account' })
    expect(
      within(dialog).getByRole('status', { name: 'Loading add account' }),
    ).toBeTruthy()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Close editor' }),
    )
    expect(onClose).toHaveBeenCalledOnce()
  })
  it('keeps the audit range and Manage rules link available while drawer code loads', () => {
    const Pending = lazy(() => new Promise<never>(() => {}))
    render(
      <MantineProvider>
        <DeferredOverlay
          label="Analysis audit"
          kind="audit"
          onClose={() => {}}
          header={
            <AnalysisAuditHeader startDate="2026-09-01" endDate="2026-09-05" />
          }
        >
          <Pending />
        </DeferredOverlay>
      </MantineProvider>,
    )
    const drawer = screen.getByRole('dialog', { name: 'Analysis audit' })
    expect(within(drawer).getByText(/Sep/)).toBeTruthy()
    expect(
      within(drawer)
        .getByRole('link', { name: 'Manage rules' })
        .getAttribute('href'),
    ).toBe('/settings?tab=analysis')
    expect(
      within(drawer).getByRole('status', { name: 'Loading analysis audit' }),
    ).toBeTruthy()
  })
  it('keeps module failure and reload inside the closeable overlay', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Failed = lazy(() => Promise.reject(new Error('Module unavailable'))),
      onClose = vi.fn()
    render(
      <MantineProvider>
        <DeferredOverlay label="Edit holdings" onClose={onClose} size="lg">
          <Failed />
        </DeferredOverlay>
      </MantineProvider>,
    )
    await waitFor(() =>
      expect(
        screen.getByRole('dialog', { name: 'Edit holdings' }).textContent,
      ).toContain('Edit holdings could not load'),
    )
    const dialog = screen.getByRole('dialog', { name: 'Edit holdings' })
    expect(within(dialog).getByRole('button', { name: 'Reload' })).toBeTruthy()
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Close editor' }),
    )
    expect(onClose).toHaveBeenCalledOnce()
  })
})
