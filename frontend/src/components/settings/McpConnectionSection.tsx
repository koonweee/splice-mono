import {
  Alert,
  Button,
  Code,
  Group,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useMemo, useState } from 'react'
import { resolveApiBaseUrl } from '../../api/axios'

function resolveMcpEndpoint() {
  const baseUrl =
    resolveApiBaseUrl() ??
    (typeof window === 'undefined' ? '' : window.location.origin)

  return `${baseUrl.replace(/\/$/, '')}/mcp`
}

function buildMcpConfig(endpoint: string) {
  return JSON.stringify(
    {
      mcpServers: {
        splice: {
          url: endpoint,
          headers: {
            Authorization: 'Bearer splice_pat_...',
          },
        },
      },
    },
    null,
    2,
  )
}

export function McpConnectionSection() {
  const endpoint = useMemo(() => resolveMcpEndpoint(), [])
  const config = useMemo(() => buildMcpConfig(endpoint), [endpoint])
  const [feedback, setFeedback] = useState<string | null>(null)

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setFeedback(`${label} copied.`)
    } catch {
      setFeedback(`Unable to copy ${label.toLowerCase()}.`)
    }
  }

  return (
    <Paper withBorder p="lg" radius="md" data-testid="mcp-section">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={3}>MCP connection</Title>
          <Text size="sm" c="dimmed">
            Connect AI tools to read Splice accounts, balances, and transactions.
            Use a personal access token as the bearer token.
          </Text>
        </Stack>

        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Endpoint
          </Text>
          <Code
            data-testid="mcp-endpoint"
            style={{
              display: 'block',
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
            }}
          >
            {endpoint}
          </Code>
          <Group justify="flex-start">
            <Button
              variant="light"
              onClick={() => {
                void copyText(endpoint, 'Endpoint')
              }}
            >
              Copy endpoint
            </Button>
          </Group>
        </Stack>

        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Client config
          </Text>
          <Code
            data-testid="mcp-config"
            style={{
              display: 'block',
              overflowWrap: 'anywhere',
              whiteSpace: 'pre-wrap',
            }}
          >
            {config}
          </Code>
          <Group justify="flex-start">
            <Button
              variant="light"
              onClick={() => {
                void copyText(config, 'Config')
              }}
            >
              Copy config
            </Button>
          </Group>
        </Stack>

        {feedback != null && (
          <Alert
            color={feedback.startsWith('Unable') ? 'red' : 'blue'}
            data-testid="mcp-copy-feedback"
          >
            {feedback}
          </Alert>
        )}
      </Stack>
    </Paper>
  )
}
