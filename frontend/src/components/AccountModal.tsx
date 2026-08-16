import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { AccountType } from '../api/models'
import {
  getAccountControllerFindAllQueryKey,
  getBalanceQueryControllerGetAllBalancesQueryKey,
  getBalanceQueryControllerGetBalancesQueryKey,
  getInvestmentControllerFindLatestHoldingsForAccountQueryKey,
  investmentControllerSearchSecurities,
  useAccountControllerUpdate,
  useInvestmentControllerRefreshManualBrokeragePrices,
  useInvestmentControllerReplaceManualBrokerageHoldings,
} from '../api/clients/spliceAPI'
import { useAccountBalanceHistory } from '../hooks/useBalanceData'
import { useInvestmentActivity } from '../hooks/useInvestmentActivity'
import { useInvestmentHoldings } from '../hooks/useInvestmentHoldings'
import { resolveEffectiveBalance } from '../lib/balance-utils'
import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatDateTime,
  formatMoneyNumber,
  formatMoneyWithSign,
  formatRelativeTime,
} from '../lib/format'
import { useIsMobile } from '../lib/hooks'
import styles from './AccountModal.module.css'
import { InlineBalanceEditor } from './accounts/InlineBalanceEditor'
import { Chart } from './Chart'
import { InvestmentActivityTable } from './investments/InvestmentActivityTable'
import { InvestmentHoldingsTable } from './investments/InvestmentHoldingsTable'
import { ManualBrokerageHoldingsModal } from './investments/ManualBrokerageHoldingsModal'
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
  const replaceHoldings =
    useInvestmentControllerReplaceManualBrokerageHoldings()
  const refreshPrices = useInvestmentControllerRefreshManualBrokeragePrices()
  const [notes, setNotes] = useState('')
  const [savedNotes, setSavedNotes] = useState('')
  const [staleSymbols, setStaleSymbols] = useState<Array<string>>([])
  const [
    balanceEditorOpened,
    { open: openBalanceEditor, close: closeBalanceEditor },
  ] = useDisclosure(false)
  const [
    holdingsModalOpened,
    { open: openHoldingsModal, close: closeHoldingsModal },
  ] = useDisclosure(false)

  const {
    data: balanceHistory,
    isLoading,
    isFetching: balanceHistoryFetching,
    isError: balanceHistoryError,
    refetch: refetchBalanceHistory,
  } = useAccountBalanceHistory(account?.id, opened && !!account?.id, period)
  const isInvestmentAccount =
    account?.type === AccountType.investment ||
    account?.type === AccountType.brokerage
  const summaryIsHoldingsValued = account?.valuationMode === 'holdings'
  const {
    holdings,
    snapshotDate,
    accountCurrency,
    isLoading: holdingsLoading,
    isError: holdingsError,
  } = useInvestmentHoldings(account?.id, opened && isInvestmentAccount)
  const {
    activity: investmentActivity,
    total: investmentActivityTotal,
    hasMore: hasMoreInvestmentActivity,
    loadMore: loadMoreInvestmentActivity,
    isLoadingMore: investmentActivityLoadingMore,
    isLoading: activityLoading,
    isInitialError: activityInitialError,
    isLoadMoreError: investmentActivityLoadMoreError,
  } = useInvestmentActivity(
    account?.id,
    opened && isInvestmentAccount && !summaryIsHoldingsValued,
  )

  // Get account from balance history if available
  const fullAccount = balanceHistory.latestBalance?.account
  const isManual = !!fullAccount && !fullAccount.bankLinkId
  const isHoldingsValued =
    summaryIsHoldingsValued || fullAccount?.valuationMode === 'holdings'
  const notesChanged = notes !== savedNotes

  useEffect(() => {
    const nextNotes = fullAccount?.notes ?? ''
    setNotes(nextNotes)
    setSavedNotes(nextNotes)
  }, [fullAccount?.id, fullAccount?.notes])

  useEffect(() => {
    setStaleSymbols([])
    closeBalanceEditor()
  }, [account?.id, closeBalanceEditor, opened])

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
    if (account?.id) {
      queryClient.invalidateQueries({
        queryKey: getInvestmentControllerFindLatestHoldingsForAccountQueryKey(
          account.id,
        ),
      })
    }
  }, [account?.id, queryClient])

  const handleRefreshPrices = useCallback(() => {
    if (!account?.id) return
    refreshPrices.mutate(
      { accountId: account.id },
      {
        onSuccess: (response) => {
          setStaleSymbols(response.staleSymbols)
          invalidateAccountData()
          notifications.show({
            title: 'Prices refreshed',
            message:
              response.staleSymbols.length > 0
                ? `Using cached prices for ${response.staleSymbols.join(', ')}.`
                : 'Brokerage prices and value are up to date.',
            color: response.staleSymbols.length > 0 ? 'yellow' : 'green',
          })
        },
        onError: () => {
          notifications.show({
            title: 'Refresh failed',
            message:
              'Unable to refresh prices. The last successful value is still shown.',
            color: 'red',
          })
        },
      },
    )
  }, [account?.id, invalidateAccountData, refreshPrices])

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
            title: 'Notes saved',
            message: 'Account notes have been updated.',
            color: 'green',
          })
        },
        onError: () => {
          notifications.show({
            title: 'Save failed',
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
  const editableNativeBalance =
    latestBalance?.currentBalance.balance ?? fullAccount?.currentBalance
  const displaysConvertedManualBalance = Boolean(
    isManual &&
      !isHoldingsValued &&
      balanceInfo &&
      editableNativeBalance &&
      balanceInfo.primaryBalance.money.currency !==
        editableNativeBalance.money.currency,
  )

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title={account?.customName ?? account?.name ?? 'Account details'}
        size="xl"
        fullScreen={isMobile}
        transitionProps={{ transition: 'fade', duration: 200 }}
      >
        {isLoading ? (
          <Group
            aria-label="Loading account history"
            justify="center"
            py="xl"
            role="status"
          >
            <Loader />
          </Group>
        ) : balanceHistoryError ? (
          <Alert color="red" title="Unable to load account history" m="lg">
            <Text size="sm" mb="sm">
              Balance history for this account could not be loaded.
            </Text>
            <Button
              color="red"
              loading={balanceHistoryFetching}
              onClick={() => void refetchBalanceHistory()}
              size="xs"
              variant="light"
            >
              Retry
            </Button>
          </Alert>
        ) : (
          <Stack gap="md" p="lg">
            {!fullAccount && (
              <Text c="dimmed" size="sm">
                No balance history is available for this account.
              </Text>
            )}
            {fullAccount && (
              <>
                <Group
                  align="center"
                  className={styles.balanceRow}
                  justify="space-between"
                  wrap="nowrap"
                >
                  <Text c="dimmed">Current balance</Text>
                  {isManual && !isHoldingsValued ? (
                    <Stack
                      align="flex-end"
                      className={styles.balanceValue}
                      gap={0}
                    >
                      {displaysConvertedManualBalance && (
                        <Text fw={600}>
                          {balancesHidden
                            ? HIDDEN_BALANCE_PLACEHOLDER
                            : balanceInfo &&
                              formatMoneyWithSign({
                                value: balanceInfo.primaryBalance,
                              })}
                        </Text>
                      )}
                      {balanceEditorOpened ? (
                        <InlineBalanceEditor
                          account={fullAccount}
                          balance={
                            editableNativeBalance ?? fullAccount.currentBalance
                          }
                          onCancel={closeBalanceEditor}
                          onSaved={closeBalanceEditor}
                        />
                      ) : (
                        <Group
                          className={styles.nativeBalanceRow}
                          gap={4}
                          justify="flex-end"
                          wrap="nowrap"
                        >
                          <Text
                            c={
                              displaysConvertedManualBalance
                                ? 'dimmed'
                                : undefined
                            }
                            fw={displaysConvertedManualBalance ? 400 : 600}
                            size={
                              displaysConvertedManualBalance ? 'sm' : undefined
                            }
                          >
                            {balancesHidden
                              ? HIDDEN_BALANCE_PLACEHOLDER
                              : editableNativeBalance &&
                                formatMoneyWithSign({
                                  value: displaysConvertedManualBalance
                                    ? editableNativeBalance
                                    : (balanceInfo?.primaryBalance ??
                                      editableNativeBalance),
                                  appendCurrency:
                                    displaysConvertedManualBalance,
                                })}
                          </Text>
                          <Tooltip label="Edit balance">
                            <ActionIcon
                              aria-label="Edit balance"
                              onClick={openBalanceEditor}
                              size={isMobile ? 44 : 'md'}
                              variant="subtle"
                            >
                              <Pencil size={18} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      )}
                    </Stack>
                  ) : (
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
                  )}
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
                      <Tooltip label="Save notes">
                        <ActionIcon
                          aria-label="Save account notes"
                          loading={updateAccount.isPending}
                          onClick={saveNotes}
                          size={isMobile ? 44 : 'md'}
                          variant="subtle"
                        >
                          <Check size={18} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Box>

                {isInvestmentAccount && (
                  <Stack gap="md" mt="md">
                    <Box>
                      {isMobile ? (
                        <Stack gap="xs" mb="sm">
                          <Group justify="space-between" wrap="nowrap">
                            <Group gap={4} wrap="nowrap">
                              <Text fw={500}>Holdings</Text>
                              {snapshotDate && (
                                <Text size="xs" c="dimmed">
                                  (as of {formatDateTime(snapshotDate)})
                                </Text>
                              )}
                            </Group>
                            {isHoldingsValued && isManual && (
                              <Group gap={4} wrap="nowrap">
                                <Tooltip label="Edit holdings">
                                  <ActionIcon
                                    aria-label="Edit holdings"
                                    disabled={holdingsLoading || holdingsError}
                                    onClick={openHoldingsModal}
                                    size={44}
                                    variant="subtle"
                                  >
                                    <Pencil size={18} />
                                  </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Refresh prices">
                                  <ActionIcon
                                    aria-label="Refresh prices"
                                    loading={refreshPrices.isPending}
                                    onClick={handleRefreshPrices}
                                    size={44}
                                    variant="subtle"
                                  >
                                    <RefreshCw size={18} />
                                  </ActionIcon>
                                </Tooltip>
                              </Group>
                            )}
                          </Group>
                        </Stack>
                      ) : (
                        <Group justify="space-between" mb="sm">
                          <Group gap={4} wrap="nowrap">
                            <Text fw={500}>Holdings</Text>
                            {snapshotDate && (
                              <Text size="xs" c="dimmed">
                                (as of {formatDateTime(snapshotDate)})
                              </Text>
                            )}
                          </Group>
                          <Group gap="xs">
                            {isHoldingsValued && isManual && (
                              <>
                                <Tooltip label="Edit holdings">
                                  <ActionIcon
                                    aria-label="Edit holdings"
                                    disabled={holdingsLoading || holdingsError}
                                    onClick={openHoldingsModal}
                                    size="md"
                                    variant="subtle"
                                  >
                                    <Pencil size={16} />
                                  </ActionIcon>
                                </Tooltip>
                                <Tooltip label="Refresh prices">
                                  <ActionIcon
                                    aria-label="Refresh prices"
                                    loading={refreshPrices.isPending}
                                    onClick={handleRefreshPrices}
                                    size="md"
                                    variant="subtle"
                                  >
                                    <RefreshCw size={16} />
                                  </ActionIcon>
                                </Tooltip>
                              </>
                            )}
                          </Group>
                        </Group>
                      )}
                      {staleSymbols.length > 0 && (
                        <Alert color="yellow" mb="sm" role="status">
                          Using cached prices for {staleSymbols.join(', ')}.
                          Quote times are shown below.
                        </Alert>
                      )}
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
                          accountCurrency={accountCurrency}
                          holdings={holdings}
                          balancesHidden={balancesHidden}
                        />
                      )}
                    </Box>

                    {!isHoldingsValued && (
                      <Box>
                        <Group justify="space-between" mb="sm">
                          <Text fw={500}>Activity</Text>
                          {!activityLoading && !activityInitialError && (
                            <Text c="dimmed" size="xs">
                              {investmentActivity.length} of{' '}
                              {investmentActivityTotal}
                            </Text>
                          )}
                        </Group>
                        {activityLoading ? (
                          <Group
                            aria-label="Loading investment activity"
                            justify="center"
                            py="md"
                            role="status"
                          >
                            <Loader size="sm" />
                          </Group>
                        ) : activityInitialError ? (
                          <Text c="dimmed" size="sm">
                            Provider activity is unavailable or incomplete.
                          </Text>
                        ) : (
                          <InvestmentActivityTable
                            activity={investmentActivity}
                            balancesHidden={balancesHidden}
                            total={investmentActivityTotal}
                          />
                        )}
                        {investmentActivityLoadMoreError && (
                          <Text c="red" mt="sm" role="alert" size="sm">
                            Unable to load more provider activity.
                          </Text>
                        )}
                        {!activityLoading &&
                          !activityInitialError &&
                          (hasMoreInvestmentActivity ||
                            investmentActivityLoadMoreError) && (
                            <Group justify="center" mt="sm">
                              <Button
                                loading={investmentActivityLoadingMore}
                                onClick={() =>
                                  void loadMoreInvestmentActivity()
                                }
                                size="xs"
                                variant="light"
                              >
                                {investmentActivityLoadMoreError
                                  ? 'Retry loading activity'
                                  : 'Load more activity'}
                              </Button>
                            </Group>
                          )}
                      </Box>
                    )}
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

      {isManual && isHoldingsValued && account?.id && (
        <ManualBrokerageHoldingsModal
          accountId={account.id}
          holdings={holdings}
          onClose={closeHoldingsModal}
          onSaved={(response) => {
            setStaleSymbols(response.staleSymbols)
            invalidateAccountData()
          }}
          opened={holdingsModalOpened}
          saveHoldings={(positions) =>
            replaceHoldings.mutateAsync({
              accountId: account.id,
              data: { positions },
            })
          }
          searchSecurities={(query, signal) =>
            investmentControllerSearchSecurities({ query, limit: 10 }, signal)
          }
        />
      )}
    </>
  )
}
