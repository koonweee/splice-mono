/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
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

  it('keeps selected assistant links safe while preserving accessible row selection', () => {
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
          selectedMessageId="assistant-1"
          status="ready"
          onSelectMessage={onSelectMessage}
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    const link = screen.getByRole('link', { name: 'Docs' })
    const row = screen.getByTestId('ask-message-row-assistant-1')
    const accountEvidenceLink = within(row).getByRole('link', {
      name: /Primary Checking/,
    })

    link.addEventListener('click', (event) => event.preventDefault())
    accountEvidenceLink.addEventListener('click', (event) => event.preventDefault())

    expect(link.closest('button')).toBeNull()
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(accountEvidenceLink.getAttribute('href')).toBe('/accounts?accountId=account-1')
    expect(row.getAttribute('role')).toBe('button')
    expect(row.getAttribute('tabindex')).toBe('0')
    expect(row.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(link)
    expect(onSelectMessage).not.toHaveBeenCalled()

    fireEvent.click(accountEvidenceLink)
    expect(onSelectMessage).not.toHaveBeenCalled()

    row.focus()
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(onSelectMessage).toHaveBeenCalledWith('assistant-1')

    fireEvent.click(row)
    expect(onSelectMessage).toHaveBeenNthCalledWith(2, 'assistant-1')
  })
})
