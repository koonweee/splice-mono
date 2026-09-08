import { Box, Group, Progress, Stack, Text } from '@mantine/core'
import { Sankey, Tooltip } from 'recharts'
import { parseSignedMinorUnits, ratioPercent } from '../../lib/money'
import { formatPrimaryCategory } from '../../lib/format'
import { getDisplayCategoryColor } from '../../lib/category-colors'
import { Pressable, usePressFeedback } from '../Pressable'
import { CashflowFrame, cashflowCanvasSize } from './AnalysisFrames'
import {
  buildAnalysisSankeyData,
  formatSankeyAmount,
} from './AnalysisSankeyChart.data'
import styles from './AnalysisSankeyChart.module.css'
import type { LinkProps, NodeProps } from 'recharts/types/chart/Sankey'
import type { KeyboardEvent } from 'react'
import type {
  AnalysisSankeyLink,
  AnalysisSankeyNode,
  FlowDirection,
} from './AnalysisSankeyChart.data'
import type {
  CategoryAggregate,
  TransactionAnalysisResponse,
} from '../../api/models'

type AnalysisSankeyChartProps = {
  showTotals?: boolean
  analysis: TransactionAnalysisResponse
  onCategoryClick: (categoryPrimary: string, direction: FlowDirection) => void
}

type RenderedSankeyNode = NodeProps['payload'] & Partial<AnalysisSankeyNode>
type RenderedSankeyLink = LinkProps['payload'] &
  Partial<Omit<AnalysisSankeyLink, 'source' | 'target'>>

function getNodeFill(node: RenderedSankeyNode) {
  if (node.color) {
    return node.color
  }

  if (node.kind === 'hub') {
    return 'var(--mantine-primary-color-filled)'
  }

  return 'var(--mantine-color-gray-6)'
}

function SankeyNodeShape({
  nodeProps: props,
  onCategoryClick,
}: {
  nodeProps: NodeProps
  onCategoryClick: AnalysisSankeyChartProps['onCategoryClick']
}) {
  const node: RenderedSankeyNode = props.payload
  const isClickable = Boolean(node.categoryPrimary && node.flowDirection)
  const { pressProps } = usePressFeedback<SVGGElement>(isClickable)
  const labelX =
    node.kind === 'outflow' || node.id === 'net:saved'
      ? props.x + props.width + 8
      : props.x - 8
  const labelAnchor =
    node.kind === 'outflow' || node.id === 'net:saved' ? 'start' : 'end'

  const handleClick = () => {
    if (node.categoryPrimary && node.flowDirection) {
      onCategoryClick(node.categoryPrimary, node.flowDirection)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    pressProps.onKeyDown(event)
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleClick()
    }
  }

  return (
    <g
      {...pressProps}
      className={`${styles.nodeGroup} ${
        isClickable ? styles.clickableNode : ''
      }`}
      role={isClickable ? 'button' : 'img'}
      aria-label={node.name}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
    >
      <rect
        x={props.x}
        y={props.y}
        width={props.width}
        height={props.height}
        rx={3}
        fill={getNodeFill(node)}
      />
      <text
        data-typography="chartLabel"
        x={labelX}
        y={props.y + props.height / 2}
        textAnchor={labelAnchor}
        dominantBaseline="middle"
        fill="var(--mantine-color-text)"
      >
        {node.name}
      </text>
    </g>
  )
}

function SankeyLinkShape({
  linkProps: props,
  onCategoryClick,
}: {
  linkProps: LinkProps
  onCategoryClick: AnalysisSankeyChartProps['onCategoryClick']
}) {
  const payload: RenderedSankeyLink = props.payload
  const isClickable = Boolean(payload.categoryPrimary && payload.flowDirection)
  const { pressProps } = usePressFeedback<SVGPathElement>(isClickable)
  const path = [
    `M${props.sourceX},${props.sourceY}`,
    `C${props.sourceControlX},${props.sourceY}`,
    `${props.targetControlX},${props.targetY}`,
    `${props.targetX},${props.targetY}`,
  ].join(' ')

  const handleClick = () => {
    if (payload.categoryPrimary && payload.flowDirection) {
      onCategoryClick(payload.categoryPrimary, payload.flowDirection)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<SVGPathElement>) => {
    pressProps.onKeyDown(event)
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleClick()
    }
  }

  return (
    <path
      {...pressProps}
      className={`${styles.link} ${isClickable ? styles.clickableLink : ''}`}
      d={path}
      fill="none"
      stroke={payload.color ?? 'var(--mantine-color-gray-5)'}
      strokeOpacity={0.42}
      strokeWidth={Math.max(1, props.linkWidth)}
      role={isClickable ? 'button' : undefined}
      aria-label={
        isClickable
          ? `${payload.flowDirection} ${payload.categoryPrimary}`
          : undefined
      }
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
    />
  )
}

