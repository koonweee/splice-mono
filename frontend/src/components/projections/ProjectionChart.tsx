import { Box, Group, Paper, Select, Text } from '@mantine/core'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoneyNumber } from '../../lib/format'
import type { ProjectionResult } from '../../lib/projections/types'

function compactCurrency(value: number, currency: string): string {
  if (Math.abs(value) >= 1000000) {
    return `${formatMoneyNumber({
      value: value / 1000000,
      currency,
      decimals: 1,
    })}M`
  }
  if (Math.abs(value) >= 1000) {
    return `${formatMoneyNumber({
      value: value / 1000,
      currency,
      decimals: 0,
    })}K`
  }
  return formatMoneyNumber({ value, currency, decimals: 0 })
}

export function ProjectionChart({
  result,
}: {
  result: ProjectionResult
}) {
  const [mounted, setMounted] = useState(false)
  const today = dayjs().format('YYYY-MM-DD')
  const annotatedPoints = result.annotations
    .filter((annotation) => annotation.date && annotation.value !== undefined)
    .slice(0, 3)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="md">
        <Text fw={700}>Net worth projection</Text>
        <Select
          aria-label="Projection display mode"
          data={[{ label: 'Nominal', value: 'nominal' }]}
          value="nominal"
          w={140}
        />
      </Group>
      <Box h={{ base: 360, md: 430 }}>
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={result.points}
              margin={{ top: 24, right: 24, bottom: 12, left: 8 }}
            >
              <CartesianGrid
                stroke="var(--mantine-color-default-border)"
                strokeOpacity={0.5}
                vertical={false}
              />
              <XAxis
                dataKey="date"
                minTickGap={32}
                tickFormatter={(date) => dayjs(date).format('YYYY')}
                stroke="var(--mantine-color-dimmed)"
              />
              <YAxis
                tickFormatter={(value) =>
                  compactCurrency(Number(value), result.currency)
                }
                stroke="var(--mantine-color-dimmed)"
                width={72}
              />
              <Tooltip
                formatter={(value) =>
                  formatMoneyNumber({
                    value: Number(value),
                    currency: result.currency,
                    decimals: 0,
                  })
                }
                labelFormatter={(label) =>
                  dayjs(String(label)).format('MMM D, YYYY')
                }
                contentStyle={{
                  background: 'var(--mantine-color-body)',
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 8,
                }}
              />
              <Area
                dataKey="projectedHigh"
                fill="var(--mantine-color-teal-8)"
                fillOpacity={0.14}
                stroke="none"
                type="monotone"
              />
              <Area
                dataKey="projectedLow"
                fill="var(--mantine-color-body)"
                fillOpacity={1}
                stroke="none"
                type="monotone"
              />
              <Line
                dataKey="historical"
                dot={false}
                name="Historical"
                stroke="var(--mantine-color-teal-5)"
                strokeWidth={2}
                type="monotone"
              />
              <Line
                dataKey="projectedMedian"
                dot={false}
                name="Projected median"
                stroke="var(--mantine-color-teal-4)"
                strokeDasharray="8 8"
                strokeWidth={2}
                type="monotone"
              />
              <ReferenceLine
                x={today}
                label={{ value: 'Today', fill: 'var(--mantine-color-text)' }}
                stroke="var(--mantine-color-dimmed)"
                strokeDasharray="4 4"
              />
              {annotatedPoints.map((annotation) => (
                <ReferenceDot
                  key={annotation.id}
                  x={annotation.date}
                  y={annotation.value}
                  r={5}
                  fill="var(--mantine-color-teal-4)"
                  stroke="var(--mantine-color-teal-2)"
                  label={{
                    value: annotation.label,
                    fill: 'var(--mantine-color-text)',
                    fontSize: 12,
                    position: 'top',
                  }}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Paper>
  )
}
