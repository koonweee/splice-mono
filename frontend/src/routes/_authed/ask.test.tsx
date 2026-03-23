/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core'
import { render, screen, within } from '@testing-library/react'
import type { ComponentType } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as AskRouteModule from './ask'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({}),
}))

vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: [],
    status: 'ready',
    error: undefined,
    regenerate: vi.fn(),
    sendMessage: vi.fn(),
  }),
}))

vi.mock('ai', () => ({
  DefaultChatTransport: class {
    constructor(_: unknown) {}
  },
}))

describe('Ask route layout', () => {
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

  it('renders the bounded route wrapper with the header and empty-state prompt above the conversation', () => {
    const AskPage = (AskRouteModule as { AskPage?: ComponentType }).AskPage

    expect(AskPage).toBeTypeOf('function')
    if (!AskPage) {
      throw new Error('AskPage export is required for route-level layout tests')
    }

    render(
      <MantineProvider>
        <AskPage />
      </MantineProvider>,
    )

    const viewport = screen.getByTestId('ask-route-viewport')
    const heading = within(viewport).getByRole('heading', { name: 'Ask' })
    const alert = within(viewport).getByText(
      'Ask about spending changes, merchants, categories, balances, or recurring charges.',
    )
    const transcript = within(viewport).getByTestId('ask-transcript')

    expect(viewport.contains(heading)).toBe(true)
    expect(viewport.contains(alert)).toBe(true)
    expect(viewport.contains(transcript)).toBe(true)
  })
})
