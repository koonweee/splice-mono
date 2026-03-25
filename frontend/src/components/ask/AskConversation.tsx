import { Loader, Stack } from '@mantine/core'
import { AskErrorCard, AskMessageCard } from './AskMessageCard'
import styles from './ask.module.css'
import type { ReactNode } from 'react'
import type { AskUIMessage } from '@/lib/ask-types'

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
  return (
    <div className={styles.page} data-testid="ask-page-grid">
      <Stack gap="md" className={styles.messages} data-testid="ask-transcript">
        {messages.map((message) => (
          <div
            key={message.id}
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
