import { Box, Button, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useDisclosure } from '@mantine/hooks'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAccountBalanceHistory } from '../hooks/useBalanceData'
import { resolveEffectiveBalance } from '../lib/balance-utils'
import {
  formatMoneyNumber,
  formatMoneyWithSign,
  formatRelativeTime,
} from '../lib/format'
import { useIsMobile } from '../lib/hooks'
import {
  manualInvestmentQueryKeys,
  useDeleteManualInvestmentSnapshot,
  useManualInvestmentSnapshots,
  type ManualInvestmentSnapshot,
} from '../api/manualInvestment'
import {
  getAccountControllerFindAllQueryKey,
  getBalanceQueryControllerGetAllBalancesQueryKey,
  getBalanceQueryControllerGetBalancesQueryKey,
} from '../api/clients/spliceAPI'
import { UpdateHoldingsModal } from './accounts/UpdateHoldingsModal'
import { UpdateBalanceModal } from './accounts/UpdateBalanceModal'
import { Chart } from './Chart'
import type { TimePeriod } from '../lib/types'
import type { AccountSummaryData } from '../lib/balance-utils'

interface AccountModalProps {
  account?: AccountSummaryData
  opened: boolean
  onClose: () => void
  period: TimePeriod
}

export function AccountModal({
  account,
  opened,
  onClose,
  period,
}: AccountModalProps) {
  const isMobile = useIsMobile()
  const [
    updateModalOpened,
    { open: openUpdateModal, close: closeUpdateModal },
  ] = useDisclosure(false)
  const queryClient = useQueryClient()
  const deleteSnapshot = useDeleteManualInvestmentSnapshot()
  const [selectedSnapshot, setSelectedSnapshot] = useState<
    ManualInvestmentSnapshot | undefined
  >(undefined)

  const { data: balanceHistory, isLoading } = useAccountBalanceHistory(
    account?.id,
    opened && !!account?.id,
    period,
  )

  // Get account from balance history if available
  const fullAccount = balanceHistory.latestBalance?.account
  const isManual = !!fullAccount && !fullAccount.bankLinkId
  const isHoldingsMode = fullAccount?.manualValuationMode === 'holdings'
  const { data: snapshots = [] } = useManualInvestmentSnapshots(
    fullAccount?.id,
    opened && !!fullAccount?.id && isHoldingsMode,
  )

  // Get balance info from the latest balance result or fall back to account summary
  const latestBalance = balanceHistory.latestBalance
  const balanceInfo = latestBalance
    ? {
        primaryBalance: resolveEffectiveBalance(latestBalance.effectiveBalance),
        originalBalance:
          latestBalance.effectiveBalance.convertedBalance &&
          latestBalance.effectiveBalance.convertedBalance.money.currency !==
            latestBalance.effectiveBalance.balance.money.currency
            ? latestBalance.effectiveBalance.balance
            : undefined,
      }
    : undefined

  const handleOpenHoldingsModal = (snapshot?: ManualInvestmentSnapshot) => {
    setSelectedSnapshot(snapshot)
    openUpdateModal()
  }

  const handleCloseHoldingsModal = () => {
    setSelectedSnapshot(undefined)
    closeUpdateModal()
  }

  const handleDeleteSnapshot = (snapshotDate: string) => {
    if (!fullAccount) {
      return
    }

    deleteSnapshot.mutate(
      {
        accountId: fullAccount.id,
        date: snapshotDate,
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getAccountControllerFindAllQueryKey(),
          })
          queryClient.invalidateQueries({
            queryKey: getBalanceQueryControllerGetBalancesQueryKey(),
          })
          queryClient.invalidateQueries({
            queryKey: getBalanceQueryControllerGetAllBalancesQueryKey(),
          })
          queryClient.invalidateQueries({
            queryKey: manualInvestmentQueryKeys.all(fullAccount.id),
          })
          notifications.show({
            title: 'Snapshot Deleted',
            message: 'The dated holdings snapshot was deleted.',
            color: 'green',
          })
        },
      },
    )
  }

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={account?.customName ?? account?.name ?? 'Account Details'}
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
                  <Group gap="xs">
                    <Text c="dimmed">Current Balance</Text>
                    {isManual && (
                      <Button
                        variant="light"
                        size="xs"
                        onClick={() =>
                          isHoldingsMode
                            ? handleOpenHoldingsModal(selectedSnapshot ?? snapshots[0])
                            : openUpdateModal()
                        }
                      >
                        {isHoldingsMode ? 'Update Holdings' : 'Update Balance'}
                      </Button>
                    )}
                  </Group>
                  <div style={{ textAlign: 'right' }}>
                    <Text fw={600}>
                      {balanceInfo &&
                        formatMoneyWithSign({
                          value: balanceInfo.primaryBalance,
                        })}
                    </Text>
                    {balanceInfo?.originalBalance && (
                      <Text size="sm" c="dimmed">
                        {formatMoneyWithSign({
                          value: balanceInfo.originalBalance,
                          appendCurrency: true,
                        })}
                      </Text>
                    )}
                  </div>
                </Group>

                {fullAccount.bankLink?.institutionName && (
                  <Group justify="space-between">
                    <Text c="dimmed">Institution</Text>
                    <Text>{fullAccount.bankLink.institutionName}</Text>
                  </Group>
                )}

                {balanceHistory.latestSyncedAt && !isHoldingsMode && (
                  <Group justify="space-between">
                    <Text c="dimmed">Last synced</Text>
                    <Text>
                      {formatRelativeTime(balanceHistory.latestSyncedAt)}
                    </Text>
                  </Group>
                )}

                {isHoldingsMode && (
                  <>
                    {fullAccount.lastUserSnapshotAt && (
                      <Group justify="space-between">
                        <Text c="dimmed">Positions updated</Text>
                        <Text>{formatRelativeTime(fullAccount.lastUserSnapshotAt)}</Text>
                      </Group>
                    )}
                    {fullAccount.lastValuationAt && (
                      <Group justify="space-between">
                        <Text c="dimmed">Last valued</Text>
                        <Text>{formatRelativeTime(fullAccount.lastValuationAt)}</Text>
                      </Group>
                    )}
                    <Stack gap="xs" mt="sm">
                      <Group justify="space-between">
                        <Text fw={500}>Holdings snapshots</Text>
                        <Button
                          variant="subtle"
                          size="xs"
                          onClick={() => handleOpenHoldingsModal(undefined)}
                        >
                          Add Snapshot
                        </Button>
                      </Group>
                      {snapshots.length === 0 && (
                        <Text c="dimmed" size="sm">
                          No holdings snapshots yet.
                        </Text>
                      )}
                      {snapshots.map((snapshot) => (
                        <Group
                          key={snapshot.id}
                          justify="space-between"
                          align="center"
                        >
                          <div>
                            <Text size="sm" fw={500}>
                              {snapshot.snapshotDate}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {snapshot.holdings.length} holdings
                            </Text>
                          </div>
                          <Group gap="xs">
                            <Button
                              variant="light"
                              size="xs"
                              onClick={() => handleOpenHoldingsModal(snapshot)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="subtle"
                              color="red"
                              size="xs"
                              onClick={() =>
                                handleDeleteSnapshot(snapshot.snapshotDate)
                              }
                            >
                              Delete
                            </Button>
                          </Group>
                        </Group>
                      ))}
                    </Stack>
                  </>
                )}
              </>
            )}

            {balanceHistory.chartData.length > 0 && (
              <Box mt="md">
                <Text fw={500} mb="sm">
                  Balance history
                </Text>
                <Chart
                  data={balanceHistory.chartData}
                  height={200}
                  valueFormatter={(value) =>
                    formatMoneyNumber({ value, decimals: 2 })
                  }
                />
              </Box>
            )}
          </Stack>
        )}
      </Modal>

      {isManual && fullAccount && !isHoldingsMode && (
        <UpdateBalanceModal
          opened={updateModalOpened}
          onClose={closeUpdateModal}
          account={fullAccount}
        />
      )}

      {isManual && fullAccount && isHoldingsMode && (
        <UpdateHoldingsModal
          opened={updateModalOpened}
          onClose={handleCloseHoldingsModal}
          account={fullAccount}
          snapshot={selectedSnapshot}
        />
      )}
    </>
  )
}
