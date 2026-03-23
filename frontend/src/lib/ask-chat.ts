import type { AskMessageMetadata, AskUIMessage } from './ask-types'

export function getAskMetadata(
  message: Partial<AskUIMessage> | Record<string, unknown>,
): AskMessageMetadata['ask'] | undefined {
  const metadata = (message as { metadata?: AskMessageMetadata }).metadata
  return metadata?.ask
}

export function selectEvidenceMessageId(
  messages: Array<Partial<AskUIMessage> | Record<string, unknown>>,
): string | null {
  const lastAssistant = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === 'assistant' && getAskMetadata(message)?.evidence !== undefined,
    )

  return typeof lastAssistant?.id === 'string' ? lastAssistant.id : null
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

export function buildTransactionEvidenceLink(input: {
  accountId: string
  queryScope: { startDate?: string; endDate?: string }
}): string {
  const params = new URLSearchParams()
  params.set('accountId', input.accountId)
  if (input.queryScope.startDate) {
    params.set('startDate', input.queryScope.startDate)
  }
  if (input.queryScope.endDate) {
    params.set('endDate', input.queryScope.endDate)
  }
  return `/transactions?${params.toString()}`
}

export function buildAccountEvidenceLink(input: { accountId: string }): string {
  const params = new URLSearchParams()
  params.set('accountId', input.accountId)
  return `/accounts?${params.toString()}`
}
