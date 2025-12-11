import { ActionIcon, Collapse, Group, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react'
import type { AccountSummaryData } from '../lib/balance-utils'
import { AccountCard } from './AccountCard'

export function AccountSection({
  title,
  accounts,
  isLiability,
  onAccountClick,
}: {
  title: string
  accounts: AccountSummaryData[]
  isLiability: boolean
  onAccountClick: (account: AccountSummaryData) => void
}) {
  const [opened, { toggle }] = useDisclosure(true)

  return (
    <>
      <Group
        justify="space-between"
        mb="md"
        style={{ cursor: 'pointer' }}
        onClick={toggle}
      >
        <Title order={3}>{title}</Title>
        <ActionIcon variant="subtle" size="sm">
          {opened ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
        </ActionIcon>
      </Group>
      <Collapse in={opened}>
        <Stack gap="sm">
          {accounts.length === 0 ? (
            <Text c="dimmed">No {title.toLowerCase()}</Text>
          ) : (
            accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                isLiability={isLiability}
                onClick={() => onAccountClick(account)}
              />
            ))
          )}
        </Stack>
      </Collapse>
    </>
  )
}
