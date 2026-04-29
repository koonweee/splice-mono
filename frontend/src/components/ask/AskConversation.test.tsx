/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AskConversation } from './AskConversation'
import type { AskUIMessage } from '@/lib/ask-types'

describe('AskConversation layout', () => {
  const scrollIntoViewMock = vi.fn()

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
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      writable: true,
      value: scrollIntoViewMock,
    })
  })

  afterEach(() => {
    scrollIntoViewMock.mockReset()
    cleanup()
  })

  it('keeps the transcript and composer in the conversation pane', () => {
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
          status="ready"
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    const pageGrid = screen.getByTestId('ask-page-grid')
    const transcript = screen.getByTestId('ask-transcript')
    const composer = screen.getByTestId('ask-composer')

    expect(pageGrid.firstElementChild).toBe(transcript)
    expect(pageGrid.lastElementChild).toBe(composer)
    expect(pageGrid.textContent).not.toContain('Evidence')
  })

  it('renders assistant markdown without evidence controls', () => {
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
          status="ready"
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    expect(screen.getByRole('link', { name: 'Docs' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /evidence|selected/i })).toBeNull()
    expect(screen.queryByText('Evidence')).toBeNull()
  })

  it('hides the empty assistant bubble while the request is only submitted', () => {
    const messages = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'What changed?' }],
      } satisfies AskUIMessage,
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [],
        metadata: {
          ask: {
            answerText: '',
            queryScope: {
              accountIds: [],
              includePending: false,
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
          status="submitted"
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    expect(screen.getByTestId('ask-message-row-user-1')).toBeTruthy()
    expect(screen.queryByTestId('ask-message-row-assistant-1')).toBeNull()
  })

  it('hides the empty assistant bubble while the request is streaming without text yet', () => {
    const messages = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'What changed?' }],
      } satisfies AskUIMessage,
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [],
        metadata: {
          ask: {
            answerText: '',
            queryScope: {
              accountIds: [],
              includePending: false,
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
          status="streaming"
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    expect(screen.getByTestId('ask-message-row-user-1')).toBeTruthy()
    expect(screen.queryByTestId('ask-message-row-assistant-1')).toBeNull()
  })

  it('scrolls the latest message into view when streaming finishes', () => {
    const messages = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Summarize this month' }],
      } satisfies AskUIMessage,
      {
        id: 'assistant-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'This month is up.' }],
      } satisfies AskUIMessage,
    ]

    const { rerender } = render(
      <MantineProvider>
        <AskConversation
          messages={messages}
          status="streaming"
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    expect(scrollIntoViewMock).not.toHaveBeenCalled()

    rerender(
      <MantineProvider>
        <AskConversation
          messages={messages}
          status="ready"
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1)
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'end',
    })
  })

  it('scrolls the loading row into view as soon as a request is submitted', () => {
    const initialMessages = [
      {
        id: 'user-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Old question' }],
      } satisfies AskUIMessage,
    ]
    const submittedMessages = [
      ...initialMessages,
      {
        id: 'user-2',
        role: 'user',
        parts: [{ type: 'text', text: 'New question' }],
      } satisfies AskUIMessage,
    ]

    const { rerender } = render(
      <MantineProvider>
        <AskConversation
          messages={initialMessages}
          status="ready"
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    scrollIntoViewMock.mockReset()

    rerender(
      <MantineProvider>
        <AskConversation
          messages={submittedMessages}
          status="submitted"
          onRetry={() => {}}
          composer={<div data-testid="ask-composer">Composer</div>}
        />
      </MantineProvider>,
    )

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1)
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'end',
    })
    expect(screen.getByTestId('ask-loading-row')).toBeTruthy()
  })
})
