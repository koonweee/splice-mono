import { describe, expect, it } from 'vitest'
import { buildAnalysisSankeyData } from './AnalysisSankeyChart.data'
import type { TransactionAnalysisResponse } from '../../api/models'

function makeAnalysis(
  overrides: Partial<TransactionAnalysisResponse> = {},
): TransactionAnalysisResponse {
  return {
    startDate: '2026-02-01',
    endDate: '2026-02-28',
    currency: 'USD',
    inflows: [
      {
        primaryCategory: 'Salary',
        totalAmount: 250000,
        currency: 'USD',
        transactionCount: 1,
        color: '#112233',
      },
    ],
    outflows: [
      {
        primaryCategory: 'Groceries',
        totalAmount: 12000,
        currency: 'USD',
        transactionCount: 2,
        color: '#abcdef',
      },
    ],
    totalInflow: 250000,
    totalOutflow: 12000,
    netFlow: 238000,
    uncategorizedInflow: 0,
    uncategorizedOutflow: 0,
    balanceAdjustments: [],
    ...overrides,
  }
}

describe('buildAnalysisSankeyData', () => {
  it('builds inflow, hub, outflow, and net saved nodes for positive net flow', () => {
    const data = buildAnalysisSankeyData(makeAnalysis())

    expect(data.nodes.map((node) => node.id)).toEqual([
      'hub:available',
      'inflow:Salary',
      'outflow:Groceries',
      'net:saved',
    ])
    expect(data.links).toEqual([
      expect.objectContaining({
        source: 1,
        target: 0,
        value: 2500,
        categoryPrimary: 'Salary',
        flowDirection: 'inflow',
        color: '#112233',
      }),
      expect.objectContaining({
        source: 0,
        target: 2,
        value: 120,
        categoryPrimary: 'Groceries',
        flowDirection: 'outflow',
        color: '#abcdef',
      }),
      expect.objectContaining({
        source: 0,
        target: 3,
        value: 2380,
      }),
    ])
  })

  it('adds prior balance for negative net flow', () => {
    const data = buildAnalysisSankeyData(
      makeAnalysis({
        totalInflow: 10000,
        totalOutflow: 12000,
        netFlow: -2000,
        inflows: [
          {
            primaryCategory: 'Salary',
            totalAmount: 10000,
            currency: 'USD',
            transactionCount: 1,
            color: '#112233',
          },
        ],
      }),
    )

    expect(data.nodes.map((node) => node.id)).toContain('net:prior-balance')
    expect(data.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 2,
          target: 0,
          value: 20,
        }),
      ]),
    )
  })

  it('omits net nodes when inflow and outflow match', () => {
    const data = buildAnalysisSankeyData(
      makeAnalysis({
        totalInflow: 12000,
        totalOutflow: 12000,
        netFlow: 0,
      }),
    )

    expect(data.nodes.some((node) => node.kind === 'net')).toBe(false)
  })

  it('builds prior-balance and outflow links when there are no inflows', () => {
    const data = buildAnalysisSankeyData(
      makeAnalysis({
        inflows: [],
        totalInflow: 0,
        totalOutflow: 12000,
        netFlow: -12000,
      }),
    )

    expect(data.nodes.map((node) => node.id)).toEqual([
      'hub:available',
      'net:prior-balance',
      'outflow:Groceries',
    ])
    expect(data.links).toEqual([
      expect.objectContaining({
        source: 1,
        target: 0,
        value: 120,
      }),
      expect.objectContaining({
        source: 0,
        target: 2,
        value: 120,
        categoryPrimary: 'Groceries',
        flowDirection: 'outflow',
        color: '#abcdef',
      }),
    ])
    expect(data.nodes.some((node) => node.kind === 'inflow')).toBe(false)
  })

  it('builds inflow and net-saved links when there are no outflows', () => {
    const data = buildAnalysisSankeyData(
      makeAnalysis({
        outflows: [],
        totalInflow: 250000,
        totalOutflow: 0,
        netFlow: 250000,
      }),
    )

    expect(data.nodes.map((node) => node.id)).toEqual([
      'hub:available',
      'inflow:Salary',
      'net:saved',
    ])
    expect(data.links).toEqual([
      expect.objectContaining({
        source: 1,
        target: 0,
        value: 2500,
        categoryPrimary: 'Salary',
        flowDirection: 'inflow',
        color: '#112233',
      }),
      expect.objectContaining({
        source: 0,
        target: 2,
        value: 2500,
      }),
    ])
    expect(data.nodes.some((node) => node.kind === 'outflow')).toBe(false)
  })

  it('preserves balance adjustment categories as clickable flow categories', () => {
    const data = buildAnalysisSankeyData(
      makeAnalysis({
        inflows: [
          {
            primaryCategory: 'BALANCE_ADJUSTMENT',
            totalAmount: 5000,
            currency: 'USD',
            transactionCount: 1,
            color: '#4c6ef5',
          },
        ],
        totalInflow: 5000,
        totalOutflow: 12000,
        netFlow: -7000,
      }),
    )

    expect(data.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          categoryPrimary: 'BALANCE_ADJUSTMENT',
          flowDirection: 'inflow',
          color: '#4c6ef5',
        }),
      ]),
    )
  })
})
