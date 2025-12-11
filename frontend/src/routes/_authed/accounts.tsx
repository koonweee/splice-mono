import { Alert, Group, Loader, Stack, Text, Title } from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useAccountControllerFindAll } from '../../api/clients/spliceAPI'
import type { AccountWithConvertedBalance } from '../../api/models'
import { InstitutionSection } from '../../components/accounts'

export const Route = createFileRoute('/_authed/accounts')({
  component: AccountsPage,
})

function AccountsPage() {
  const { data: accounts, isLoading, error } = useAccountControllerFindAll()

  // Group accounts by institution
  const groupedAccounts = useMemo(() => {
    if (!accounts) return new Map<string, AccountWithConvertedBalance[]>()

    const groups = new Map<string, AccountWithConvertedBalance[]>()
    for (const account of accounts) {
      const institution = account.institutionName ?? 'Manual Accounts'
      const existing = groups.get(institution) ?? []
      groups.set(institution, [...existing, account])
    }
    return groups
  }, [accounts])

  if (isLoading) {
    return (
      <Group justify="center" py="xl">
        <Loader />
      </Group>
    )
  }

  if (error) {
    return (
      <Alert color="red" title="Error">
        Failed to load accounts
      </Alert>
    )
  }

  return (
    <>
      <Title order={1} mb="xl">
        Accounts
      </Title>
      <Stack gap="lg">
        {Array.from(groupedAccounts.entries()).map(
          ([institution, accounts]) => (
            <InstitutionSection
              key={institution}
              institution={institution}
              accounts={accounts}
            />
          ),
        )}
        {groupedAccounts.size === 0 && (
          <Text c="dimmed">No accounts found</Text>
        )}
      </Stack>
    </>
  )
}
