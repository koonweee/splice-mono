import { useState } from 'react'
import { DonutChart } from '@mantine/charts'
import {
  Alert,
  Box,
  Button,
  Grid,
  Group,
  Loader,
  Paper,
  Progress,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useDisclosure } from '@mantine/hooks'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { useTransactionAnalysisControllerGetAnalysis } from '../../api/clients/spliceAPI'
import { CategoryTransactionsModal } from '../../components/CategoryTransactionsModal'
import {
  formatMoneyNumber,
  formatPrimaryCategory,
  getDecimalPlaces,
} from '../../lib/format'
import { getCategoryColor } from '../../lib/constants'
import type { CategoryAggregate } from '../../api/models'
import type { DatesRangeValue } from '@mantine/dates'

// --- Route ---

type AnalysisSearch = {
  startDate?: string
  endDate?: string
}

const isValidDateString = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

export const Route = createFileRoute('/_authed/analysis')({
  component: AnalysisPage,
  validateSearch: (search: Record<string, unknown>): AnalysisSearch => {
    if (
      isValidDateString(search.startDate) &&
      isValidDateString(search.endDate)
    ) {
      return { startDate: search.startDate, endDate: search.endDate }
    }
    return {}
  },
})

// --- Helpers ---

function toMajorUnits(amount: number, currency: string): number {
  const decimals = getDecimalPlaces(currency)
  return amount / Math.pow(10, decimals)
}

function formatAmount(amount: number, currency: string): string {
  return formatMoneyNumber({
    value: toMajorUnits(amount, currency),
    currency,
    decimals: 0,
  })
}

// --- Components ---

function SummaryStrip({
  totalInflow,
  totalOutflow,
  netFlow,
  currency,
}: {
  totalInflow: number
  totalOutflow: number
  netFlow: number
  currency: string
}) {
  const total = totalInflow + totalOutflow
  const inflowPct = total > 0 ? (totalInflow / total) * 100 : 50

  return (
    <Paper p="md" radius="md" withBorder>
      <Group justify="space-between" wrap="wrap" gap="md" mb="sm">
        <Group gap="lg">
          <Group gap={6}>
            <ArrowDownLeft size={16} color="var(--mantine-color-teal-6)" />
            <Text size="sm" c="dimmed" fw={500}>
              Inflows
            </Text>
            <Text fw={700}>{formatAmount(totalInflow, currency)}</Text>
          </Group>
          <Group gap={6}>
            <ArrowUpRight size={16} color="var(--mantine-color-red-6)" />
            <Text size="sm" c="dimmed" fw={500}>
              Outflows
            </Text>
            <Text fw={700}>{formatAmount(totalOutflow, currency)}</Text>
          </Group>
        </Group>
        <Group gap={6}>
          <Text size="sm" c="dimmed" fw={500}>
            Net
          </Text>
          <Text fw={700} c={netFlow >= 0 ? 'teal' : 'red'}>
            {netFlow >= 0 ? '+' : ''}
            {formatAmount(netFlow, currency)}
          </Text>
        </Group>
      </Group>
      <Progress.Root size="sm" radius="xl">
        <Progress.Section value={inflowPct} color="teal" />
        <Progress.Section value={100 - inflowPct} color="red" />
      </Progress.Root>
    </Paper>
  )
}

function FlowSection({
  title,
  icon: Icon,
  iconColor,
  categories,
  total,
  currency,
  onCategoryClick,
}: {
  title: string
  icon: React.ComponentType<{ size: number }>
  iconColor: string
  categories: Array<CategoryAggregate>
  total: number
  currency: string
  onCategoryClick: (category: string) => void
}) {
  if (categories.length === 0) {
    return (
      <Paper p="lg" radius="md" withBorder>
        <Group gap="xs" mb="md">
          <Icon size={18} />
          <Text fw={600}>{title}</Text>
        </Group>
        <Text c="dimmed" ta="center" py="xl">
          No data for this period
        </Text>
      </Paper>
    )
  }

  const chartData = categories.map((cat, i) => ({
    name: formatPrimaryCategory(cat.primaryCategory),
    value: toMajorUnits(cat.totalAmount, currency),
    color: getCategoryColor(cat.primaryCategory, i),
  }))

  return (
    <Paper p="lg" radius="md" withBorder>
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <Box c={iconColor}>
            <Icon size={18} />
          </Box>
          <Text fw={600}>{title}</Text>
        </Group>
        <Text fw={600} c="dimmed">
          {formatAmount(total, currency)}
        </Text>
      </Group>

      <Grid gutter="lg" align="center">
        <Grid.Col span={{ base: 12, sm: 4 }}>
          <Box style={{ display: 'flex', justifyContent: 'center' }}>
            <DonutChart
              data={chartData}
              size={160}
              thickness={24}
              tooltipDataSource="segment"
              chartLabel={formatAmount(total, currency)}
              valueFormatter={(value) =>
                formatMoneyNumber({ value, currency, decimals: 0 })
              }
            />
          </Box>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 8 }}>
          <Stack gap={4}>
            {categories.map((cat, i) => {
              const pct = total > 0 ? (cat.totalAmount / total) * 100 : 0

              return (
                <UnstyledButton
                  key={cat.primaryCategory}
                  onClick={() => onCategoryClick(cat.primaryCategory)}
                  py={6}
                  px="xs"
                  style={{ borderRadius: 6 }}
                  className="mantine-hover"
                >
                  <Group gap="sm" wrap="nowrap">
                    <Box
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: getCategoryColor(
                          cat.primaryCategory,
                          i,
                        ),
                        flexShrink: 0,
                      }}
                    />
                    <Text size="sm" style={{ flex: 1 }} truncate>
                      {formatPrimaryCategory(cat.primaryCategory)}
                    </Text>
                    <Text size="sm" fw={500} style={{ flexShrink: 0 }}>
                      {formatAmount(cat.totalAmount, currency)}
                    </Text>
                    <Group
                      gap={4}
                      wrap="nowrap"
                      w={80}
                      style={{ flexShrink: 0 }}
                      visibleFrom="xs"
                    >
                      <Progress
                        value={pct}
                        color={getCategoryColor(cat.primaryCategory, i)}
                        size="xs"
                        style={{ flex: 1 }}
                        radius="xl"
                      />
                      <Text size="xs" c="dimmed" w={32} ta="right">
                        {pct.toFixed(0)}%
                      </Text>
                    </Group>
                  </Group>
                </UnstyledButton>
              )
            })}
          </Stack>
        </Grid.Col>
      </Grid>
    </Paper>
  )
}

