import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationBell, NotificationInbox } from './NotificationInbox'
import type { NotificationInboxProps } from './NotificationInbox'

const item = {
  id: 'one',
  type: 'transactions.new_synced' as const,
  title: 'New transactions synced',
  body: '2 new transactions are ready to review.',
  createdAt: '2026-09-06T11:55:00.000Z',
  readAt: null,
  url: '/transactions',
}
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
function mount(props: Partial<NotificationInboxProps> = {}) {
  const actions = {
    onClose: vi.fn(),
    onRetry: vi.fn(),
    onDismiss: vi.fn(),
    onOpen: vi.fn(),
    onClearAll: vi.fn(),
  }
  render(
    <MantineProvider>
      <NotificationInbox
        opened
        items={[item]}
        unreadCount={1}
        {...actions}
        {...props}
      />
    </MantineProvider>,
  )
  return actions
}

describe('notification inbox', () => {
  it('keeps icon actions independent from opening the alert', () => {
    const actions = mount()
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss: New transactions synced' }),
    )
    expect(actions.onDismiss).toHaveBeenCalledWith(item)
    expect(actions.onOpen).not.toHaveBeenCalled()
    fireEvent.click(
      screen.getByRole('button', { name: 'Open New transactions synced' }),
    )
    expect(actions.onOpen).toHaveBeenCalledWith(item)
  })
  it('retains an alert and explicit retry after a failed refresh', () => {
    const actions = mount({ isError: true })
    expect(screen.getByText(item.body)).toBeTruthy()
    expect(
      screen.getByText('Previously loaded results remain visible.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(actions.onRetry).toHaveBeenCalledOnce()
  })
  it('blocks duplicate actions during a mutation and retains its failure', () => {
    mount({ pendingId: item.id, mutationError: 'Please reconnect and retry.' })
    expect(
      screen.queryByRole('button', { name: 'Open New transactions synced' }),
    ).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Dismiss: New transactions synced' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(screen.getByText('Please reconnect and retry.')).toBeTruthy()
  })
  it('clears the inbox from the sheet header and disables actions while clearing', () => {
    const actions = mount()
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear all notifications' }),
    )
    expect(actions.onClearAll).toHaveBeenCalledOnce()
    expect(actions.onOpen).not.toHaveBeenCalled()

    cleanup()
    mount({ clearing: true })
    expect(
      screen
        .getByRole('button', { name: 'Clear all notifications' })
        .hasAttribute('disabled'),
    ).toBe(true)
    expect(
      screen
        .getByRole('button', { name: 'Dismiss: New transactions synced' })
        .hasAttribute('disabled'),
    ).toBe(true)
  })
  it('announces unread count independently of any transaction badge', () => {
    render(
      <MantineProvider>
        <NotificationBell unreadCount={2} opened={false} onClick={vi.fn()} />
      </MantineProvider>,
    )
    expect(
      screen.getByRole('button', { name: 'Notifications, 2 unread' }),
    ).toBeTruthy()
  })
})
