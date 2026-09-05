import { lazy, useEffect, useState } from 'react'
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
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowDownLeft, ArrowUpRight, ClipboardList } from 'lucide-react'
import { useCurrentUser } from '../../lib/session'
import { loadQuery } from '../../lib/queries/loader'
import { analysisQueryOptions } from '../../lib/queries/primary'
import { DeferredFeature } from '../../components/DeferredFeature'
import {
  useTransactionAnalysisControllerGetAnalysis,
  useTransactionAnalysisControllerGetAudit,
} from '../../api/clients/spliceAPI'
import { DateRangeControl } from '../../components/DateRangeControl'
import { PageHeader } from '../../components/PageHeader'
import { Pressable } from '../../components/Pressable'
import {
  formatMoneyNumber,
  formatPrimaryCategory,
  getDecimalPlaces,
} from '../../lib/format'
import { getDisplayCategoryColor } from '../../lib/category-colors'
import type { CategoryAggregate } from '../../api/models'
import type { DatesRangeValue } from '@mantine/dates'

const DonutChart = lazy(() =>
  import('@mantine/charts').then((module) => ({ default: module.DonutChart })),
)
const AnalysisAuditDrawer = lazy(() =>
  import('../../components/analysis/AnalysisAuditDrawer').then((module) => ({
    default: module.AnalysisAuditDrawer,
  })),
)
const AnalysisSankeyChart = lazy(() =>
  import('../../components/analysis/AnalysisSankeyChart').then((module) => ({
    default: module.AnalysisSankeyChart,
  })),
)
const CategoryTransactionsModal = lazy(() =>
  import('../../components/CategoryTransactionsModal').then((module) => ({
    default: module.CategoryTransactionsModal,
  })),
)

// --- Route ---

type AnalysisSearch = {
  startDate?: string
  endDate?: string
}

const isValidDateString = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  )
}