// --- Page ---

function AnalysisPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  // Default to 1st of current month through today
  const startDate =
    search.startDate ?? dayjs().startOf('month').format('YYYY-MM-DD')
  const endDate = search.endDate ?? dayjs().format('YYYY-MM-DD')

  const {
    data: analysis,
    isPending,
    isError,
  } = useTransactionAnalysisControllerGetAnalysis({ startDate, endDate })

  // Category drill-down modal
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedFlowDirection, setSelectedFlowDirection] = useState<
    'inflow' | 'outflow'
  >('inflow')

  const handleCategoryClick = (
    category: string,
    direction: 'inflow' | 'outflow',
  ) => {
    setSelectedCategory(category)
    setSelectedFlowDirection(direction)
    openModal()
  }

  // Local state so the intermediate pick (start chosen, end not yet) is preserved
  const [dateRangeValue, setDateRangeValue] = useState<DatesRangeValue>([
    dayjs(startDate).toDate(),
    dayjs(endDate).toDate(),
  ])

  const handleDateRangeChange = (range: DatesRangeValue) => {
    setDateRangeValue(range)
    const [start, end] = range
    if (start && end) {
      navigate({
        to: '/analysis',
        search: {
          startDate: dayjs(start).format('YYYY-MM-DD'),
          endDate: dayjs(end).format('YYYY-MM-DD'),
        },
      })
    }
  }

  return (
    <>
      <Group justify="space-between" mb="xl" wrap="wrap">
        <Title order={1}>Analysis</Title>
        <Group gap="xs">
          <Button
            variant="light"
            size="xs"
            onClick={() => {
              const start = dayjs()
                .subtract(1, 'month')
                .startOf('month')
                .format('YYYY-MM-DD')
              const end = dayjs()
                .subtract(1, 'month')
                .endOf('month')
                .format('YYYY-MM-DD')
              setDateRangeValue([dayjs(start).toDate(), dayjs(end).toDate()])
              navigate({
                to: '/analysis',
                search: { startDate: start, endDate: end },
              })
            }}
          >
            Last Month
          </Button>
          <Button
            variant="light"
            size="xs"
            onClick={() => {
              const start = dayjs().startOf('month').format('YYYY-MM-DD')
              const end = dayjs().format('YYYY-MM-DD')
              setDateRangeValue([dayjs(start).toDate(), dayjs(end).toDate()])
              navigate({
                to: '/analysis',
                search: { startDate: start, endDate: end },
              })
            }}
          >
            This Month
          </Button>
          <DatePickerInput
            type="range"
            value={dateRangeValue}
            onChange={handleDateRangeChange}
            maxDate={new Date()}
            size="md"
          />
        </Group>
      </Group>

      {isPending && (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      )}

      {isError && (
        <Alert color="red" title="Error" mb="lg">
          Failed to load analysis data. Please try again.
        </Alert>
      )}

      {analysis && (
        <Stack gap="lg">
          <SummaryStrip
            totalInflow={analysis.totalInflow}
            totalOutflow={analysis.totalOutflow}
            netFlow={analysis.netFlow}
            currency={analysis.currency}
          />

          {analysis.inflows.length === 0 && analysis.outflows.length === 0 ? (
            <Paper p="xl" radius="md" withBorder>
              <Text c="dimmed" ta="center">
                No transaction data found for this period.
              </Text>
            </Paper>
          ) : (
            <Grid>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <FlowSection
                  title="Inflows"
                  icon={ArrowDownLeft}
                  iconColor="var(--mantine-color-teal-6)"
                  categories={analysis.inflows}
                  total={analysis.totalInflow}
                  currency={analysis.currency}
                  onCategoryClick={(cat) => handleCategoryClick(cat, 'inflow')}
                />
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 6 }}>
                <FlowSection
                  title="Outflows"
                  icon={ArrowUpRight}
                  iconColor="var(--mantine-color-red-6)"
                  categories={analysis.outflows}
                  total={analysis.totalOutflow}
                  currency={analysis.currency}
                  onCategoryClick={(cat) => handleCategoryClick(cat, 'outflow')}
                />
              </Grid.Col>
            </Grid>
          )}
        </Stack>
      )}

      <CategoryTransactionsModal
        opened={modalOpened}
        onClose={closeModal}
        categoryPrimary={selectedCategory}
        startDate={startDate}
        endDate={endDate}
        flowDirection={selectedFlowDirection}
      />
    </>
  )
}
