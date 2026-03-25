import { Loader, Stack } from '@mantine/core'
import { useEffect, useRef } from 'react'
import { AskErrorCard, AskMessageCard } from './AskMessageCard'
import styles from './ask.module.css'
import type { ReactNode } from 'react'
import type { AskUIMessage } from '@/lib/ask-types'
import { getAskMetadata } from '@/lib/ask-chat'

type AskConversationProps = {
  messages: Array<AskUIMessage>
  status: string
  error?: Error
  onRetry: () => void
  composer: ReactNode
}

export function AskConversation({
  messages,
  status,
  error,
  onRetry,
  composer,
}: AskConversationProps) {
  const previousStatusRef = useRef(status)
  const lastMessageRef = useRef<HTMLDivElement | null>(null)

  const visibleMessages = messages.filter((message, index) => {
    if (message.role !== 'assistant') {
      return true
    }

    const askAnswerText = getAskMetadata(message)?.answerText?.trim() ?? ''
    const messageText = Array.isArray(message.parts)
      ? message.parts
          .filter(
            (part): part is Extract<(typeof message.parts)[number], { type: 'text' }> =>
              part.type === 'text',
          )
          .map((part) => part.text)
          .join('')
          .trim()
      : ''
    const isLatestMessage = index === messages.length - 1

    return !(isLatestMessage && status === 'submitted' && !askAnswerText && !messageText)
  })

  useEffect(() => {
    const previousStatus = previousStatusRef.current

    if ((previousStatus === 'submitted' || previousStatus === 'streaming') && status === 'ready') {
      lastMessageRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      })
    }

    previousStatusRef.current = status
  }, [status, visibleMessages.length])

  return (
    <div className={styles.page} data-testid="ask-page-grid">
      <Stack gap="md" className={styles.messages} data-testid="ask-transcript">
        {visibleMessages.map((message, index) => (
          <div
            key={message.id}
            ref={index === visibleMessages.length - 1 ? lastMessageRef : undefined}
            className={`${styles.messageRow} ${
              message.role === 'assistant'
                ? styles.messageRowAssistant
                : styles.messageRowUser
            }`}
            data-testid={`ask-message-row-${message.id}`}
          >
            <AskMessageCard message={message} />
          </div>
        ))}
        {(status === 'submitted' || status === 'streaming') && <Loader size="sm" />}
        {error && (
          <AskErrorCard message={error.message || 'An unexpected error occurred.'} onRetry={onRetry} />
        )}
      </Stack>
      {composer}
    </div>
  )
}
