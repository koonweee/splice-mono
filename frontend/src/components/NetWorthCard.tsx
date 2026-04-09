import {
  ActionIcon,
  Box,
  Group,
  Paper,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatMoneyNumber,
  formatMoneyWithSign,
  formatPercent,
  getChangeColorMantine,
} from '../lib/format'
import { Chart } from './Chart'
import type { ChartDataPoint } from './Chart'
import type { TimePeriod } from '@/lib/types'
import type { MoneyWithSign } from '../api/models'
import { TIME_PERIOD_LABELS } from '@/lib/types'

export function NetWorthCard({
  balancesHidden,
  netWorth,
  onToggleBalancesHidden,
  changePercent,
  comparisonPeriod,
  chartData,
}: {
  balancesHidden: boolean
  netWorth: MoneyWithSign
  onToggleBalancesHidden: () => void
  changePercent?: number
  comparisonPeriod: TimePeriod
  chartData?: Array<ChartDataPoint>
}) {
  const hasChartData = chartData && chartData.length > 0
  const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | undefined>(
    undefined,
  )

  const displayValue = hoveredPoint
    ? formatMoneyNumber({ value: hoveredPoint.value })
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
        <Text
          size="sm"
          c={getChangeColorMantine(false, changePercent ?? 0)}
          style={{
            visibility:
              !hoveredPoint &&
              changePercent !== undefined &&
              changePercent !== 0
                ? 'visible'
                : 'hidden',
          }}
        >
          {formatPercent(changePercent ?? 0)} from last{' '}
          {TIME_PERIOD_LABELS[comparisonPeriod].toLowerCase()}
        </Text>
      </Box>
      {hasChartData && (
        <Box mt="md">
          <Chart
            data={chartData}
            height={200}
            valueFormatter={(value) =>
              formatMoneyNumber({ value, decimals: 0 })
            }
            onDataPointHover={setHoveredPoint}
          />
        </Box>
      )}
    </Paper>
  )
}
