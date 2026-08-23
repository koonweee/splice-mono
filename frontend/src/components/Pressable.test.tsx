import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pressable } from './Pressable'

afterEach(cleanup)

function createPointerEvent(
  type: string,
  {
    clientX = 0,
    clientY = 0,
    pointerId,
  }: { clientX?: number; clientY?: number; pointerId: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX,
    clientY,
  })
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: pointerId },
  })
  return event
}

describe('Pressable', () => {
  it('shows feedback while pressed and clears it on release', () => {
    const onClick = vi.fn()
    render(<Pressable onClick={onClick}>Open account</Pressable>)

    const button = screen.getByRole('button', { name: 'Open account' })
    fireEvent(
      button,
      createPointerEvent('pointerdown', {
        clientX: 20,
        clientY: 20,
        pointerId: 1,
      }),
    )
    expect(button.getAttribute('data-pressed')).toBe('true')

    fireEvent(button, createPointerEvent('pointerup', { pointerId: 1 }))
    fireEvent.click(button)

    expect(button.getAttribute('data-pressed')).toBeNull()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('cancels feedback when pointer movement becomes a scroll gesture', () => {
    render(<Pressable>Open transaction</Pressable>)

    const button = screen.getByRole('button', { name: 'Open transaction' })
    fireEvent(
      button,
      createPointerEvent('pointerdown', {
        clientX: 10,
        clientY: 10,
        pointerId: 2,
      }),
    )
    fireEvent(
      button,
      createPointerEvent('pointermove', {
        clientX: 10,
        clientY: 24,
        pointerId: 2,
      }),
    )

    expect(button.getAttribute('data-pressed')).toBeNull()
  })

  it('clears feedback when the browser cancels the pointer', () => {
    render(<Pressable>Open details</Pressable>)

    const button = screen.getByRole('button', { name: 'Open details' })
    fireEvent(button, createPointerEvent('pointerdown', { pointerId: 3 }))
    fireEvent(button, createPointerEvent('pointercancel', { pointerId: 3 }))

    expect(button.getAttribute('data-pressed')).toBeNull()
  })

  it('shows feedback for keyboard activation', () => {
    render(<Pressable>Open details</Pressable>)

    const button = screen.getByRole('button', { name: 'Open details' })
    fireEvent.keyDown(button, { key: ' ' })
    expect(button.getAttribute('data-pressed')).toBe('true')

    fireEvent.keyUp(button, { key: ' ' })
    expect(button.getAttribute('data-pressed')).toBeNull()
  })
})
