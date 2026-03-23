import { Alert, Paper, Stack, Text } from '@mantine/core'
import type { AskAnswer, AskUIMessage } from '@/lib/ask-types'
import { getAskMetadata } from '@/lib/ask-chat'
import { AskMarkdown } from './AskMarkdown'
import { AskEvidencePanel } from './AskEvidencePanel'
import styles from './ask.module.css'

type AskMessageCardProps = {
  message: AskUIMessage
  isSelected: boolean
  showInlineEvidence: boolean
  onSelectEvidence?: () => void
}

function getMessageText(message: AskUIMessage): string {
  if (!Array.isArray(message.parts)) {
    return ''
  }

  return message.parts
    .filter(
      (part): part is Extract<(typeof message.parts)[number], { type: 'text' }> =>
        part.type === 'text',
    )
    .map((part) => part.text)
    .join('')
}

export function AskMessageCard({
  message,
  isSelected,
  showInlineEvidence,
  onSelectEvidence,
}: AskMessageCardProps) {
  const answer = getAskMetadata(message) as AskAnswer | undefined
  const isAssistant = message.role === 'assistant'
  const messageText = getMessageText(message)
  const askAnswerText = answer?.answerText
  const hasAskMarkdown = Boolean(isAssistant && askAnswerText?.trim())
  const displayedText =
    askAnswerText && askAnswerText.trim().length > 0 ? askAnswerText : messageText
  const canSelectEvidence = isAssistant && answer !== undefined && onSelectEvidence !== undefined

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      className={`${styles.messageCard} ${
        isAssistant ? styles.messageCardAssistant : styles.messageCardUser
      }`}
    >
      <Stack gap="xs">
        <div className={styles.messageHeader}>
          <Text fw={600} size="sm">
            {isAssistant ? 'Ask' : 'You'}
          </Text>
          {canSelectEvidence && (
            <button
              type="button"
              className={`${styles.messageSelectButton} ${
                isSelected ? styles.messageSelectButtonSelected : ''
              }`}
              aria-pressed={isSelected}
              onClick={onSelectEvidence}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') {
                  return
                }

                event.preventDefault()
                onSelectEvidence()
              }}
            >
              {isSelected ? 'Selected' : 'View evidence'}
            </button>
          )}
        </div>
        {hasAskMarkdown ? (
          <AskMarkdown markdown={displayedText} />
        ) : (
          <Text
            size="sm"
            className={styles.messageBody}
            style={{ whiteSpace: 'pre-wrap' }}
          >
            {displayedText}
          </Text>
        )}
        {showInlineEvidence && isAssistant && isSelected && (
          <div className={styles.mobileEvidence}>
            <AskEvidencePanel answer={answer} />
          </div>
        )}
      </Stack>
    </Paper>
  )
}

export function AskErrorCard({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Alert color="red" title="Ask failed" variant="light">
      <Stack gap="xs">
        <Text size="sm">{message}</Text>
        <Text
          component="button"
          type="button"
          onClick={onRetry}
          size="sm"
          fw={600}
          style={{
            border: 0,
            background: 'transparent',
            padding: 0,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          Retry last message
        </Text>
      </Stack>
    </Alert>
  )
}
