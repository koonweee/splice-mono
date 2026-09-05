import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, RefreshCw } from 'lucide-react'
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
import { EditorModal } from './forms/EditorModal'
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
  const [selectedSection, setSelectedSection] = useState<{
    accountId?: string
    value: string
  }>()
  const [
    notesEditorOpened,
    { open: openNotesEditor, close: closeNotesEditor },
  ] = useDisclosure(false)
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
  const activeSection =
    selectedSection && selectedSection.accountId === account?.id
      ? selectedSection.value
      : isInvestmentAccount
        ? 'holdings'
        : 'overview'
  const summaryIsHoldingsValued = account?.valuationMode === 'holdings'
  const {
    holdings,
    snapshotDate,
    accountCurrency,
    isLoading: holdingsLoading,
    isError: holdingsError,
  } = useInvestmentHoldings(
    account?.id,
    opened &&
      isInvestmentAccount &&
      (activeSection === 'holdings' || holdingsModalOpened),
  )
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
    opened &&
      isInvestmentAccount &&
      !summaryIsHoldingsValued &&
      activeSection === 'activity',
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
  }, [fullAccount?.id, fullAccount?.notes, opened])

  useEffect(() => {
    setStaleSymbols([])
    closeBalanceEditor()
    closeNotesEditor()
    closeHoldingsModal()
    setSelectedSection(undefined)
  }, [
    account?.id,
    closeBalanceEditor,
    closeHoldingsModal,
    closeNotesEditor,
    opened,
  ])

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
          closeNotesEditor()
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
  }, [
    closeNotesEditor,
    fullAccount,
    invalidateAccountData,
    notes,
    notesChanged,
    updateAccount,
  ])

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
      <EditorModal
        opened={opened}
        onClose={onClose}
        title={account?.customName ?? account?.name ?? 'Account details'}
        size="xl"
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
          <Stack gap="md" px={isMobile ? 'xs' : 'md'} py="sm">
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
              </>
            )}

            <Tabs
              classNames={{ list: styles.sectionList, tab: styles.sectionTab }}
              keepMounted={false}
              onChange={(value) => {
                if (value) setSelectedSection({ accountId: account?.id, value })
              }}
              value={activeSection}
            >
              <Tabs.List aria-label="Account sections">
                <Tabs.Tab value="overview">Overview</Tabs.Tab>
                {isInvestmentAccount && (
                  <Tabs.Tab value="holdings">Holdings</Tabs.Tab>
                )}
                {isInvestmentAccount && !isHoldingsValued && (
                  <Tabs.Tab value="activity">Activity</Tabs.Tab>
                )}
                <Tabs.Tab value="history">History</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="overview" pt="md">
                {fullAccount && (
                  <Stack gap="md">
                    {fullAccount.bankLink?.institutionName && (
                      <Group justify="space-between">
                        <Text c="dimmed" size="sm">
                          Institution
                        </Text>
                        <Text size="sm">
                          {fullAccount.bankLink.institutionName}
                        </Text>
                      </Group>
                    )}
                    {balanceHistory.latestSyncedAt && (
                      <Group justify="space-between">
                        <Text c="dimmed" size="sm">
                          Last synced
                        </Text>
                        <Text size="sm">
                          {formatRelativeTime(balanceHistory.latestSyncedAt)}
                        </Text>
                      </Group>
                    )}
                    <Box>
                      <Group
                        justify="space-between"
                        mb={notesEditorOpened || savedNotes ? 'xs' : 0}
                      >
                        <Text fw={500} size="sm">
                          Notes
                        </Text>
                        {!notesEditorOpened && (
                          <Button
                            leftSection={
                              savedNotes ? (
                                <Pencil size={14} />
                              ) : (
                                <Plus size={14} />
                              )
                            }
                            onClick={openNotesEditor}
                            size="compact-md"
                            variant="subtle"
                          >
                            {savedNotes ? 'Edit note' : 'Add note'}
                          </Button>
                        )}
                      </Group>
                      {notesEditorOpened ? (
                        <Stack gap="sm">
                          <Textarea
                            aria-label="Account notes"
                            autosize
                            minRows={3}
                            maxRows={10}
                            placeholder="Add a note about this account"
                            value={notes}
                            onChange={(event) =>
                              setNotes(event.currentTarget.value)
                            }
                            disabled={updateAccount.isPending}
                          />
                          <Group justify="flex-end">
                            <Button
                              disabled={updateAccount.isPending}
                              onClick={() => {
                                setNotes(savedNotes)
                                closeNotesEditor()
                              }}
                              variant="default"
                            >
                              Cancel
                            </Button>
                            <Button
                              aria-label="Save account notes"
                              disabled={!notesChanged}
                              loading={updateAccount.isPending}
                              onClick={saveNotes}
                            >
                              Save note
                            </Button>
                          </Group>
                        </Stack>
                      ) : savedNotes ? (
                        <Text className={styles.notesPreview} size="sm">
                          {savedNotes}
                        </Text>
                      ) : null}
                    </Box>
                  </Stack>
                )}
              </Tabs.Panel>

              {isInvestmentAccount && (
                <Tabs.Panel value="holdings" pt="md">
                  <Group
                    justify="space-between"
                    align="center"
                    mb="sm"
                    gap="xs"
                  >
                    <Text size="sm" c="dimmed">
                      {snapshotDate
                        ? `As of ${formatDateTime(snapshotDate)}`
                        : 'Current positions'}
                    </Text>
                    {isHoldingsValued && isManual && (
                      <Group gap={4} wrap="nowrap">
                        <Tooltip label="Edit holdings">
                          <ActionIcon
                            aria-label="Edit holdings"
                            disabled={holdingsLoading || holdingsError}
                            onClick={openHoldingsModal}
                            size={isMobile ? 44 : 'lg'}
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
                            size={isMobile ? 44 : 'lg'}
                            variant="subtle"
                          >
                            <RefreshCw size={18} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    )}
                  </Group>
                  {staleSymbols.length > 0 && (
                    <Alert color="yellow" mb="sm" role="status">
                      Using cached prices for {staleSymbols.join(', ')}. Quote
                      times are shown below.
                    </Alert>
                  )}
                  {holdingsLoading ? (
                    <Group
                      aria-label="Loading investment holdings"
                      justify="center"
                      py="md"
                      role="status"
                    >
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
                </Tabs.Panel>
              )}

              {isInvestmentAccount && !isHoldingsValued && (
                <Tabs.Panel value="activity" pt="md">
                  {!activityLoading && !activityInitialError && (
                    <Text c="dimmed" size="sm" mb="sm">
                      {investmentActivity.length} of {investmentActivityTotal}
                    </Text>
                  )}
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
                          onClick={() => void loadMoreInvestmentActivity()}
                          variant="light"
                        >
                          {investmentActivityLoadMoreError
                            ? 'Retry loading activity'
                            : 'Load more activity'}
                        </Button>
                      </Group>
                    )}
                </Tabs.Panel>
              )}

              <Tabs.Panel value="history" pt="md">
                {balanceHistory.chartData.length > 0 ? (
                  <Box>
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
                ) : (
                  <Text c="dimmed" size="sm">
                    No balance changes to chart for this period.
                  </Text>
                )}
              </Tabs.Panel>
            </Tabs>
          </Stack>
        )}
      </EditorModal>

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
