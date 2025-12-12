import { Box, Group, Loader, Modal, Stack, Text } from '@mantine/core'
import { useAccountControllerFindOne } from '../api/clients/spliceAPI'
import { useAccountBalanceHistory } from '../hooks/useBalanceData'
import type { AccountSummaryData } from '../lib/balance-utils'
import { resolveEffectiveBalance } from '../lib/balance-utils'
import {
  formatMoneyNumber,
  formatMoneyWithSign,
  resolveBalance,
} from '../lib/format'
import { useIsMobile } from '../lib/hooks'
import { Chart } from './Chart'

interface AccountModalProps {
  account?: AccountSummaryData
  opened: boolean
  onClose: () => void
}

export function AccountModal({ account, opened, onClose }: AccountModalProps) {
  const isMobile = useIsMobile()

  const { data: fullAccount, isLoading: isLoadingAccount } =
    useAccountControllerFindOne(account?.id ?? '', {
      query: { enabled: opened && !!account?.id },
    })

  const { data: balanceHistory, isLoading: isLoadingBalances } =
    useAccountBalanceHistory(account?.id, opened && !!account?.id)

  const isLoading = isLoadingAccount || isLoadingBalances

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
            : null,
      }
    : account
      ? resolveBalance(
          account.effectiveBalance,
          account.convertedEffectiveBalance,
        )
      : null

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
  )
}
