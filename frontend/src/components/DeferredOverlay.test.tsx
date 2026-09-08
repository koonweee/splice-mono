import { MantineProvider } from '@mantine/core'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { lazy, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorModal } from './forms/EditorModal'
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
        <DeferredOverlay skeleton={null} label="Add account" onClose={onClose}>
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
          skeleton={null}
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
        <DeferredOverlay
          skeleton={null}
          label="Edit holdings"
          onClose={onClose}
          size="lg"
        >
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
  it('restores the opener after the pending modal is replaced by its loaded editor', async () => {
    function Editor({ onClose }: { onClose: () => void }) {
      return (
        <EditorModal opened onClose={onClose} title="Edit example">
          <input aria-label="Draft" />
        </EditorModal>
      )
    }
    let release: (module: { default: typeof Editor }) => void = () => {}
    const LazyEditor = lazy(
      () =>
        new Promise<{ default: typeof Editor }>((resolve) => {
          release = resolve
        }),
    )
    function Example() {
      const [opened, setOpened] = useState(false)
      return (
        <>
          <button onClick={() => setOpened(true)}>Open editor</button>
          {opened && (
            <DeferredOverlay
              label="Edit example"
              skeleton={null}
              onClose={() => setOpened(false)}
            >
              <LazyEditor onClose={() => setOpened(false)} />
            </DeferredOverlay>
          )}
        </>
      )
    }
    render(
      <MantineProvider>
        <Example />
      </MantineProvider>,
    )
    const opener = screen.getByRole('button', { name: 'Open editor' })
    opener.focus()
    fireEvent.click(opener)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())
    await act(() => {
      release({ default: Editor })
    })
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Draft' })).toBeTruthy(),
    )
    screen.getByRole<HTMLElement>('textbox', { name: 'Draft' }).focus()
    fireEvent.click(screen.getByRole('button', { name: 'Close editor' }))
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
})
