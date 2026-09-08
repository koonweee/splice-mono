import { Box, Button, Group, Skeleton, Stack, Tabs, Text } from '@mantine/core'
import { foundation } from '../lib/design-system/foundation'
import { TimePeriod } from '../lib/types'
import { AccountComparisonFrame } from './AccountComparisonFrame'
import { HomeChartSkeleton } from './Chart.skeleton'
import { AccountSections } from './AccountSections'
import accountStyles from './AccountModal.module.css'
import { InvestmentHoldingsTableSkeleton } from './investments/InvestmentHoldingsTable.skeleton'
import { InvestmentActivityTableSkeleton } from './investments/InvestmentActivityTable.skeleton'
import type { AccountSummaryData } from '../lib/balance-utils'

export function AccountDetailsSkeleton({
  account,
  section,
  period = TimePeriod.all,
}: {
  account?: AccountSummaryData
  section?: string
  period?: TimePeriod
}) {
  const investment =
    account?.type === 'investment' || account?.type === 'brokerage'
  const selected = section ?? (investment ? 'holdings' : 'details')
  const convertedBalance =
    account?.valuationMode !== 'holdings' &&
    account?.convertedEffectiveBalance &&
    account.effectiveBalance.money.currency !==
      account.convertedEffectiveBalance.money.currency
  return (
    <Stack gap="md" className={accountStyles.detailsBody}>
      <Group
        justify="space-between"
        wrap="nowrap"
        className={accountStyles.balanceRow}
        data-converted={Boolean(convertedBalance)}
      >
        <Text data-typography="body" c="dimmed">
          Current balance
        </Text>
        <Group justify="flex-end" className={accountStyles.balanceValue}>
          <Stack gap={4} align="flex-end">
            <Skeleton h={20} w={120} />
            {convertedBalance && <Skeleton h={16} w={90} />}
          </Stack>
        </Group>
      </Group>
      {account?.changePercent !== undefined && (
        <AccountComparisonFrame period={period}>
          <Skeleton height={18} width={80} />
        </AccountComparisonFrame>
      )}
      <Tabs
        value={selected}
        classNames={{
          list: accountStyles.sectionList,
          tab: accountStyles.sectionTab,
        }}
      >
        <AccountSections
          investment={investment}
          holdingsValued={account?.valuationMode === 'holdings'}
          disabled
        />
        <Box pt="md">
          {selected === 'details' ? (
            <Stack gap="md">
              {account?.institutionName && (
                <Group justify="space-between">
                  <Text data-typography="metadata" c="dimmed">
                    Institution
                  </Text>
                  <Skeleton h={14} w={120} />
                </Group>
              )}
              {account?.syncedAt && (
                <Group justify="space-between">
                  <Text data-typography="metadata" c="dimmed">
                    Last synced
                  </Text>
                  <Skeleton h={14} w={120} />
                </Group>
              )}
              <Group justify="space-between">
                <Text data-typography="label">Notes</Text>
                <Button disabled size="compact-md" variant="subtle">
                  <Skeleton h={14} w={82} />
                </Button>
              </Group>
            </Stack>
          ) : selected === 'history' ? (
            <>
              <Text data-typography="rowTitle" mb="sm">
                Balance history
              </Text>
              <HomeChartSkeleton height={200} />
            </>
          ) : (
            <>
              <Group
                justify="space-between"
                mb="sm"
                mih={foundation.dimensions.touchTarget}
              >
                <Skeleton h={14} w={150} />
                <Skeleton h={34} w={72} />
              </Group>
              <Box className={accountStyles.holdingsRegion}>
                {selected === 'activity' ? (
                  <InvestmentActivityTableSkeleton />
                ) : (
                  <InvestmentHoldingsTableSkeleton rows={1} />
                )}
              </Box>
            </>
          )}
        </Box>
      </Tabs>
    </Stack>
  )
}
