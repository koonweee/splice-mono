import { minorToChartNumber, parseSignedMinorUnits } from '../../lib/money'
import { formatMinorMoneyString, formatPrimaryCategory } from '../../lib/format'
import { getDisplayCategoryColor } from '../../lib/category-colors'
import type {
  CategoryAggregate,
  TransactionAnalysisResponse,
} from '../../api/models'

export type FlowDirection = 'inflow' | 'outflow'

export type AnalysisSankeyNodeKind = 'inflow' | 'hub' | 'outflow' | 'net'

export type AnalysisSankeyNode = {
  id: string
  name: string
  kind: AnalysisSankeyNodeKind
  categoryPrimary?: string
  flowDirection?: FlowDirection
  color?: string
  value: number
  exactAmount: string
}

export type AnalysisSankeyLink = {
  exactAmount: string
  source: number
  target: number
  value: number
  categoryPrimary?: string
  flowDirection?: FlowDirection
  color?: string
}

export type AnalysisSankeyData = {
  nodes: Array<AnalysisSankeyNode>
  links: Array<AnalysisSankeyLink>
}

function toMajorUnits(amount: string, currency: string): number {
  return minorToChartNumber(amount, currency)
}

export function formatSankeyAmount(amount: string, currency: string): string {
  return formatMinorMoneyString({ value: amount, currency, decimals: 0 })
}

function getCategoryNode(
  category: CategoryAggregate,
  index: number,
  direction: FlowDirection,
  currency: string,
): AnalysisSankeyNode {
  const label = formatPrimaryCategory(category.primaryCategory)

  return {
    id: `${direction}:${category.primaryCategory}`,
    name: `${label}: ${formatSankeyAmount(category.totalAmount, currency)}`,
    kind: direction,
    categoryPrimary: category.primaryCategory,
    flowDirection: direction,
    color: getDisplayCategoryColor(
      category.color,
      category.primaryCategory,
      index,
    ),
    value: toMajorUnits(category.totalAmount, currency),
    exactAmount: category.totalAmount,
  }
}

export function buildAnalysisSankeyData(
  analysis: TransactionAnalysisResponse,
): AnalysisSankeyData {
  const nodes: Array<AnalysisSankeyNode> = []
  const links: Array<AnalysisSankeyLink> = []
  const addNode = (node: AnalysisSankeyNode) => {
    nodes.push(node)
    return nodes.length - 1
  }
  const totalInflow = parseSignedMinorUnits(analysis.totalInflow)
  const totalOutflow = parseSignedMinorUnits(analysis.totalOutflow)
  const netFlow = parseSignedMinorUnits(analysis.netFlow)
  const available = (
    totalInflow > totalOutflow ? totalInflow : totalOutflow
  ).toString()
  const hubIndex = addNode({
    id: 'hub:available',
    name: 'Available: ' + formatSankeyAmount(available, analysis.currency),
    kind: 'hub',
    value: toMajorUnits(available, analysis.currency),
    exactAmount: available,
  })

  analysis.inflows.forEach((category, index) => {
    const node = getCategoryNode(category, index, 'inflow', analysis.currency)
    const nodeIndex = addNode(node)
    if (node.value > 0) {
      links.push({
        source: nodeIndex,
        target: hubIndex,
        value: node.value,
        exactAmount: node.exactAmount,
        categoryPrimary: category.primaryCategory,
        flowDirection: 'inflow',
        color: node.color,
      })
    }
  })

  if (netFlow < 0n) {
    const exactAmount = (-netFlow).toString()
    const value = toMajorUnits(exactAmount, analysis.currency)
    const priorBalanceIndex = addNode({
      id: 'net:prior-balance',
      name: `Prior balance: ${formatSankeyAmount(
        exactAmount,
        analysis.currency,
      )}`,
      kind: 'net',
      value,
      exactAmount,
    })
    links.push({
      source: priorBalanceIndex,
      target: hubIndex,
      value,
      exactAmount,
      color: 'var(--mantine-color-orange-6)',
    })
  }

  analysis.outflows.forEach((category, index) => {
    const node = getCategoryNode(category, index, 'outflow', analysis.currency)
    const nodeIndex = addNode(node)
    if (node.value > 0) {
      links.push({
        source: hubIndex,
        target: nodeIndex,
        value: node.value,
        exactAmount: node.exactAmount,
        categoryPrimary: category.primaryCategory,
        flowDirection: 'outflow',
        color: node.color,
      })
    }
  })

  if (netFlow > 0n) {
    const exactAmount = netFlow.toString()
    const netSavedIndex = addNode({
      id: 'net:saved',
      name: `Net saved: ${formatSankeyAmount(exactAmount, analysis.currency)}`,
      kind: 'net',
      value: toMajorUnits(exactAmount, analysis.currency),
      exactAmount,
    })
    links.push({
      source: hubIndex,
      target: netSavedIndex,
      value: toMajorUnits(exactAmount, analysis.currency),
      exactAmount,
      color: 'var(--mantine-color-teal-6)',
    })
  }

  return { nodes, links }
}
