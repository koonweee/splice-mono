/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AskUIMessage } from '@/lib/ask-types'
import { AskMessageCard } from './AskMessageCard'

function renderMessageCard(message: AskUIMessage) {
  return render(
    <MantineProvider>
      <AskMessageCard
        message={message}
        isSelected={false}
        showInlineEvidence={false}
      />
    </MantineProvider>,
  )
}

describe('Ask markdown rendering', () => {
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

  it('renders bold text, lists, and links from assistant markdown', () => {
    const { container } = renderMessageCard({
      id: 'assistant-1',
      role: 'assistant',
      parts: [],
      metadata: {
        ask: {
          answerText:
            '**Bold**\n\n- one\n- two\n\n[Docs](https://example.com)',
          queryScope: {
            accountIds: [],
            includePending: false,
            truncated: false,
          },
          evidence: {
            accounts: [],
            transactions: [],
            aggregates: [],
            matchedCount: 0,
            truncated: false,
          },
          followups: [],
          confidence: 'high',
        },
      },
    } satisfies AskUIMessage)

    expect(
      screen.getByText('Bold').tagName.toLowerCase(),
    ).toBe('strong')
    expect(screen.getByRole('list').tagName.toLowerCase()).toBe('ul')
    expect(screen.getByRole('link', { name: 'Docs' }).getAttribute('href')).toBe(
      'https://example.com',
    )
    expect(container.querySelector('p')).toBeTruthy()
  })

  it('renders code blocks and GFM tables while escaping raw HTML', () => {
    const { container } = renderMessageCard({
      id: 'assistant-2',
      role: 'assistant',
      parts: [],
      metadata: {
        ask: {
          answerText:
            '```ts\nconst spend = 42\n```\n\n| Category | Amount |\n| --- | ---: |\n| Rent | 1200 |\n\n<span data-testid="raw-html">ignored</span>',
          queryScope: {
            accountIds: [],
            includePending: false,
            truncated: false,
          },
          evidence: {
            accounts: [],
            transactions: [],
            aggregates: [],
            matchedCount: 0,
            truncated: false,
          },
          followups: [],
          confidence: 'high',
        },
      },
    } satisfies AskUIMessage)

    expect(container.querySelector('pre')).toBeTruthy()
    expect(container.querySelector('code')?.textContent).toContain('const spend = 42')
    expect(container.querySelector('table')).toBeTruthy()
    expect(screen.getByText('Category').tagName.toLowerCase()).toBe('th')
    expect(container.querySelector('[data-testid="raw-html"]')).toBeNull()
    expect(container.textContent).toContain('<span data-testid="raw-html">ignored</span>')
  })

  it('preserves plain-text rendering for user messages', () => {
    const { container } = renderMessageCard({
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: '**Bold** and [Docs](https://example.com)' }],
    } satisfies AskUIMessage)

    expect(
      screen.getByText('**Bold** and [Docs](https://example.com)'),
    ).toBeTruthy()
    expect(container.querySelector('strong')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
  })

  it('preserves plain-text rendering for assistant fallback text without Ask metadata', () => {
    const { container } = renderMessageCard({
      id: 'assistant-fallback',
      role: 'assistant',
      parts: [{ type: 'text', text: '**Bold** and [Docs](https://example.com)' }],
    } satisfies AskUIMessage)

    expect(container.textContent).toContain('**Bold** and [Docs](https://example.com)')
    expect(container.querySelector('strong')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
  })

  it('falls back to plain message text when Ask answerText is blank', () => {
    const { container } = renderMessageCard({
      id: 'assistant-blank-answer',
      role: 'assistant',
      parts: [{ type: 'text', text: '**Fallback** plain text' }],
      metadata: {
        ask: {
          answerText: '   ',
          queryScope: {
            accountIds: [],
            includePending: false,
            truncated: false,
          },
          evidence: {
            accounts: [],
            transactions: [],
            aggregates: [],
            matchedCount: 0,
            truncated: false,
          },
          followups: [],
          confidence: 'high',
        },
      },
    } satisfies AskUIMessage)

    expect(container.textContent).toContain('**Fallback** plain text')
    expect(container.querySelector('strong')).toBeNull()
  })
})
