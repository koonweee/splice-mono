import { lazy, useEffect, useState } from 'react'
import {
  Box,
  Button,
  Grid,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowDownLeft, ArrowUpRight, ClipboardList } from 'lucide-react'
import { AnalysisAuditHeader } from '../../components/analysis/AnalysisAuditHeader'
import {
  AnalysisSkeleton,
  TableSkeleton,
} from '../../components/loading/LoadingSkeleton'
import { DeferredOverlay } from '../../components/DeferredOverlay'
import {
  featureIntent,
  loadAnalysisAuditDrawer,
  loadAnalysisSankeyChart,
  loadCategoryTransactionsModal,
  loadDonutChart,
  prepareChartCode,
} from '../../lib/feature-loaders'
import {
  minorToChartNumber,
  parseSignedMinorUnits,
  ratioPercent,
} from '../../lib/money'
import { useCurrentUser } from '../../lib/session'
import { loadQuery } from '../../lib/queries/loader'
import {
  analysisDateRange,
  analysisQueryOptions,
} from '../../lib/queries/primary'
import { DataState } from '../../components/DataState'
import { DeferredFeature } from '../../components/DeferredFeature'
import {
  useTransactionAnalysisControllerGetAnalysis,
  useTransactionAnalysisControllerGetAudit,
} from '../../api/clients/spliceAPI'
import { DateRangeControl } from '../../components/DateRangeControl'
import { PageLayout } from '../../components/PageLayout'
import { Pressable } from '../../components/Pressable'
import {
  formatMinorMoneyString,
  formatMoneyNumber,
  formatPrimaryCategory,
} from '../../lib/format'
import { getDisplayCategoryColor } from '../../lib/category-colors'
import densityStyles from '../../components/analysis/AnalysisSummary.module.css'
import type { CategoryAggregate } from '../../api/models'
import type { DatesRangeValue } from '@mantine/dates'

const DonutChart = lazy(loadDonutChart)
const AnalysisAuditDrawer = lazy(loadAnalysisAuditDrawer)
const AnalysisSankeyChart = lazy(loadAnalysisSankeyChart)
const CategoryTransactionsModal = lazy(loadCategoryTransactionsModal)

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
    prepareChartCode('analysis')
    const range = analysisDateRange(context.presentation.today, deps)
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

function toMajorUnits(amount: string, currency: string): number {
  return minorToChartNumber(amount, currency)
}

function formatAmount(amount: string, currency: string): string {
  return formatMinorMoneyString({ value: amount, currency, decimals: 0 })
}

// --- Components ---

