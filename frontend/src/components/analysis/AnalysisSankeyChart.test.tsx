import { MantineProvider } from '@mantine/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalysisSankeyChart } from './AnalysisSankeyChart'
import { buildAnalysisSankeyData } from './AnalysisSankeyChart.data'
import type { TransactionAnalysisResponse } from '../../api/models'

vi.mock('../../lib/hooks', () => ({ useIsMobile: () => true }))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

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
    ...overrides,
  }
}

describe('buildAnalysisSankeyData', () => {
  it('keeps mobile outflow and inflow totals directly actionable in reading order', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
    const onCategoryClick = vi.fn()
    render(
      <MantineProvider>
        <AnalysisSankeyChart
          analysis={makeAnalysis()}
          onCategoryClick={onCategoryClick}
        />
      </MantineProvider>,
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons[0].textContent).toContain('Groceries')
    expect(buttons[0].textContent).toContain('$120')
    fireEvent.click(buttons[0])
    expect(onCategoryClick).toHaveBeenLastCalledWith('Groceries', 'outflow')
    fireEvent.click(screen.getByRole('button', { name: /Salary/ }))
    expect(onCategoryClick).toHaveBeenLastCalledWith('Salary', 'inflow')
  })

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
})
