import { Alert, Paper, Stack, Text } from '@mantine/core'
import type { AskUIMessage } from '@/lib/ask-types'
import { getAskMetadata } from '@/lib/ask-chat'
import { AskMarkdown } from './AskMarkdown'
import styles from './ask.module.css'

type AskMessageCardProps = {
  message: AskUIMessage
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

export function AskMessageCard({ message }: AskMessageCardProps) {
  const answer = getAskMetadata(message)
  const isAssistant = message.role === 'assistant'
  const messageText = getMessageText(message)
  const askAnswerText = answer?.answerText
  const displayedText =
    askAnswerText && askAnswerText.trim().length > 0 ? askAnswerText : messageText
  const hasAskMarkdown = Boolean(isAssistant && displayedText.trim().length > 0)

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
        <Text fw={600} size="sm">
          {isAssistant ? 'Ask' : 'You'}
        </Text>
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