export const Route = createFileRoute('/_authed/analysis')({
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const today = context.presentation.today
    const range = {
      startDate: deps.startDate ?? `${today.slice(0, 7)}-01`,
      endDate: deps.endDate ?? today,
    }
    await loadQuery(context.queryClient, analysisQueryOptions(range))
    return range
  },
  component: AnalysisPage,
  validateSearch: (search: Record<string, unknown>): AnalysisSearch => {
    if (
      isValidDateString(search.startDate) &&
      isValidDateString(search.endDate) &&
      search.startDate <= search.endDate
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
  const inflowPct = total > 0 ? (totalInflow / total) * 100 : 0

  return (
    <Paper p="md" radius="md" withBorder>
      <Group
        justify="space-between"
        wrap="wrap"
        gap="md"
        mb={total > 0 ? 'sm' : 0}
      >
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
          <Text
            fw={700}
            c={netFlow === 0 ? undefined : netFlow > 0 ? 'teal' : 'red'}
          >
            {netFlow > 0 ? '+' : ''}
            {formatAmount(netFlow, currency)}
          </Text>
        </Group>
      </Group>
      {total > 0 && (
        <Progress.Root size="sm" radius="xl">
          <Progress.Section
            value={inflowPct}
            color="teal"
            aria-label="Inflow share"
          />
          <Progress.Section
            value={100 - inflowPct}
            color="red"
            aria-label="Outflow share"
          />
        </Progress.Root>
      )}
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
    color: getDisplayCategoryColor(cat.color, cat.primaryCategory, i),
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
            <DeferredFeature label="Category chart" minHeight={160}>
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
            </DeferredFeature>
          </Box>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 8 }}>
          <Stack gap={4}>
            {categories.map((cat, i) => {
              const pct = total > 0 ? (cat.totalAmount / total) * 100 : 0

              return (
                <Pressable
                  key={cat.primaryCategory}
                  onClick={() => onCategoryClick(cat.primaryCategory)}
                  style={{
                    borderRadius: 6,
                    padding: '6px var(--mantine-spacing-xs)',
                  }}
                >
                  <Group gap="sm" wrap="nowrap">
                    <Box
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        backgroundColor: getDisplayCategoryColor(
                          cat.color,
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
                        color={getDisplayCategoryColor(
                          cat.color,
                          cat.primaryCategory,
                          i,
                        )}
                        size="xs"
                        style={{ flex: 1 }}
                        radius="xl"
                      />
                      <Text size="xs" c="dimmed" w={32} ta="right">
                        {pct.toFixed(0)}%
                      </Text>
                    </Group>
                  </Group>
                </Pressable>
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
  const navigate = useNavigate()

  const { startDate, endDate } = Route.useLoaderData()

  const {
    data: analysis,
    isPending,
    isError,
    isFetching,
    refetch,
  } = useTransactionAnalysisControllerGetAnalysis({ startDate, endDate })
  const { data: user } = useCurrentUser()
  const analysisSankeyEnabled = user?.settings.analysisSankeyEnabled ?? false

  // Category drill-down modal
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure()
  const [auditOpened, { open: openAudit, close: closeAudit }] = useDisclosure()
  const auditQuery = useTransactionAnalysisControllerGetAudit(
    { startDate, endDate },
    { query: { enabled: auditOpened } },
  )
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

  useEffect(() => {
    setDateRangeValue([dayjs(startDate).toDate(), dayjs(endDate).toDate()])
  }, [startDate, endDate])

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
      <PageHeader
        title="Analysis"
        actions={
          <Group gap="xs" wrap="nowrap" w={{ base: '100%', sm: 'auto' }}>
            <DateRangeControl
              value={dateRangeValue}
              onChange={handleDateRangeChange}
              clearable={false}
            />
            <Button
              onClick={openAudit}
              leftSection={<ClipboardList size={16} />}
              h={{ base: 48, sm: 42 }}
              size="md"
              variant="light"
            >
              Audit
            </Button>
          </Group>
        }
      />

      {isPending && (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      )}

      {isError && (
        <Alert color="red" title="Error" mb="lg">
          Failed to load analysis data.{' '}
          {analysis && 'Previously loaded results are shown below.'}
          <Button
            variant="light"
            color="red"
            loading={isFetching}
            onClick={() => void refetch()}
          >
            Retry analysis
          </Button>
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
              <Stack align="center" gap="sm">
                <Text fw={600}>No transactions in this period</Text>
                <Text c="dimmed" ta="center" size="sm">
                  Choose another date range to see your cashflow.
                </Text>
                <Button
                  variant="default"
                  onClick={() => {
                    const previousMonth = dayjs(startDate).subtract(1, 'month')
                    handleDateRangeChange([
                      previousMonth.startOf('month').format('YYYY-MM-DD'),
                      previousMonth.endOf('month').format('YYYY-MM-DD'),
                    ])
                  }}
                >
                  View previous month
                </Button>
              </Stack>
            </Paper>
          ) : (
            <>
              {analysisSankeyEnabled ? (
                <DeferredFeature label="Cashflow chart" minHeight={320}>
                  <AnalysisSankeyChart
                    analysis={analysis}
                    onCategoryClick={handleCategoryClick}
                  />
                </DeferredFeature>
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
                      onCategoryClick={(cat) =>
                        handleCategoryClick(cat, 'inflow')
                      }
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
                      onCategoryClick={(cat) =>
                        handleCategoryClick(cat, 'outflow')
                      }
                    />
                  </Grid.Col>
                </Grid>
              )}
            </>
          )}
        </Stack>
      )}

      {modalOpened && (
        <DeferredFeature label="Category transactions">
          <CategoryTransactionsModal
            opened={modalOpened}
            onClose={closeModal}
            categoryPrimary={selectedCategory}
            startDate={startDate}
            endDate={endDate}
            flowDirection={selectedFlowDirection}
          />
        </DeferredFeature>
      )}
      {auditOpened && (
        <DeferredFeature label="Analysis audit">
          <AnalysisAuditDrawer
            opened={auditOpened}
            onClose={closeAudit}
            startDate={startDate}
            endDate={endDate}
            auditQuery={auditQuery}
          />
        </DeferredFeature>
      )}
    </>
  )
}
