import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LifecycleBadge } from './LifecycleBadge'

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
})

afterEach(cleanup)

describe('LifecycleBadge', () => {
  it('keeps lifecycle states explicit instead of relying on color', () => {
    render(
      <MantineProvider>
        <LifecycleBadge status="Active" />
        <LifecycleBadge status="Paused" />
        <LifecycleBadge status="Archived" />
        <LifecycleBadge status="Ended" />
      </MantineProvider>,
    )

    for (const status of ['Active', 'Paused', 'Archived', 'Ended']) {
      expect(screen.getByText(status)).toBeTruthy()
    }
  })

  it('includes the status when showing an item label', () => {
    render(
      <MantineProvider>
        <LifecycleBadge status="Archived" size="xs">
          Grooming - Pets
        </LifecycleBadge>
      </MantineProvider>,
    )

    expect(screen.getByText('Grooming - Pets - Archived')).toBeTruthy()
  })
})
