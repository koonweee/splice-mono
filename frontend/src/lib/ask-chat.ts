import type { AskMessageMetadata, AskUIMessage } from './ask-types'

export function getAskMetadata(
  message: Partial<AskUIMessage> | Record<string, unknown>,
): AskMessageMetadata['ask'] | undefined {
  const metadata = (message as { metadata?: AskMessageMetadata }).metadata
  return metadata?.ask
}

export function getAskMessageText(
  message: Partial<AskUIMessage> | Record<string, unknown>,
): string {
  const parts = (message as { parts?: Array<{ type?: string; text?: string }> }).parts
  if (!Array.isArray(parts)) {
    return ''
  }

  return parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('')
}

export function shouldRenderAskMessage(
  message: Partial<AskUIMessage> | Record<string, unknown>,
): boolean {
  if (message.role !== 'assistant') {
    return getAskMessageText(message).trim().length > 0
  }

  const metadata = getAskMetadata(message)
  if (metadata?.answerText.trim()) {
    return true
  }

  return getAskMessageText(message).trim().length > 0
}

export function getAskUiState({
  error,
}: {
  error?: Error
}): { status: 'ready' | 'error'; canRetry: boolean } {
  if (error) {
    return { status: 'error', canRetry: true }
  }

  return { status: 'ready', canRetry: false }
}
