import { Box, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import {
  useAccountControllerFindOne,
  useBalanceSnapshotControllerFindByAccountId,
} from '../api/clients/spliceAPI'
import type { AccountSummary } from '../api/models'
import { BalanceSnapshotSnapshotType } from '../api/models'
import { formatMoneyWithSign } from '../lib/format'
import { BalanceChart } from './BalanceChart'

dayjs.extend(relativeTime)

interface AccountModalProps {
  account: AccountSummary | null
  opened: boolean
  onClose: () => void
}

export function AccountModal({ account, opened, onClose }: AccountModalProps) {
  const isMobile = useMediaQuery('(max-width: 50em)')

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
        <Stack gap="md" p="md">
          {fullAccount && (
            <>
              <Group justify="space-between">
                <Text c="dimmed">Current Balance</Text>
                <div style={{ textAlign: 'right' }}>
                  <Text fw={600}>
                    {formatMoneyWithSign(
                      fullAccount.convertedCurrentBalance?.balance ??
                        fullAccount.currentBalance,
                    )}
                  </Text>
                  {fullAccount.convertedCurrentBalance?.balance &&
                    fullAccount.convertedCurrentBalance.balance.money
                      .currency !==
                      fullAccount.currentBalance.money.currency && (
                      <Text size="sm" c="dimmed">
                        {formatMoneyWithSign(fullAccount.currentBalance)}
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
                Balance History
              </Text>
              <BalanceChart data={snapshots} height={200} />
            </Box>
          )}
        </Stack>
      )}
    </Modal>
  )
}
