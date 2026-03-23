/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AskComposer } from './AskComposer'

describe('AskComposer', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
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
    })
  })

  afterEach(() => {
    cleanup()
  })

  it('submits on Enter without Shift', () => {
    const onSubmit = vi.fn()

    const { getByRole } = render(
      <MantineProvider>
        <AskComposer
          input="What changed last month?"
          onInputChange={() => {}}
          onSubmit={onSubmit}
        />
      </MantineProvider>,
    )

    fireEvent.keyDown(getByRole('textbox'), { key: 'Enter' })

    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('keeps Shift+Enter for multiline input', () => {
    const onSubmit = vi.fn()

    const { getByRole } = render(
      <MantineProvider>
        <AskComposer
          input="What changed last month?"
          onInputChange={() => {}}
          onSubmit={onSubmit}
        />
      </MantineProvider>,
    )

    fireEvent.keyDown(getByRole('textbox'), {
      key: 'Enter',
      shiftKey: true,
    })

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
