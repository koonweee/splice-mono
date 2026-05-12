import { MantineProvider } from '@mantine/core'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('offers recent month and MTD presets', () => {
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

    expect(onChange).toHaveBeenNthCalledWith(1, [
      '2026-04-01',
      '2026-04-30',
    ])
    expect(onChange).toHaveBeenNthCalledWith(2, [
      '2026-05-01',
      '2026-05-12',
    ])
  })
})
