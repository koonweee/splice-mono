import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Textarea,
} from '@mantine/core'
import { RefreshCw, Send, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { ProjectionTranscriptMessage } from '../../lib/projections/types'

export function ProjectionPromptPanel({
  disabled,
  followUpQuestions,
  messages,
  onSubmit,
}: {
  disabled: boolean
  followUpQuestions: Array<string>
  messages: Array<ProjectionTranscriptMessage>
  onSubmit: (prompt: string) => void
}) {
  const [prompt, setPrompt] = useState('')

  function submit(value = prompt) {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
    setPrompt('')
  }

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Group justify="space-between" mb="md">
          <Group gap="xs">
            <Sparkles size={18} color="var(--mantine-color-teal-5)" />
            <Text fw={700}>Ask AI about your future</Text>
          </Group>
          <ActionIcon aria-label="Refresh projection" disabled={disabled} variant="subtle">
            <RefreshCw size={16} />
          </ActionIcon>
        </Group>

        <Stack gap="sm">
          {messages.map((message) => (
            <Paper
              key={message.id}
              withBorder
              p="sm"
              bg={
                message.role === 'user'
                  ? 'rgba(32, 201, 151, 0.10)'
                  : 'transparent'
              }
            >
              <Text size="sm">{message.content}</Text>
            </Paper>
          ))}
        </Stack>

        <Group mt="md" align="flex-end" wrap="nowrap">
          <Textarea
            aria-label="Projection prompt"
            autosize
            disabled={disabled}
            minRows={1}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            placeholder="Ask a follow-up question..."
            value={prompt}
            style={{ flex: 1 }}
          />
          <ActionIcon
            aria-label="Send projection prompt"
            disabled={disabled || !prompt.trim()}
            onClick={() => submit()}
            size={42}
          >
            <Send size={18} />
          </ActionIcon>
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Text size="sm" fw={600} mb="sm">
          Try these questions
        </Text>
        <Stack gap="xs">
          {followUpQuestions.map((question) => (
            <Button
              key={question}
              disabled={disabled}
              justify="flex-start"
              leftSection={<Badge size="xs" circle color="teal" />}
              onClick={() => submit(question)}
              variant="default"
            >
              <Text size="sm" truncate>
                {question}
              </Text>
            </Button>
          ))}
        </Stack>
      </Paper>
    </Stack>
  )
}
