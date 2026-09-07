import { Button, MantineProvider, Modal, TextInput } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { useState } from 'react'
import { Archive, Pencil } from 'lucide-react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsRowActions } from './SettingsRowActions'

let touch = true
beforeEach(() => {
  touch = true
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: touch && query.includes('any-pointer'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
})
afterEach(cleanup)

describe('SettingsRowActions', () => {
  it.each([true, false])(
    'dispatches the same row action with touch=%s',
    async (compact) => {
      touch = compact
      const edit = vi.fn()
      render(
        <MantineProvider>
          <SettingsRowActions
            label="Actions for groceries"
            actions={[
              {
                id: 'edit',
                label: 'Edit groceries',
                icon: Pencil,
                onClick: edit,
              },
              {
                id: 'archive',
                label: 'Archive groceries',
                icon: Archive,
                onClick: vi.fn(),
              },
            ]}
          />
        </MantineProvider>,
      )
      if (compact)
        fireEvent.click(
          screen.getByRole('button', { name: 'Actions for groceries' }),
        )
      fireEvent.click(
        await screen.findByRole(compact ? 'menuitem' : 'button', {
          name: 'Edit groceries',
        }),
      )
      expect(edit).toHaveBeenCalledTimes(1)
      if (compact)
        await waitFor(() =>
          expect(
            screen.queryByRole('menuitem', { name: 'Edit groceries' }),
          ).toBeNull(),
        )
    },
  )
  it('hands focus to an editor and returns it to the row when closed', async () => {
    function Example() {
      const [opened, setOpened] = useState(false)
      return (
        <>
          <SettingsRowActions
            label="Actions for groceries"
            actions={[
              {
                id: 'edit',
                label: 'Edit groceries',
                icon: Pencil,
                onClick: () => setOpened(true),
              },
              {
                id: 'archive',
                label: 'Archive groceries',
                icon: Archive,
                onClick: vi.fn(),
              },
            ]}
          />
          <Modal
            opened={opened}
            onClose={() => setOpened(false)}
            title="Edit groceries"
          >
            <TextInput label="Rule name" data-autofocus />
            <Button onClick={() => setOpened(false)}>Cancel edit</Button>
          </Modal>
        </>
      )
    }
    render(
      <MantineProvider env="test">
        <Example />
      </MantineProvider>,
    )
    const trigger = screen.getByRole('button', {
      name: 'Actions for groceries',
    })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Edit groceries' }),
    )
    await waitFor(() =>
      expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }))
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })
  it('promotes a lone action and preserves disabled state', () => {
    const edit = vi.fn()
    render(
      <MantineProvider>
        <SettingsRowActions
          label="Matching window actions"
          actions={[
            {
              id: 'edit',
              label: 'Edit matching window',
              icon: Pencil,
              onClick: edit,
              disabled: true,
            },
          ]}
        />
      </MantineProvider>,
    )
    expect(
      screen.queryByRole('button', { name: 'Matching window actions' }),
    ).toBeNull()
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit matching window' }),
    )
    expect(edit).not.toHaveBeenCalled()
  })
  it('keeps disabled menu actions from dispatching', async () => {
    const archive = vi.fn()
    render(
      <MantineProvider>
        <SettingsRowActions
          label="Actions for groceries"
          actions={[
            {
              id: 'edit',
              label: 'Edit groceries',
              icon: Pencil,
              onClick: vi.fn(),
            },
            {
              id: 'archive',
              label: 'Archive groceries',
              icon: Archive,
              onClick: archive,
              disabled: true,
            },
          ]}
        />
      </MantineProvider>,
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Actions for groceries' }),
    )
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Archive groceries' }),
    )
    expect(archive).not.toHaveBeenCalled()
  })
})
