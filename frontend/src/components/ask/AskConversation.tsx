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
    <div className={styles.page} data-testid="ask-page-grid">
      <div className={styles.conversationPane} data-testid="ask-conversation-pane">
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
              <AskMessageCard
                message={message}
                isSelected={message.id === selectedMessageId}
                showInlineEvidence
                onSelectEvidence={() => onSelectMessage(message.id)}
              />
            </div>
          ))}
          {(status === 'submitted' || status === 'streaming') && <Loader size="sm" />}
          {error && (
            <AskErrorCard message={error.message || 'An unexpected error occurred.'} onRetry={onRetry} />
          )}
        </Stack>
        {composer}
      </div>

      <div className={styles.desktopEvidence} data-testid="ask-desktop-evidence">
        <AskEvidencePanel answer={selectedMetadata} />
      </div>
    </div>
  )
}
