import { MantineProvider } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmActionDialog } from './ConfirmActionDialog'
import type { ConfirmActionDialogProps } from './ConfirmActionDialog'

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
  })
})

afterEach(cleanup)

function renderConfirmation(overrides: Partial<ConfirmActionDialogProps> = {}) {
  const props = {
    opened: true,
    title: 'Delete transaction',
    targetLabel: 'Rent',
    consequence: 'This transaction will be permanently removed.',
    confirmLabel: 'Delete',
    onConfirm: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  return {
    props,
    ...render(
      <MantineProvider>
        <ConfirmActionDialog {...props} />
      </MantineProvider>,
    ),
  }
}

describe('ConfirmActionDialog', () => {
  it('names the target and consequence, focuses Cancel, and waits for explicit confirmation', async () => {
    const { props } = renderConfirmation()
    const dialog = screen.getByRole('dialog', { name: 'Delete transaction' })
    expect(within(dialog).getByText('Rent')).toBeTruthy()
    expect(within(dialog).getByText(/permanently removed/)).toBeTruthy()
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole('button', { name: 'Cancel' }),
      ),
    )
    expect(props.onConfirm).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('allows Escape before submission', () => {
    const { props } = renderConfirmation()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), {
      key: 'Escape',
    })
    expect(props.onClose).toHaveBeenCalledOnce()
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('blocks confirmation and dismissal while pending', () => {
    const { props } = renderConfirmation({ isPending: true })
    for (const name of ['Delete', 'Cancel', 'Close confirmation']) {
      const button = screen.getByRole('button', { name })
      expect(button.hasAttribute('disabled')).toBe(true)
      fireEvent.click(button)
    }
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), {
      key: 'Escape',
    })
    expect(props.onClose).not.toHaveBeenCalled()
    expect(props.onConfirm).not.toHaveBeenCalled()
  })

  it('keeps a failure visible and allows retry without closing', () => {
    const { props } = renderConfirmation({
      error: 'The server is unavailable. Try again.',
    })
    expect(screen.getByRole('alert').textContent).toContain(
      'The server is unavailable.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(props.onConfirm).toHaveBeenCalledOnce()
    expect(props.onClose).not.toHaveBeenCalled()
  })
})
