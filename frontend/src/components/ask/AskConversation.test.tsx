/* @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { AskUIMessage } from '@/lib/ask-types'
import { AskConversation } from './AskConversation'
import styles from './ask.module.css'

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

    const transcript = screen.getByTestId('ask-transcript')
    const evidence = screen.getByTestId('ask-desktop-evidence')
    const composer = screen.getByTestId('ask-composer')

    expect(transcript.className).toContain(styles.messages)
    expect(evidence.className).toContain(styles.desktopEvidence)
    expect(transcript.parentElement).toBe(composer.parentElement)
    expect(composer.parentElement?.className).toContain(styles.conversationPane)
  })
})
