import { Box, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import isNil from 'lodash/isNil'
import {
  useAccountControllerFindOne,
  useBalanceSnapshotControllerFindByAccountId,
} from '../api/clients/spliceAPI'
import type {
  AccountSummary,
  BalanceSnapshotWithConvertedBalance,
} from '../api/models'
import { BalanceSnapshotSnapshotType, MoneyWithSignSign } from '../api/models'
import { formatMoneyNumber, formatMoneyWithSign } from '../lib/format'
import { useIsMobile } from '../lib/hooks'
import { Chart, type ChartDataPoint } from './Chart'

dayjs.extend(relativeTime)

function transformSnapshotsToChartData(
  data: BalanceSnapshotWithConvertedBalance[],
): ChartDataPoint[] {
  return [...data]
    .sort(
      (a, b) =>
        new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime(),
    )
    .map((snapshot) => {
      const balance =
        snapshot.convertedCurrentBalance?.balance ?? snapshot.currentBalance
      const dollars = balance.money.amount / 100
      const signedValue =
        balance.sign === MoneyWithSignSign.negative ? -dollars : dollars

      return {
        label: dayjs(snapshot.snapshotDate).format('MMM D'),
        value: signedValue,
      }
    })
}

interface AccountModalProps {
  account: AccountSummary | null
  opened: boolean
  onClose: () => void
}

export function AccountModal({ account, opened, onClose }: AccountModalProps) {
  const isMobile = useIsMobile()

  const { data: fullAccount, isLoading: isLoadingAccount } =
    useAccountControllerFindOne(account?.id ?? '', {
      query: { enabled: opened && !!account?.id },
    })

  const { data: snapshots, isLoading: isLoadingSnapshots } =
    useBalanceSnapshotControllerFindByAccountId(account?.id ?? '', {
      query: { enabled: opened && !!account?.id },
    })

  const isLoading = isLoadingAccount || isLoadingSnapshots
  const isSyncedAccount = !!fullAccount?.bankLinkId

  // Find the last sync snapshot date
  const lastSyncSnapshot = snapshots
    ?.filter((s) => s.snapshotType === BalanceSnapshotSnapshotType.SYNC)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0]

  const { convertedCurrentBalance, currentBalance } = lastSyncSnapshot ?? {}

  const hasConvertedBalance = !isNil(convertedCurrentBalance)
  const hasCurrentBalance = !isNil(currentBalance)
  const hasDifferentCurrencies =
    hasConvertedBalance &&
    hasCurrentBalance &&
    convertedCurrentBalance.balance.money.currency !==
      currentBalance.money.currency

  const balanceToUse = hasConvertedBalance
    ? convertedCurrentBalance?.balance
    : currentBalance
  const hasBalanceToUse = !isNil(balanceToUse)

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={account?.name || 'Account Details'}
      size="xl"
      fullScreen={isMobile}
      transitionProps={{ transition: 'fade', duration: 200 }}
    >
      {isLoading ? (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      ) : (
        <Stack gap="md" p="lg">
          {fullAccount && (
            <>
              <Group justify="space-between">
                <Text c="dimmed">Current Balance</Text>
                <div style={{ textAlign: 'right' }}>
                  <Text fw={600}>
                    {hasBalanceToUse && formatMoneyWithSign(balanceToUse)}
                  </Text>
                  {hasDifferentCurrencies && (
                    <Text size="sm" c="dimmed">
                      {formatMoneyWithSign(currentBalance)}
                    </Text>
                  )}
                </div>
              </Group>

              {isSyncedAccount && lastSyncSnapshot && (
                <Group justify="space-between">
                  <Text c="dimmed">Last Synced</Text>
                  <Text>{dayjs(lastSyncSnapshot.createdAt).fromNow()}</Text>
                </Group>
              )}

              {fullAccount.institutionName && (
                <Group justify="space-between">
                  <Text c="dimmed">Institution</Text>
                  <Text>{fullAccount.institutionName}</Text>
                </Group>
              )}
            </>
          )}

          {snapshots && snapshots.length > 0 && (
            <Box mt="md">
              <Text fw={500} mb="sm">
                Balance history
              </Text>
              <Chart
                data={transformSnapshotsToChartData(snapshots)}
                height={200}
                color="blue.6"
                valueFormatter={(value) =>
                  formatMoneyNumber({ value, decimals: 2 })
                }
              />
            </Box>
          )}
        </Stack>
      )}
    </Modal>
  )
}
