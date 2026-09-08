import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorModal } from './forms/EditorModal'
import { DateRangeControl } from './DateRangeControl'

function setMobileViewport(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matches && query.includes('max-width'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-12T12:00:00-07:00'))
  setMobileViewport(true)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('DateRangeControl', () => {
  it('keeps known dates visible while disabling pending page controls', () => {
    const onChange = vi.fn()
    render(
      <MantineProvider>
        <DateRangeControl
          disabled
          onChange={onChange}
          value={[new Date('2026-05-01'), new Date('2026-05-12')]}
        />
      </MantineProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Choose date range' })
    const clear = screen.getByRole('button', { name: 'Clear date range' })
    expect(trigger.hasAttribute('disabled')).toBe(true)
    expect(clear.hasAttribute('disabled')).toBe(true)
    expect(trigger.textContent).toContain('2026')
    fireEvent.click(trigger)
    fireEvent.click(clear)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each([false, true])(
    'dismisses a nested calendar without closing its editor (mobile=%s)',
    (mobile) => {
      setMobileViewport(mobile)
      const closeEditor = vi.fn()
      render(
        <MantineProvider>
          <EditorModal opened onClose={closeEditor} title="Edit account">
            <DateRangeControl onChange={() => {}} value={[null, null]} />
          </EditorModal>
        </MantineProvider>,
      )
      act(() => vi.runAllTimers())
      const trigger = screen.getByRole('button', { name: 'Choose date range' })
      fireEvent.click(trigger)
      act(() => vi.runAllTimers())
      const picker = screen.getByRole('dialog', { name: 'Date range' })
      fireEvent.focus(picker)
      fireEvent.keyDown(picker, {
        key: 'Escape',
      })
      act(() => vi.runAllTimers())
      expect(closeEditor).not.toHaveBeenCalled()
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(screen.queryByRole('dialog', { name: 'Date range' })).toBeNull()
    },
  )

  it('exposes desktop calendar dialog state on its trigger button', () => {
    setMobileViewport(false)
    const onChange = vi.fn()

    render(
      <MantineProvider>
        <DateRangeControl onChange={onChange} value={[null, null]} />
      </MantineProvider>,
    )

    const trigger = screen.getByRole('button', { name: 'Choose date range' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    act(() => vi.runAllTimers())

    const dialog = screen.getByRole('dialog', { name: 'Date range' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-controls')).toBe(dialog.id)
    fireEvent.click(screen.getByRole('button', { name: 'Apr' }))

    expect(onChange).toHaveBeenCalledWith(['2026-04-01', '2026-04-30'])
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
  })

  it('shows the complete compact range and clears it without opening the picker', () => {
    const onChange = vi.fn()

    render(
      <MantineProvider>
        <DateRangeControl
          onChange={onChange}
          value={['2026-04-01', '2026-04-30']}
        />
      </MantineProvider>,
    )

    expect(screen.getByText('Apr 1–30, 2026')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear date range' }))

    expect(onChange).toHaveBeenCalledWith([null, null])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('uses native start and end date fields in the mobile drawer', () => {
    const onChange = vi.fn()

    render(
      <MantineProvider>
        <DateRangeControl onChange={onChange} value={[null, null]} />
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Choose date range' }))
    act(() => vi.runAllTimers())

    expect(screen.getByRole('dialog', { name: 'Date range' })).toBeTruthy()
    expect(screen.getByLabelText('Start').getAttribute('type')).toBe('date')
    expect(screen.getByLabelText('End').getAttribute('type')).toBe('date')

    fireEvent.change(screen.getByLabelText('Start'), {
      target: { value: '2026-05-03' },
    })

    expect(onChange).toHaveBeenCalledWith(['2026-05-03', null])
  })

  it('offers recent month, MTD, and YTD presets', () => {
    const onChange = vi.fn()

    render(
      <MantineProvider>
        <DateRangeControl onChange={onChange} value={[null, null]} />
      </MantineProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Choose date range' }))
    act(() => vi.runAllTimers())
    fireEvent.click(screen.getByRole('button', { name: 'Apr' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose date range' }))
    act(() => vi.runAllTimers())
    fireEvent.click(screen.getByRole('button', { name: 'MTD' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose date range' }))
    act(() => vi.runAllTimers())
    fireEvent.click(screen.getByRole('button', { name: 'YTD' }))

    expect(onChange).toHaveBeenNthCalledWith(1, ['2026-04-01', '2026-04-30'])
    expect(onChange).toHaveBeenNthCalledWith(2, ['2026-05-01', '2026-05-12'])
    expect(onChange).toHaveBeenNthCalledWith(3, ['2026-01-01', '2026-05-12'])
  })
})
