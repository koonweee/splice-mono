import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Plus } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageActions } from './PageActions'
import { PageLayout, PageToolbar } from './PageLayout'
import { SettingsToolbar } from './settings/SettingsToolbar'

const viewport = vi.hoisted(() => ({ compact: true }))
vi.mock('../lib/responsive', () => ({
  useCompactLayout: () => viewport.compact,
}))
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})
afterEach(cleanup)

describe('PageActions', () => {
  it('removes nested section actions and filters when the section unmounts', () => {
    viewport.compact = true
    const invoked = vi.fn()
    const view = (section: boolean) => (
      <MantineProvider>
        <PageLayout title="Settings">
          {section ? (
            <>
              <SettingsToolbar
                title="Categories"
                description="Manage categories"
                addLabel="Add category"
                onAdd={invoked}
              />
              <PageToolbar section>
                <input aria-label="Search categories" />
              </PageToolbar>
            </>
          ) : (
            <p>General settings</p>
          )}
        </PageLayout>
      </MantineProvider>
    )
    const { rerender } = render(view(true))
    expect(
      screen.getAllByRole('button', { name: 'Add category' }),
    ).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Add category' }))
    expect(invoked).toHaveBeenCalledTimes(1)
    expect(
      screen.getByRole('textbox', { name: 'Search categories' }),
    ).toBeTruthy()
    rerender(view(false))
    expect(screen.queryByRole('button', { name: 'Add category' })).toBeNull()
    expect(
      screen.queryByRole('textbox', { name: 'Search categories' }),
    ).toBeNull()
    expect(screen.getByText('General settings')).toBeTruthy()
  })
  it.each([true, false])(
    'keeps overflow actions available with a bounded visible set (compact=%s)',
    async (compact) => {
      viewport.compact = compact
      const invoked = vi.fn()
      render(
        <MantineProvider>
          <PageActions
            primary={{
              id: 'add',
              label: 'Add account',
              icon: Plus,
              onClick: invoked,
            }}
            secondary={[
              { id: 'sync', label: 'Sync all', icon: Plus, onClick: invoked },
              {
                id: 'backfill',
                label: 'Backfill',
                icon: Plus,
                onClick: invoked,
              },
              { id: 'export', label: 'Export', icon: Plus, onClick: invoked },
            ]}
          />
        </MantineProvider>,
      )
      expect(
        screen.getByRole('button', { name: 'Add account' }).textContent,
      ).toBe(compact ? '' : 'Add account')
      expect(Boolean(screen.queryByRole('button', { name: 'Sync all' }))).toBe(
        !compact,
      )
      expect(screen.queryByRole('button', { name: 'Backfill' })).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'More page actions' }))
      const backfill = await screen.findByRole('menuitem', { name: 'Backfill' })
      fireEvent.click(backfill)
      expect(invoked).toHaveBeenCalledTimes(1)
    },
  )
  it.each([true, false])(
    'shows a lone overflow action directly (compact=%s)',
    (compact) => {
      viewport.compact = compact
      const invoked = vi.fn()
      const prepare = vi.fn()
      const secondary = [
        ...(compact
          ? []
          : [{ id: 'sync', label: 'Sync all', icon: Plus, onClick: vi.fn() }]),
        {
          id: 'bulk',
          label: 'Bulk edit',
          icon: Plus,
          onClick: invoked,
          onPrepare: prepare,
        },
      ]
      const view = (disabled = false) => (
        <MantineProvider>
          <PageActions
            primary={{ id: 'add', label: 'Add', icon: Plus, onClick: vi.fn() }}
            secondary={secondary.map((action) => ({ ...action, disabled }))}
          />
        </MantineProvider>
      )
      const { rerender } = render(view())
      expect(
        screen.queryByRole('button', { name: 'More page actions' }),
      ).toBeNull()
      const action = screen.getByRole('button', { name: 'Bulk edit' })
      expect(action.textContent).toBe(compact ? '' : 'Bulk edit')
      fireEvent.focus(action)
      expect(prepare).toHaveBeenCalledTimes(1)
      fireEvent.click(action)
      expect(invoked).toHaveBeenCalledTimes(1)
      rerender(view(true))
      fireEvent.click(screen.getByRole('button', { name: 'Bulk edit' }))
      expect(invoked).toHaveBeenCalledTimes(1)
    },
  )
  it('promotes the first secondary action and keeps pending overflow disabled', async () => {
    viewport.compact = true
    const invoked = vi.fn()
    render(
      <MantineProvider>
        <PageActions
          secondary={[
            { id: 'audit', label: 'Audit', icon: Plus, onClick: invoked },
            {
              id: 'sync',
              label: 'Syncing',
              icon: Plus,
              onClick: invoked,
              loading: true,
            },
            { id: 'export', label: 'Export', icon: Plus, onClick: invoked },
          ]}
        />
      </MantineProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Audit' }))
    expect(invoked).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'More page actions' }))
    const item = await screen.findByRole('menuitem', { name: /Syncing/ })
    expect(item.getAttribute('data-disabled')).not.toBeNull()
    fireEvent.click(item)
    expect(invoked).toHaveBeenCalledTimes(1)
  })
})
