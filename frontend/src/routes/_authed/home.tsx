import {
  Alert,
  Grid,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useDashboardControllerGetSummary } from '../../api/clients/spliceAPI'
import { AccountSummary, TimePeriod } from '../../api/models'
import { AccountCard } from '../../components/AccountCard'
import { AccountModal } from '../../components/AccountModal'
import { NetWorthCard } from '../../components/NetWorthCard'

export const Route = createFileRoute('/_authed/home')({ component: HomePage })

const PERIOD_OPTIONS = [
  { value: TimePeriod.day, label: 'Day' },
  { value: TimePeriod.week, label: 'Week' },
  { value: TimePeriod.month, label: 'Month' },
  { value: TimePeriod.year, label: 'Year' },
]

function HomePage() {
  const [period, setPeriod] = useState<TimePeriod>(TimePeriod.month)
  const [selectedAccount, setSelectedAccount] = useState<AccountSummary | null>(
    null,
  )
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false)
  const {
    data: dashboard,
    isLoading,
    error,
  } = useDashboardControllerGetSummary({ period })

  const handleAccountClick = (account: AccountSummary) => {
    setSelectedAccount(account)
    openModal()
  }

  return (
    <>
      <Group justify="space-between" mb="xl">
        <Title order={1}>Home</Title>
        <Select
          value={period}
          onChange={(value) => value && setPeriod(value as TimePeriod)}
          data={PERIOD_OPTIONS}
          w={120}
          size="md"
        />
      </Group>

      {isLoading && (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      )}

      {error ? (
        <Alert color="red" title="Error" mb="lg">
          Error loading dashboard:{' '}
          {error instanceof Error ? error.message : 'Unknown error'}
        </Alert>
      ) : null}

      {dashboard && (
        <>
          <NetWorthCard
            netWorth={dashboard.netWorth}
            changePercent={dashboard.changePercent}
            comparisonPeriod={dashboard.comparisonPeriod}
            chartData={dashboard.chartData}
          />

          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Title order={3} mb="md">
                Assets
              </Title>
              <Stack gap="sm">
                {dashboard.assets.length === 0 ? (
                  <Text c="dimmed">No assets</Text>
                ) : (
                  dashboard.assets.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      isLiability={false}
                      onClick={() => handleAccountClick(account)}
                    />
                  ))
                )}
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Title order={3} mb="md">
                Liabilities
              </Title>
              <Stack gap="sm">
                {dashboard.liabilities.length === 0 ? (
                  <Text c="dimmed">No liabilities</Text>
                ) : (
                  dashboard.liabilities.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      isLiability={true}
                      onClick={() => handleAccountClick(account)}
                    />
                  ))
                )}
              </Stack>
            </Grid.Col>
          </Grid>
        </>
      )}

      <AccountModal
        account={selectedAccount}
        opened={modalOpened}
        onClose={closeModal}
      />
    </>
  )
}
