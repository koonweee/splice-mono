import {
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Textarea,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AccountType } from '../api/models'
import {
  getAccountControllerFindAllQueryKey,
  getBalanceQueryControllerGetAllBalancesQueryKey,
  getBalanceQueryControllerGetBalancesQueryKey,
  useAccountControllerUpdate,
} from '../api/clients/spliceAPI'
import { useAccountBalanceHistory } from '../hooks/useBalanceData'
import { useInvestmentActivity } from '../hooks/useInvestmentActivity'
import { useInvestmentHoldings } from '../hooks/useInvestmentHoldings'
import { resolveEffectiveBalance } from '../lib/balance-utils'
import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatMoneyNumber,
  formatMoneyWithSign,
  formatRelativeTime,
} from '../lib/format'
import { useIsMobile } from '../lib/hooks'
import styles from './AccountModal.module.css'
import { UpdateBalanceModal } from './accounts/UpdateBalanceModal'
import { Chart } from './Chart'
import { InvestmentActivityTable } from './investments/InvestmentActivityTable'
import { InvestmentHoldingsTable } from './investments/InvestmentHoldingsTable'
import type { TimePeriod } from '../lib/types'
import type { AccountSummaryData } from '../lib/balance-utils'

interface AccountModalProps {
  account?: AccountSummaryData
  opened: boolean
  onClose: () => void
  period: TimePeriod
  balancesHidden?: boolean
}

export function AccountModal({
  account,
  opened,
  onClose,
  period,
  balancesHidden = false,
}: AccountModalProps) {
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const updateAccount = useAccountControllerUpdate()
  const [notes, setNotes] = useState('')
  const [savedNotes, setSavedNotes] = useState('')
  const [
    updateModalOpened,
    { open: openUpdateModal, close: closeUpdateModal },
  ] = useDisclosure(false)

  const { data: balanceHistory, isLoading } = useAccountBalanceHistory(
    account?.id,
    opened && !!account?.id,
    period,
  )
  const isInvestmentAccount =
    account?.type === AccountType.investment ||
    account?.type === AccountType.brokerage
  const {
    holdings,
    snapshotDate,
    isLoading: holdingsLoading,
    isError: holdingsError,
  } = useInvestmentHoldings(account?.id, opened && isInvestmentAccount)
  const {
    activity: investmentActivity,
    isLoading: activityLoading,
    isError: activityError,
  } = useInvestmentActivity(account?.id, opened && isInvestmentAccount)

  // Get account from balance history if available
  const fullAccount = balanceHistory.latestBalance?.account
  const isManual = !!fullAccount && !fullAccount.bankLinkId
  const notesChanged = notes !== savedNotes

  useEffect(() => {
    const nextNotes = fullAccount?.notes ?? ''
    setNotes(nextNotes)
    setSavedNotes(nextNotes)
  }, [fullAccount?.id, fullAccount?.notes])

  const invalidateAccountData = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: getAccountControllerFindAllQueryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: getBalanceQueryControllerGetBalancesQueryKey(),
    })
    queryClient.invalidateQueries({
      queryKey: getBalanceQueryControllerGetAllBalancesQueryKey(),
    })
  }, [queryClient])

  const saveNotes = useCallback(() => {
    if (!fullAccount || !notesChanged) return

    const normalizedNotes = notes.trim()
    updateAccount.mutate(
      {
        id: fullAccount.id,
        data: { notes: normalizedNotes.length ? normalizedNotes : null },
      },
      {
        onSuccess: (updatedAccount) => {
          const nextNotes = updatedAccount.notes ?? ''
          setNotes(nextNotes)
          setSavedNotes(nextNotes)
          invalidateAccountData()
          notifications.show({
            title: 'Notes Saved',
            message: 'Account notes have been updated.',
            color: 'green',
          })
        },
        onError: () => {
          notifications.show({
            title: 'Save Failed',
            message: 'Unable to save account notes. Please try again.',
            color: 'red',
          })
        },
      },
    )
  }, [fullAccount, invalidateAccountData, notes, notesChanged, updateAccount])

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
                        onClick={openUpdateModal}
                      >
                        Update Balance
                      </Button>
                    )}
                  </Group>
                  <div style={{ textAlign: 'right' }}>
                    <Text fw={600}>
                      {balancesHidden
                        ? HIDDEN_BALANCE_PLACEHOLDER
                        : balanceInfo &&
                          formatMoneyWithSign({
                            value: balanceInfo.primaryBalance,
                          })}
                    </Text>
                    {balanceInfo?.originalBalance && (
                      <Text size="sm" c="dimmed">
                        {balancesHidden
                          ? HIDDEN_BALANCE_PLACEHOLDER
                          : formatMoneyWithSign({
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

                {balanceHistory.latestSyncedAt && (
                  <Group justify="space-between">
                    <Text c="dimmed">Last synced</Text>
                    <Text>
                      {formatRelativeTime(balanceHistory.latestSyncedAt)}
                    </Text>
                  </Group>
                )}

                <Box mt="xs">
                  <Text fw={500} mb="xs">
                    Notes
                  </Text>
                  <Textarea
                    aria-label="Account notes"
                    autosize
                    minRows={4}
                    maxRows={10}
                    placeholder="Enter notes here"
                    value={notes}
                    onChange={(event) => setNotes(event.currentTarget.value)}
                    size="md"
                    classNames={{ input: styles.notesInput }}
                  />
                  {notesChanged && (
                    <Group justify="flex-end" mt="xs">
                      <Button
                        aria-label="Save account notes"
                        size="xs"
                        leftSection={<Save size={14} />}
                        loading={updateAccount.isPending}
                        onClick={saveNotes}
                      >
                        Save
                      </Button>
                    </Group>
                  )}
                </Box>

                {isInvestmentAccount && (
                  <Stack gap="md" mt="md">
                    <Box>
                      <Group justify="space-between" mb="sm">
                        <Text fw={500}>Holdings</Text>
                        {snapshotDate && (
                          <Text size="xs" c="dimmed">
                            {snapshotDate}
                          </Text>
                        )}
                      </Group>
                      {holdingsLoading ? (
                        <Group justify="center" py="md">
                          <Loader size="sm" />
                        </Group>
                      ) : holdingsError ? (
                        <Text c="dimmed" size="sm">
                          Holdings unavailable.
                        </Text>
                      ) : (
                        <InvestmentHoldingsTable
                          holdings={holdings}
                          balancesHidden={balancesHidden}
                        />
                      )}
                    </Box>

                    <Box>
                      <Text fw={500} mb="sm">
                        Activity
                      </Text>
                      {activityLoading ? (
                        <Group justify="center" py="md">
                          <Loader size="sm" />
                        </Group>
                      ) : activityError ? (
                        <Text c="dimmed" size="sm">
                          Provider activity is unavailable or incomplete.
                        </Text>
                      ) : (
                        <InvestmentActivityTable
                          activity={investmentActivity}
                          balancesHidden={balancesHidden}
                        />
                      )}
                    </Box>
                  </Stack>
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
                    balancesHidden
                      ? HIDDEN_BALANCE_PLACEHOLDER
                      : formatMoneyNumber({ value, decimals: 2 })
                  }
                />
              </Box>
            )}
          </Stack>
        )}
      </Modal>

      {isManual && (
        <UpdateBalanceModal
          opened={updateModalOpened}
          onClose={closeUpdateModal}
          account={fullAccount}
        />
      )}
    </>
  )
}