function SummaryStrip({
  totalInflow,
  totalOutflow,
  netFlow,
  currency,
}: {
  totalInflow: string
  totalOutflow: string
  netFlow: string
  currency: string
}) {
  const inflow = parseSignedMinorUnits(totalInflow)
  const outflow = parseSignedMinorUnits(totalOutflow)
  const net = parseSignedMinorUnits(netFlow)
  const total = inflow + outflow
  const inflowPct = ratioPercent(inflow, total)

  return (
    <Paper p="sm" radius="md" withBorder>
      <div
        className={densityStyles.summary}
        style={{ marginBottom: total > 0n ? 'var(--mantine-spacing-sm)' : 0 }}
      >
        <div>
          <Text data-typography="label" c="dimmed">
            Inflows
          </Text>
          <Text data-typography="amount">
            {formatAmount(totalInflow, currency)}
          </Text>
        </div>
        <div>
          <Text data-typography="label" c="dimmed">
            Outflows
          </Text>
          <Text data-typography="amount">
            {formatAmount(totalOutflow, currency)}
          </Text>
        </div>
        <div>
          <Text data-typography="label" c="dimmed">
            Net
          </Text>
          <Text
            data-typography="amount"
            c={
              net === 0n
                ? undefined
                : net > 0n
                  ? 'var(--splice-positive)'
                  : 'var(--splice-negative)'
            }
          >
            {net > 0n ? '+' : ''}
            {formatAmount(netFlow, currency)}
          </Text>
        </div>
      </div>
      {total > 0n && (
        <Progress.Root size="sm" radius="xl">
          <Progress.Section
            value={inflowPct}
            color="var(--splice-positive)"
            aria-label="Inflow share"
          />
          <Progress.Section
            value={100 - inflowPct}
            color="var(--splice-negative)"
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
  total: string
  currency: string
  onCategoryClick: (category: string) => void
}) {
  if (categories.length === 0) {
    return (
      <Paper p="lg" radius="md" withBorder>
        <Group gap="xs" mb="md">
          <Icon size={18} />
          <Text data-typography="sectionHeading">{title}</Text>
        </Group>
        <Text data-typography="body" c="dimmed" ta="center" py="xl">
          No data for this period
        </Text>
      </Paper>
    )
  }

  const chartData = categories.map((cat, i) => ({
    name: formatPrimaryCategory(cat.primaryCategory),
    value: toMajorUnits(cat.totalAmount, currency),
    color: getDisplayCategoryColor(cat.color, cat.primaryCategory, i),
    exactAmount: cat.totalAmount,
  }))

  return (
    <Paper p="lg" radius="md" withBorder>
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <Box c={iconColor}>
            <Icon size={18} />
          </Box>
          <Text data-typography="sectionHeading">{title}</Text>
        </Group>
        <Text data-typography="amount" c="dimmed">
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
                tooltipProps={{
                  content: ({ payload }) => {
                    const segment = payload[0]?.payload
                    return segment?.exactAmount ? (
                      <Paper p="xs" withBorder>
                        {segment.name}:{' '}
                        {formatAmount(segment.exactAmount, currency)}
                      </Paper>
                    ) : null
                  },
                }}
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
              const pct = ratioPercent(
                parseSignedMinorUnits(cat.totalAmount),
                parseSignedMinorUnits(total),
              )

              return (
                <Pressable
                  key={cat.primaryCategory}
                  onClick={() => onCategoryClick(cat.primaryCategory)}
                  {...featureIntent(loadCategoryTransactionsModal)}
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
                    <Text
                      data-typography="bodySmall"
                      style={{ flex: 1 }}
                      truncate
                    >
                      {formatPrimaryCategory(cat.primaryCategory)}
                    </Text>
                    <Text
                      data-typography="amountSmall"
                      style={{ flexShrink: 0 }}
                    >
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
                      <Text
                        data-typography="caption"
                        c="dimmed"
                        w={32}
                        ta="right"
                      >
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
      <PageLayout
        title="Analysis"
        actions={{
          primary: {
            id: 'audit',
            label: 'Audit',
            icon: ClipboardList,
            onClick: openAudit,
            onPrepare: () => {
              void loadAnalysisAuditDrawer().catch(() => undefined)
            },
          },
        }}
        toolbar={
          <DateRangeControl
            growOnMobile
            value={dateRangeValue}
            onChange={handleDateRangeChange}
            clearable={false}
          />
        }
      >
        <DataState
          hasData={Boolean(analysis)}
          isLoading={isPending}
          isError={isError}
          isFetching={isFetching}
          errorMessage="Failed to load analysis data."
          onRetry={() => void refetch()}
          loadingFallback={
            <AnalysisSkeleton
              sankey={user ? analysisSankeyEnabled : undefined}
            />
          }
        >
          {analysis && (
            <Stack gap="md">
              <SummaryStrip
                totalInflow={analysis.totalInflow}
                totalOutflow={analysis.totalOutflow}
                netFlow={analysis.netFlow}
                currency={analysis.currency}
              />

              {analysis.inflows.length === 0 &&
              analysis.outflows.length === 0 ? (
                <Paper p="xl" radius="md" withBorder>
                  <Stack align="center" gap="sm">
                    <Text data-typography="sectionHeading">
                      No transactions in this period
                    </Text>
                    <Text data-typography="metadata" c="dimmed" ta="center">
                      Choose another date range to see your cashflow.
                    </Text>
                    <Button
                      variant="default"
                      onClick={() => {
                        const previousMonth = dayjs(startDate).subtract(
                          1,
                          'month',
                        )
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
                        showTotals={false}
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
                          iconColor="var(--splice-positive)"
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
                          iconColor="var(--splice-negative)"
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
        </DataState>

        {modalOpened && (
          <DeferredOverlay
            label="Category transactions"
            title={`${selectedCategory ? formatPrimaryCategory(selectedCategory) : 'Transactions'} Transactions (${selectedFlowDirection === 'inflow' ? 'Inflows' : 'Outflows'})`}
            kind="drilldown"
            skeleton={<TableSkeleton />}
            onClose={closeModal}
          >
            <CategoryTransactionsModal
              opened={modalOpened}
              onClose={closeModal}
              categoryPrimary={selectedCategory}
              startDate={startDate}
              endDate={endDate}
              flowDirection={selectedFlowDirection}
            />
          </DeferredOverlay>
        )}
        {auditOpened && (
          <DeferredOverlay
            label="Analysis audit"
            kind="audit"
            header={
              <AnalysisAuditHeader
                startDate={startDate}
                endDate={endDate}
                lookaroundDays={auditQuery.data?.neutralizationLookaroundDays}
              />
            }
            skeleton={<TableSkeleton rows={4} />}
            onClose={closeAudit}
          >
            <AnalysisAuditDrawer
              opened={auditOpened}
              onClose={closeAudit}
              startDate={startDate}
              endDate={endDate}
              auditQuery={auditQuery}
            />
          </DeferredOverlay>
        )}
      </PageLayout>
    </>
  )
}
