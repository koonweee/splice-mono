import { Loader, Stack } from '@mantine/core'
import { AskEvidencePanel } from './AskEvidencePanel'
import { AskErrorCard, AskMessageCard } from './AskMessageCard'
import styles from './ask.module.css'
import type { ReactNode } from 'react'
import type { AskUIMessage } from '@/lib/ask-types'
import { getAskMetadata } from '@/lib/ask-chat'

type AskConversationProps = {
  messages: Array<AskUIMessage>
  selectedMessageId: string | null
  status: string
  error?: Error
  onSelectMessage: (messageId: string) => void
  onRetry: () => void
  composer: ReactNode
}

export function AskConversation({
  messages,
  selectedMessageId,
  status,
  error,
  onSelectMessage,
  onRetry,
  composer,
}: AskConversationProps) {
  const selectedAnswer = messages.find((message) => message.id === selectedMessageId)
  const selectedMetadata = selectedAnswer ? getAskMetadata(selectedAnswer) : undefined

  return (
    <div className={styles.page}>
      <div className={styles.conversationPane}>
        <Stack gap="md" className={styles.messages}>
          {messages.map((message) => (
            <button
              key={message.id}
              type="button"
              onClick={() => onSelectMessage(message.id)}
              style={{
                background: 'transparent',
                border: 0,
                padding: 0,
                textAlign: 'inherit',
              }}
            >
              <AskMessageCard
                message={message}
                isSelected={message.id === selectedMessageId}
                showInlineEvidence
              />
            </button>
          ))}
          {(status === 'submitted' || status === 'streaming') && <Loader size="sm" />}
          {error && (
            <AskErrorCard message={error.message || 'An unexpected error occurred.'} onRetry={onRetry} />
          )}
        </Stack>
        {composer}
      </div>

      <div className={styles.desktopEvidence}>
        <AskEvidencePanel answer={selectedMetadata} />
      </div>
    </div>
  )
}
