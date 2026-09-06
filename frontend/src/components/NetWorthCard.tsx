import {
  Alert,
  Box,
  Button,
  Group,
  Paper,
  Skeleton,
  Text,
  Title,
  VisuallyHidden,
} from '@mantine/core'
import { useState } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatMoneyNumber,
  formatMoneyWithSign,
  getChangeColorMantine,
} from '../lib/format'
import { ChartSkeleton } from './loading/ChartSkeleton'
import { HomePeriodControl } from './HomePeriodControl'
import styles from './NetWorthCard.module.css'
import { ChangePercentPopover } from './ChangePercentPopover'
import { LazyChart as Chart } from './LazyChart'
import type { ChartDataPoint } from './Chart'
import type { TimePeriod } from '@/lib/types'
import type { MoneyWithSign } from '../api/models'
import { TIME_PERIOD_LABELS } from '@/lib/types'

export function NetWorthCard({
  balancesHidden,
  netWorth,
  changePercent,
  changeAmount,
  comparisonPeriod,
  comparisonLoading = false,
  chartData,
  chartLoading,
  chartError,
  onRetryChart,
  period,
  onPeriodChange,
}: {
  period?: TimePeriod
  onPeriodChange?: (period: TimePeriod) => void
  balancesHidden: boolean
  netWorth: MoneyWithSign
  changePercent?: number
  changeAmount?: MoneyWithSign
  comparisonPeriod: TimePeriod
  comparisonLoading?: boolean
  chartLoading?: boolean
  chartError?: boolean
  onRetryChart?: () => void
  chartData?: Array<ChartDataPoint>
}) {
  const hasChartData = chartData && chartData.length > 0
  const [hover, setHover] = useState<{
    point?: ChartDataPoint
    data: typeof chartData
  }>()
  // Ignore points from an old dataset, including during a period transition.
  const hoveredPoint =
    !comparisonLoading &&
    !chartLoading &&
    !chartError &&
    hover?.data === chartData
      ? hover?.point
      : undefined

  const displayValue = hoveredPoint
    ? formatMoneyWithSign({ value: hoveredPoint.money })
    : formatMoneyWithSign({ value: netWorth })
  const visibleDisplayValue = balancesHidden
    ? HIDDEN_BALANCE_PLACEHOLDER
    : displayValue

  return (
    <Paper mb={8}>
      <Box>
        <Title order={2} className={styles.amount}>
          <VisuallyHidden>Net worth: </VisuallyHidden>
          {visibleDisplayValue}
        </Title>
        <Box aria-busy={comparisonLoading} style={{ position: 'relative' }}>
          {comparisonLoading && (
            <Skeleton
              aria-hidden="true"
              h={14}
              w={180}
              style={{
                position: 'absolute',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />
          )}
          {hoveredPoint && (
            <Text size="sm" c="dimmed" pos="absolute" top={0}>
              {hoveredPoint.label}
            </Text>
          )}
          <Group
            gap={3}
            wrap="nowrap"
            style={{
              visibility:
                !comparisonLoading &&
                !hoveredPoint &&
                changePercent !== undefined &&
                changePercent !== 0
                  ? 'visible'
                  : 'hidden',
            }}
          >
            {!comparisonLoading && (
              <ChangePercentPopover
                size="sm"
                color={getChangeColorMantine(false, changePercent)}
                changeAmount={changeAmount}
                changePercent={changePercent}
                hidden={balancesHidden}
              />
            )}
            <Text aria-hidden={comparisonLoading} size="sm" c="dimmed">
              {comparisonLoading
                ? '\u00A0'
                : comparisonPeriod === 'all'
                  ? 'since first recorded balance'
                  : `from last ${TIME_PERIOD_LABELS[comparisonPeriod].toLowerCase()}`}
            </Text>
          </Group>
        </Box>
      </Box>
      {/* The streamed series can settle between SSR and hydration. Keep this
          region deterministic without making the summary wait for the chart. */}
      <Box mt="xs" h={180} style={{ position: 'relative' }}>
        <ClientOnly fallback={<ChartSkeleton />}>
          {hasChartData ||
          (!chartError && (comparisonLoading || chartLoading)) ? (
            <Chart
              data={chartData ?? []}
              placeholder
              loading={!hasChartData}
              minimal
              animate
              interactive={!comparisonLoading && !chartLoading && !chartError}
              height={180}
              valueFormatter={(value) =>
                balancesHidden
                  ? HIDDEN_BALANCE_PLACEHOLDER
                  : formatMoneyNumber({
                      value,
                      currency: netWorth.money.currency,
                      decimals: 0,
                    })
              }
              onDataPointHover={(point) => setHover({ point, data: chartData })}
            />
          ) : !chartError ? (
            <Text size="sm" c="dimmed">
              No history for this period.
            </Text>
          ) : null}
          {chartError && (
            <Alert
              color="red"
              title="Chart unavailable"
              style={{ position: 'absolute', inset: 0, zIndex: 1 }}
            >
              The summary is still available.{' '}
              <Button variant="subtle" onClick={onRetryChart}>
                Retry chart
              </Button>
            </Alert>
          )}
        </ClientOnly>
      </Box>
      {period && onPeriodChange && (
        <Box mt={8}>
          <HomePeriodControl period={period} onChange={onPeriodChange} />
        </Box>
      )}
    </Paper>
  )
}
