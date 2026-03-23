import { Anchor, Badge, Divider, Paper, Stack, Text } from '@mantine/core'
import { Link } from '@tanstack/react-router'
import { buildAccountEvidenceLink, buildTransactionEvidenceLink } from '@/lib/ask-chat'
import { formatMoneyNumber, formatMoneyWithSign } from '@/lib/format'
import type { AskAnswer } from '@/lib/ask-types'

type AskEvidencePanelProps = {
  answer?: AskAnswer
}

export function AskEvidencePanel({ answer }: AskEvidencePanelProps) {
  if (!answer) {
    return (
      <Paper withBorder p="md" radius="md">
        <Text fw={600}>Evidence</Text>
        <Text c="dimmed" size="sm" mt="xs">
          Select or send a message to inspect its scope and supporting data.
        </Text>
      </Paper>
    )
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <div>
          <Text fw={600}>Evidence</Text>
          <Text c="dimmed" size="sm">
            {answer.evidence.matchedCount} matching rows
            {answer.evidence.truncated ? ' (capped)' : ''}
          </Text>
        </div>

        <div>
          <Text fw={500} size="sm" mb="xs">
            Scope
          </Text>
          <Stack gap={4}>
            <Text size="sm">
              Date range: {answer.queryScope.startDate ?? 'n/a'} to{' '}
              {answer.queryScope.endDate ?? 'n/a'}
            </Text>
            <Text size="sm">
              Pending: {answer.queryScope.includePending ? 'Included' : 'Posted only'}
            </Text>
          </Stack>
        </div>

        <Divider />

        <div>
          <Text fw={500} size="sm" mb="xs">
            Accounts
          </Text>
          <Stack gap="xs">
            {answer.evidence.accounts.length === 0 && (
              <Text c="dimmed" size="sm">
                No account evidence attached.
              </Text>
            )}
            {answer.evidence.accounts.map((account) => (
              <Anchor
                key={account.id}
                component={Link}
                to={buildAccountEvidenceLink({ accountId: account.id })}
                size="sm"
              >
                {account.displayName} • {formatMoneyWithSign({ value: account.balance })}
              </Anchor>
            ))}
          </Stack>
        </div>

        <Divider />

        <div>
          <Text fw={500} size="sm" mb="xs">
            Transactions
          </Text>
          <Stack gap="xs">
            {answer.evidence.transactions.length === 0 && (
              <Text c="dimmed" size="sm">
                No transaction evidence attached.
              </Text>
            )}
            {answer.evidence.transactions.map((transaction) => (
              <Anchor
                key={transaction.id}
                component={Link}
                to={buildTransactionEvidenceLink({
                  accountId: transaction.accountId,
                  queryScope: answer.queryScope,
                })}
                size="sm"
              >
                {transaction.date} • {transaction.merchantName ?? 'Unknown merchant'} •{' '}
                {formatMoneyWithSign({ value: transaction.convertedAmount ?? transaction.amount })}
              </Anchor>
            ))}
          </Stack>
        </div>

        <Divider />

        <div>
          <Text fw={500} size="sm" mb="xs">
            Aggregates
          </Text>
          <Stack gap="xs">
            {answer.evidence.aggregates.length === 0 && (
              <Text c="dimmed" size="sm">
                No aggregate evidence attached.
              </Text>
            )}
            {answer.evidence.aggregates.map((aggregate) => (
              <Badge key={`${aggregate.kind}-${aggregate.label}`} variant="light" color="gray">
                {aggregate.kind}: {aggregate.label} •{' '}
                {formatMoneyNumber({
                  value: aggregate.amount,
                  currency: aggregate.currency,
                })}
              </Badge>
            ))}
          </Stack>
        </div>
      </Stack>
    </Paper>
  )
}
