import {
  formatMoneyNumber,
  formatPrimaryCategory,
  getDecimalPlaces,
} from '../../lib/format'
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
}

export type AnalysisSankeyLink = {
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

function toMajorUnits(amount: number, currency: string): number {
  const decimals = getDecimalPlaces(currency)
  return amount / Math.pow(10, decimals)
}

export function formatSankeyAmount(amount: number, currency: string): string {
  return formatMoneyNumber({
    value: toMajorUnits(amount, currency),
    currency,
    decimals: 0,
  })
}

export function formatSankeyMajorAmount(
  amount: number,
  currency: string,
): string {
  return formatMoneyNumber({
    value: amount,
    currency,
    decimals: 0,
  })
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
  const totalInflow = toMajorUnits(analysis.totalInflow, analysis.currency)
  const totalOutflow = toMajorUnits(analysis.totalOutflow, analysis.currency)
  const netFlow = toMajorUnits(analysis.netFlow, analysis.currency)
  const hubIndex = addNode({
    id: 'hub:available',
    name: `Available: ${formatSankeyMajorAmount(
      Math.max(totalInflow, totalOutflow),
      analysis.currency,
    )}`,
    kind: 'hub',
    value: Math.max(totalInflow, totalOutflow),
  })

  analysis.inflows.forEach((category, index) => {
    const node = getCategoryNode(category, index, 'inflow', analysis.currency)
    const nodeIndex = addNode(node)
    if (node.value > 0) {
      links.push({
        source: nodeIndex,
        target: hubIndex,
        value: node.value,
        categoryPrimary: category.primaryCategory,
        flowDirection: 'inflow',
        color: node.color,
      })
    }
  })

  if (netFlow < 0) {
    const value = Math.abs(netFlow)
    const priorBalanceIndex = addNode({
      id: 'net:prior-balance',
      name: `Prior balance: ${formatSankeyMajorAmount(
        value,
        analysis.currency,
      )}`,
      kind: 'net',
      value,
    })
    links.push({
      source: priorBalanceIndex,
      target: hubIndex,
      value,
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
        categoryPrimary: category.primaryCategory,
        flowDirection: 'outflow',
        color: node.color,
      })
    }
  })

  if (netFlow > 0) {
    const netSavedIndex = addNode({
      id: 'net:saved',
      name: `Net saved: ${formatSankeyMajorAmount(
        netFlow,
        analysis.currency,
      )}`,
      kind: 'net',
      value: netFlow,
    })
    links.push({
      source: hubIndex,
      target: netSavedIndex,
      value: netFlow,
      color: 'var(--mantine-color-teal-6)',
    })
  }

  return { nodes, links }
}
