/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
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

  afterEach(() => {
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
})
