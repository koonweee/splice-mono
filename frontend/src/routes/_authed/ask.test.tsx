/* @vitest-environment jsdom */

import { AppShell, MantineProvider } from '@mantine/core'
import { render, screen, within } from '@testing-library/react'
import type { ComponentType } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import authedStyles from '../_authed.module.css'
import styles from '@/components/ask/ask.module.css'
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
        <AppShell header={{ height: 60 }} padding="md">
          <AppShell.Header>Header</AppShell.Header>
          <AppShell.Main data-testid="app-shell-main" className={authedStyles.main}>
            <AskPage />
          </AppShell.Main>
        </AppShell>
      </MantineProvider>,
    )

    const shellMain = screen.getByTestId('app-shell-main')
    const viewport = screen.getByTestId('ask-route-viewport')
    const heading = within(viewport).getByRole('heading', { name: 'Ask' })
    const alert = within(viewport).getByRole('alert')
    const alertText = within(alert).getByText(
      /net worth trends, spending changes, merchants, categories, balances, or recurring charges/i,
    )
    const pageGrid = within(viewport).getByTestId('ask-page-grid')
    const transcript = within(viewport).getByTestId('ask-transcript')

    expect(shellMain.contains(viewport)).toBe(true)
    expect(shellMain.className).toContain(authedStyles.main)
    expect(viewport.className).toContain(styles.routeViewport)
    expect(pageGrid.className).toContain(styles.page)
    expect(transcript.className).toContain(styles.messages)
    expect(viewport.contains(heading)).toBe(true)
    expect(viewport.contains(alert)).toBe(true)
    expect(viewport.contains(alertText)).toBe(true)
    expect(viewport.contains(transcript)).toBe(true)
    expect(viewport.contains(pageGrid)).toBe(true)
    expect(heading.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(alert.compareDocumentPosition(pageGrid) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })
})
