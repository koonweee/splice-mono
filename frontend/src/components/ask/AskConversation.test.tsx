/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AskUIMessage } from '@/lib/ask-types'
import { AskConversation } from './AskConversation'

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

  it('keeps assistant markdown links out of button-backed rows while preserving row selection', () => {
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
              accounts: [],
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

    link.addEventListener('click', (event) => event.preventDefault())

    expect(link.closest('button')).toBeNull()
    expect(link.getAttribute('href')).toBe('https://example.com')

    fireEvent.click(link)
    expect(onSelectMessage).not.toHaveBeenCalled()

    fireEvent.click(row)
    expect(onSelectMessage).toHaveBeenCalledWith('assistant-1')
  })
})