function CategoryDrilldownList({
  categories,
  currency,
  direction,
  onCategoryClick,
}: {
  categories: Array<CategoryAggregate>
  currency: string
  direction: FlowDirection
  onCategoryClick: AnalysisSankeyChartProps['onCategoryClick']
}) {
  const total = categories.reduce(
    (sum, category) => sum + parseSignedMinorUnits(category.totalAmount),
    0n,
  )

  return (
    <Stack gap={4}>
      {categories.map((category, index) => (
        <Pressable
          key={`${direction}:${category.primaryCategory}`}
          onClick={() => onCategoryClick(category.primaryCategory, direction)}
          className={styles.categoryButton}
        >
          <Group gap="sm" wrap="nowrap">
            <Box
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                backgroundColor: getDisplayCategoryColor(
                  category.color,
                  category.primaryCategory,
                  index,
                ),
                flexShrink: 0,
              }}
            />
            <Text
              data-typography="bodySmall"
              style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}
            >
              {formatPrimaryCategory(category.primaryCategory)}
            </Text>
            <Text
              data-typography="amountSmall"
              style={{
                flexShrink: 1,
                minWidth: 0,
                overflowWrap: 'anywhere',
                textAlign: 'right',
              }}
            >
              {formatSankeyAmount(category.totalAmount, currency)}
            </Text>
          </Group>
          <div className={styles.compactProgress}>
            <Progress
              mt={4}
              size={4}
              value={ratioPercent(
                parseSignedMinorUnits(category.totalAmount),
                total,
              )}
              color={getDisplayCategoryColor(
                category.color,
                category.primaryCategory,
                index,
              )}
              aria-label={`${formatPrimaryCategory(category.primaryCategory)} share of ${direction}s`}
            />
          </div>
        </Pressable>
      ))}
    </Stack>
  )
}

export function AnalysisSankeyChart({
  analysis,
  onCategoryClick,
  showTotals = true,
}: AnalysisSankeyChartProps) {
  const data = buildAnalysisSankeyData(analysis)
  const { width: chartWidth, height } = cashflowCanvasSize(
    analysis.inflows.length,
    analysis.outflows.length,
  )
  const directions: Array<FlowDirection> = ['outflow', 'inflow']

  return (
    <CashflowFrame
      totals={
        showTotals && (
          <Text data-typography="amountSmall" c="dimmed">
            {formatSankeyAmount(analysis.totalInflow, analysis.currency)} in /{' '}
            {formatSankeyAmount(analysis.totalOutflow, analysis.currency)} out
          </Text>
        )
      }
      chart={
        <Box className={styles.chartCanvas} h={height} w={chartWidth}>
          <Sankey
            width={chartWidth}
            height={height}
            data={data}
            node={(props) => (
              <SankeyNodeShape
                nodeProps={props}
                onCategoryClick={onCategoryClick}
              />
            )}
            link={(props) => (
              <SankeyLinkShape
                linkProps={props}
                onCategoryClick={onCategoryClick}
              />
            )}
            nodePadding={18}
            nodeWidth={12}
            margin={{ top: 16, right: 190, bottom: 16, left: 190 }}
            sort={false}
          >
            <Tooltip
              formatter={(_value, _name, item) => {
                const amount = item.payload?.exactAmount
                return typeof amount === 'string'
                  ? formatSankeyAmount(amount, analysis.currency)
                  : ''
              }}
            />
          </Sankey>
        </Box>
      }
    >
      {directions.map((direction) => {
        const categories =
          direction === 'inflow' ? analysis.inflows : analysis.outflows
        return (
          <Box key={direction} data-direction={direction}>
            <Text data-typography="subsectionHeading" mb={4}>
              {direction === 'inflow' ? 'Inflows' : 'Outflows'}
            </Text>
            <CategoryDrilldownList
              categories={categories}
              currency={analysis.currency}
              direction={direction}
              onCategoryClick={onCategoryClick}
            />
            {categories.length === 0 && (
              <Text data-typography="metadata" c="dimmed">
                No {direction}s
              </Text>
            )}
          </Box>
        )
      })}
    </CashflowFrame>
  )
}
