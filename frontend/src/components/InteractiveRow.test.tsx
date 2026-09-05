import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InteractiveRow } from './InteractiveRow'

afterEach(cleanup)

describe('InteractiveRow', () => {
  it('opens from row content or its primary button while keeping other controls independent', () => {
    const onActivate = vi.fn()
    const onSecondary = vi.fn()
    render(
      <InteractiveRow actionLabel="Open account" onActivate={onActivate}>
        <span>Checking</span>
        <button onClick={onSecondary}>Show change</button>
        <label>
          <input type="checkbox" />
          Select account
        </label>
        <a href="#details">Related details</a>
      </InteractiveRow>,
    )

    const action = screen.getByRole('button', { name: 'Open account' })
    const secondary = screen.getByRole('button', { name: 'Show change' })
    expect(action.contains(secondary)).toBe(false)
    fireEvent.click(secondary)
    fireEvent.click(screen.getByText('Select account'))
    fireEvent.click(screen.getByRole('link'))
    expect(onSecondary).toHaveBeenCalledOnce()
    expect(onActivate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Checking'))
    fireEvent.click(action)
    expect(onActivate).toHaveBeenCalledTimes(2)
  })

  it('shows keyboard feedback only for the primary action', () => {
    render(
      <InteractiveRow actionLabel="Open account" onActivate={vi.fn()}>
        <button>Show change</button>
      </InteractiveRow>,
    )
    const action = screen.getByRole('button', { name: 'Open account' })
    const row = action.parentElement
    fireEvent.keyDown(screen.getByRole('button', { name: 'Show change' }), {
      key: ' ',
    })
    expect(row?.getAttribute('data-pressed')).toBeNull()
    fireEvent.keyDown(action, { key: ' ' })
    expect(row?.getAttribute('data-pressed')).toBe('true')
    fireEvent.keyUp(action, { key: ' ' })
    expect(row?.getAttribute('data-pressed')).toBeNull()
  })

  it('does not create a focusable row action without an activation handler', () => {
    render(<InteractiveRow actionLabel="Open account">Checking</InteractiveRow>)
    expect(screen.getByText('Checking')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
