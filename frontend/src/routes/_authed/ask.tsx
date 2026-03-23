import { Alert, Group, Text, Title } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/react'
import { useEffect, useState } from 'react'
import { resolveApiBaseUrl } from '@/api/axios'
import { AskComposer } from '@/components/ask/AskComposer'
import { AskConversation } from '@/components/ask/AskConversation'
import { getAskUiState, selectEvidenceMessageId } from '@/lib/ask-chat'
import type { AskUIMessage } from '@/lib/ask-types'

export const Route = createFileRoute('/_authed/ask')({
  component: AskPage,
})

function AskPage() {
  const {
    messages,
    status,
    error,
    regenerate,
    sendMessage,
  } = useChat<AskUIMessage>({
    transport: new DefaultChatTransport({
      api: `${resolveApiBaseUrl() ?? ''}/ask/messages`,
      credentials: 'include',
    }),
  })
  const [input, setInput] = useState('')
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)

  useEffect(() => {
    const nextSelectedId = selectEvidenceMessageId(messages)
    if (nextSelectedId) {
      setSelectedMessageId(nextSelectedId)
    }
  }, [messages])

  const uiState = getAskUiState({ error })

  const submitQuestion = () => {
    const nextInput = input.trim()
    if (!nextInput) {
      return
    }

    void sendMessage({ text: nextInput })
    setInput('')
  }

  return (
    <>
      <Group justify="space-between" mb="xl">
        <Title order={1}>Ask</Title>
      </Group>

      {messages.length === 0 && (
        <Alert color="gray" variant="light" mb="md">
          <Text size="sm">
            Ask about spending changes, merchants, categories, balances, or recurring charges.
          </Text>
        </Alert>
      )}

      <AskConversation
        messages={messages}
        selectedMessageId={selectedMessageId}
        status={status}
        error={uiState.status === 'error' ? error : undefined}
        onSelectMessage={setSelectedMessageId}
        onRetry={() => {
          void regenerate()
        }}
        composer={
          <AskComposer
            input={input}
            disabled={status === 'submitted' || status === 'streaming'}
            onInputChange={(event) => setInput(event.currentTarget.value)}
            onSubmit={() => submitQuestion()}
          />
        }
      />
    </>
  )
}
