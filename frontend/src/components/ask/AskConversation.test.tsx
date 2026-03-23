/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AskUIMessage } from '@/lib/ask-types'
import { AskConversation } from './AskConversation'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    ...props
  }: {
    children: ReactNode
    to: string
  } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

describe('AskConversation layout', () => {
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

  it('keeps the transcript and desktop evidence in dedicated containers', () => {
    const messages = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'What did I spend last month?' }],
      } satisfies AskUIMessage,
    ]

    render(
      <MantineProvider>
        <AskConversation
          messages={messages}
          selectedMessageId={null}
          status="ready"
          onSelectMessage={() => {}}
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    const pageGrid = screen.getByTestId('ask-page-grid')
    const conversationPane = screen.getByTestId('ask-conversation-pane')
    const transcript = screen.getByTestId('ask-transcript')
    const evidence = screen.getByTestId('ask-desktop-evidence')
    const composer = screen.getByTestId('ask-composer')

    expect(pageGrid.firstElementChild).toBe(conversationPane)
    expect(pageGrid.lastElementChild).toBe(evidence)
    expect(conversationPane.firstElementChild).toBe(transcript)
    expect(conversationPane.lastElementChild).toBe(composer)
  })

  it('uses a dedicated evidence button instead of making the row a widget', () => {
    const onSelectMessage = vi.fn()
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [],
        metadata: {
          ask: {
            answerText: '[Docs](https://example.com)',
            queryScope: {
              accountIds: [],
              includePending: false,
              truncated: false,
            },
            evidence: {
              accounts: [
                {
                  id: 'account-1',
                  displayName: 'Primary Checking',
                  institutionName: 'Splice Bank',
                  grouping: 'cash',
                  balance: {
                    money: { amount: 12345, currency: 'USD' },
                    sign: 'positive',
                  },
                },
              ],
              transactions: [
                {
                  id: 'transaction-1',
                  accountId: 'account-1',
                  accountName: 'Primary Checking',
                  merchantName: 'Coffee Shop',
                  pending: false,
                  date: '2026-03-21',
                  categoryPrimary: 'FOOD_AND_DRINK',
                  amount: {
                    money: { amount: 599, currency: 'USD' },
                    sign: 'negative',
                  },
                },
              ],
              aggregates: [],
              matchedCount: 1,
              truncated: false,
            },
            followups: [],
            confidence: 'high',
          },
        },
      } satisfies AskUIMessage,
    ]

    render(
      <MantineProvider>
        <AskConversation
          messages={messages}
          selectedMessageId={null}
          status="ready"
          onSelectMessage={onSelectMessage}
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    const link = screen.getByRole('link', { name: 'Docs' })
    const row = screen.getByTestId('ask-message-row-assistant-1')
    const selectButton = within(row).getByRole('button', { name: 'View evidence' })

    link.addEventListener('click', (event) => event.preventDefault())

    expect(link.closest('button')).toBeNull()
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(row.getAttribute('role')).toBeNull()
    expect(row.getAttribute('tabindex')).toBeNull()
    expect(selectButton.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(link)
    expect(onSelectMessage).not.toHaveBeenCalled()

    selectButton.focus()
    fireEvent.keyDown(selectButton, { key: 'Enter' })
    fireEvent.click(selectButton)
    expect(onSelectMessage).toHaveBeenCalledTimes(1)
    expect(onSelectMessage).toHaveBeenCalledWith('assistant-1')
  })

  it('keeps selected assistant markdown and inline evidence links clickable', () => {
    const onSelectMessage = vi.fn()
    const messages = [
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [],
        metadata: {
          ask: {
            answerText: '[Docs](https://example.com)',
            queryScope: {
              accountIds: [],
              includePending: false,
              truncated: false,
            },
            evidence: {
              accounts: [
                {
                  id: 'account-1',
                  displayName: 'Primary Checking',
                  institutionName: 'Splice Bank',
                  grouping: 'cash',
                  balance: {
                    money: { amount: 12345, currency: 'USD' },
                    sign: 'positive',
                  },
                },
              ],
              transactions: [],
              aggregates: [],
              matchedCount: 1,
              truncated: false,
            },
            followups: [],
            confidence: 'high',
          },
        },
      } satisfies AskUIMessage,
    ]

    render(
      <MantineProvider>
        <AskConversation
          messages={messages}
          selectedMessageId="assistant-1"
          status="ready"
          onSelectMessage={onSelectMessage}
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    const row = screen.getByTestId('ask-message-row-assistant-1')
    const selectButton = within(row).getByRole('button', { name: 'Selected' })
    const markdownLink = within(row).getByRole('link', { name: 'Docs' })
    const accountEvidenceLink = within(row).getByRole('link', {
      name: /Primary Checking/,
    })

    markdownLink.addEventListener('click', (event) => event.preventDefault())
    accountEvidenceLink.addEventListener('click', (event) => event.preventDefault())

    expect(markdownLink.closest('button')).toBeNull()
    expect(accountEvidenceLink.closest('button')).toBeNull()
    expect(row.getAttribute('role')).toBeNull()
    expect(row.getAttribute('tabindex')).toBeNull()
    expect(selectButton.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(markdownLink)
    fireEvent.click(accountEvidenceLink)

    expect(onSelectMessage).not.toHaveBeenCalled()

    fireEvent.click(row)
    expect(onSelectMessage).not.toHaveBeenCalled()
  })
})
