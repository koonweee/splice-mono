/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core'
import { render, screen, within } from '@testing-library/react'
import type { ComponentType } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as AskRouteModule from './ask'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
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
    const route = AskRouteModule.Route as { component?: ComponentType }
    const AskPage = route.component

    expect(AskPage).toBeTypeOf('function')
    if (!AskPage) {
      throw new Error('Ask route component is required for route-level layout tests')
    }

    render(
      <MantineProvider>
        <AskPage />
      </MantineProvider>,
    )

    const viewport = screen.getByTestId('ask-route-viewport')
    const header = within(viewport).getByTestId('ask-route-header')
    const alert = within(viewport).getByTestId('ask-empty-state')
    const pageGrid = within(viewport).getByTestId('ask-page-grid')
    const transcript = within(viewport).getByTestId('ask-transcript')

    expect(viewport.contains(header)).toBe(true)
    expect(viewport.contains(alert)).toBe(true)
    expect(viewport.contains(transcript)).toBe(true)
    expect(viewport.contains(pageGrid)).toBe(true)
    expect(header.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(alert.compareDocumentPosition(pageGrid) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })
})
