import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Group,
  Paper,
  Skeleton,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { ClientOnly } from '@tanstack/react-router'
import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatMoneyNumber,
  formatMoneyWithSign,
  getChangeColorMantine,
} from '../lib/format'
import { ChangePercentPopover } from './ChangePercentPopover'
import { LazyChart as Chart } from './LazyChart'
import type { ChartDataPoint } from './Chart'
import type { TimePeriod } from '@/lib/types'
import type { MoneyWithSign } from '../api/models'
import { TIME_PERIOD_LABELS } from '@/lib/types'

export function NetWorthCard({
  balancesHidden,
  netWorth,
  onToggleBalancesHidden,
  changePercent,
  changeAmount,
  comparisonPeriod,
  comparisonLoading = false,
  chartData,
  chartLoading,
  chartError,
  onRetryChart,
}: {
  balancesHidden: boolean
  netWorth: MoneyWithSign
  onToggleBalancesHidden: () => void
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
    !comparisonLoading && hover?.data === chartData ? hover?.point : undefined

  const displayValue = hoveredPoint
    ? formatMoneyWithSign({ value: hoveredPoint.money })
    : formatMoneyWithSign({ value: netWorth })
  const visibleDisplayValue = balancesHidden
    ? HIDDEN_BALANCE_PLACEHOLDER
    : displayValue

  const displayLabel = ['Net worth', hoveredPoint?.label]
    .filter(Boolean)
    .join(' - ')
  const toggleLabel = balancesHidden ? 'Show balances' : 'Hide balances'

  return (
    <Paper mb="xl">
      <Box>
        <Group gap={4} align="center" mb={4} wrap="nowrap">
          <Text size="sm" c="dimmed">
            {displayLabel}
          </Text>
          <Tooltip label={toggleLabel}>
            <ActionIcon
              variant="subtle"
              size="sm"
              c="dimmed"
              aria-label={toggleLabel}
              aria-pressed={balancesHidden}
              onClick={onToggleBalancesHidden}
            >
              {balancesHidden ? <EyeOff size={16} /> : <Eye size={16} />}
            </ActionIcon>
          </Tooltip>
        </Group>
        <Title order={2} size="h1">
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
            <Text
              aria-hidden={comparisonLoading}
              size="sm"
              c={getChangeColorMantine(false, changePercent)}
            >
              {comparisonLoading
                ? '\u00A0'
                : `from last ${TIME_PERIOD_LABELS[comparisonPeriod].toLowerCase()}`}
            </Text>
          </Group>
        </Box>
      </Box>
      {/* The streamed series can settle between SSR and hydration. Keep this
          region deterministic without making the summary wait for the chart. */}
      <Box mt="md" h={200} style={{ position: 'relative' }}>
        <ClientOnly
          fallback={<Skeleton height={200} aria-label="Loading chart" />}
        >
          {comparisonLoading || (chartLoading && !hasChartData) ? (
            <Skeleton height={200} aria-label="Loading chart" />
          ) : hasChartData ? (
            <Chart
              data={chartData}
              height={200}
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
    </Paper>
  )
}
