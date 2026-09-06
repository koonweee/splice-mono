import { MantineProvider } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './analysis'
import type * as SessionModule from '../../lib/session'
import type { ComponentType, ReactNode } from 'react'
import type * as ReactRouter from '@tanstack/react-router'
import type * as SpliceAPI from '../../api/clients/spliceAPI'
import type { TransactionAnalysisResponse } from '../../api/models'

type DonutDatum = {
  name: string
  value: number
  color: string
}

const mockFns = vi.hoisted(() => ({
  useSearchMock: vi.fn(),
  navigateMock: vi.fn(),
  useTransactionAnalysisControllerGetAuditMock: vi.fn(),
  useTransactionAnalysisControllerGetAnalysisMock: vi.fn(),
  useUserControllerMeMock: vi.fn(),
  categoryModalMock: vi.fn(),
  dateRangeControlMock: vi.fn(),
}))

vi.mock('../../lib/session', async () => ({
  ...(await vi.importActual<typeof SessionModule>('../../lib/session')),
  useCurrentUser: mockFns.useUserControllerMeMock,
}))

vi.mock('@tanstack/react-router', async () => {
  const actual: typeof ReactRouter = await vi.importActual(
    '@tanstack/react-router',
  )

  return {
    ...actual,
    createFileRoute: () => (config: Record<string, unknown>) => ({
      ...config,
      useSearch: mockFns.useSearchMock,
      useLoaderData: mockFns.useSearchMock,
    }),
    Link: ({ children, to }: { children: ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
    useNavigate: () => mockFns.navigateMock,
  }
})

vi.mock('@mantine/charts', () => ({
  DonutChart: ({ data }: { data: Array<DonutDatum> }) => (
    <div data-testid="donut-chart">
      {data.map((datum) => (
        <span
          data-color={datum.color}
          data-testid={`donut-segment-${datum.name}`}
          key={datum.name}
        >
          {datum.name}
        </span>
      ))}
    </div>
  ),
}))

vi.mock('../../api/clients/spliceAPI', async () => {
  const actual: typeof SpliceAPI = await vi.importActual(
    '../../api/clients/spliceAPI',
  )

  return {
    ...actual,
    useTransactionAnalysisControllerGetAudit:
      mockFns.useTransactionAnalysisControllerGetAuditMock,
    useTransactionAnalysisControllerGetAnalysis:
      mockFns.useTransactionAnalysisControllerGetAnalysisMock,
    useUserControllerMe: mockFns.useUserControllerMeMock,
  }
})

vi.mock('../../components/CategoryTransactionsModal', () => ({
  CategoryTransactionsModal: (props: Record<string, unknown>) => {
    mockFns.categoryModalMock(props)

    return <div data-testid="category-modal" />
  },
}))

vi.mock('../../components/analysis/AnalysisSankeyChart', () => ({
  AnalysisSankeyChart: ({
    onCategoryClick,
  }: {
    onCategoryClick: (
      categoryPrimary: string,
      flowDirection: 'inflow' | 'outflow',
    ) => void
  }) => (
    <div data-testid="analysis-sankey-chart">
      <button onClick={() => onCategoryClick('Salary', 'inflow')}>
        Salary Sankey node
      </button>
      <button onClick={() => onCategoryClick('Groceries', 'outflow')}>
        Groceries Sankey node
      </button>
      <button>Available</button>
    </div>
  ),
}))

vi.mock('../../components/DateRangeControl', () => ({
  DateRangeControl: (props: {
    value: [Date | string | null, Date | string | null]
  }) => {
    mockFns.dateRangeControlMock(props)
    const [start, end] = props.value
    return (
      <div data-testid="date-range-control">
        {start instanceof Date ? start.toISOString().slice(0, 10) : start}:
        {end instanceof Date ? end.toISOString().slice(0, 10) : end}
      </div>
    )
  },
}))

vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({ actions, title }: { actions?: ReactNode; title: string }) => (
    <header>
      <h1>{title}</h1>
      {actions}
    </header>
  ),
}))

const analysisPage = (Route as unknown as { component: ComponentType })
  .component
const validateAnalysisSearch = (
  Route as unknown as {
    validateSearch: (search: Record<string, unknown>) => {
      startDate?: string
      endDate?: string
    }
  }
).validateSearch

function mockMatchMedia() {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
  })
  Object.defineProperty(window, 'ResizeObserver', {
    value: vi.fn().mockImplementation(() => ({
      disconnect: vi.fn(),
      observe: vi.fn(),
      unobserve: vi.fn(),
    })),
    configurable: true,
  })
}

function renderAnalysisPage() {
  const AnalysisPage = analysisPage

  return render(
    <MantineProvider>
      <AnalysisPage />
    </MantineProvider>,
  )
}

const analysisResponse: TransactionAnalysisResponse = {
  startDate: '2026-02-01',
  endDate: '2026-02-28',
  currency: 'USD',
  inflows: [
    {
      primaryCategory: 'Salary',
      totalAmount: '250000',
      currency: 'USD',
      transactionCount: 1,
      color: '#112233',
    },
  ],
  outflows: [
    {
      primaryCategory: 'Groceries',
      totalAmount: '12000',
      currency: 'USD',
      transactionCount: 2,
      color: '#abcdef',
    },
  ],
  totalInflow: '250000',
  totalOutflow: '12000',
  netFlow: '238000',
  uncategorizedInflow: '0',
  uncategorizedOutflow: '0',
}

beforeEach(() => {
  mockMatchMedia()
  mockFns.useSearchMock.mockReturnValue({
    startDate: '2026-02-01',
    endDate: '2026-02-28',
  })
  mockFns.useTransactionAnalysisControllerGetAnalysisMock.mockReturnValue({
    data: analysisResponse,
    isPending: false,
    isError: false,
  })
  mockFns.useTransactionAnalysisControllerGetAuditMock.mockReturnValue({
    data: {
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      neutralizationLookaroundDays: 60,
      rows: [],
    },
    isPending: false,
    isError: false,
  })
  mockFns.useUserControllerMeMock.mockReturnValue({
    data: {
      settings: {
        analysisSankeyEnabled: false,
      },
    },
  })
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('Analysis route', () => {
  it('shows neutral totals without an invented split for an empty period and opens the previous month', () => {
    mockFns.useTransactionAnalysisControllerGetAnalysisMock.mockReturnValue({
      data: {
        ...analysisResponse,
        inflows: [],
        outflows: [],
        totalInflow: '0',
        totalOutflow: '0',
        netFlow: '0',
      },
      isPending: false,
      isError: false,
    })

    renderAnalysisPage()

    expect(screen.getByText('No transactions in this period')).toBeTruthy()
    expect(screen.queryByText('+$0')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View previous month' }))
    expect(mockFns.navigateMock).toHaveBeenCalledWith({
      to: '/analysis',
      search: { startDate: '2026-01-01', endDate: '2026-01-31' },
    })
  })

  it('rejects impossible and reversed direct-navigation date ranges', () => {
    expect(
      validateAnalysisSearch({
        startDate: '2026-02-30',
        endDate: '2026-03-31',
      }),
    ).toEqual({})
    expect(
      validateAnalysisSearch({
        startDate: '2026-06-30',
        endDate: '2026-06-01',
      }),
    ).toEqual({})
    expect(
      validateAnalysisSearch({
        startDate: '2024-02-29',
        endDate: '2024-03-01',
      }),
    ).toEqual({ startDate: '2024-02-29', endDate: '2024-03-01' })
  })

  it('synchronizes the picker and query when route search changes', async () => {
    const { rerender } = renderAnalysisPage()

    expect(screen.getByText('2026-02-01:2026-02-28')).toBeTruthy()

    mockFns.useSearchMock.mockReturnValue({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    })
    const AnalysisPage = analysisPage
    rerender(
      <MantineProvider>
        <AnalysisPage />
      </MantineProvider>,
    )

    await waitFor(() => {
      expect(screen.getByText('2026-06-01:2026-06-30')).toBeTruthy()
    })
    expect(
      mockFns.useTransactionAnalysisControllerGetAnalysisMock,
    ).toHaveBeenLastCalledWith({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    })
  })

  it('uses API category colors for chart segments and legend markers', async () => {
    renderAnalysisPage()

    const charts = await screen.findAllByTestId('donut-chart')
    expect(
      within(charts[0]).getByTestId('donut-segment-Salary').dataset.color,
    ).toBe('#112233')
    expect(
      within(charts[1]).getByTestId('donut-segment-Groceries').dataset.color,
    ).toBe('#abcdef')

    const salaryMarker = screen
      .getByRole('button', { name: /salary/i })
      .querySelector('div[style*="background-color"]') as HTMLElement
    const groceriesMarker = screen
      .getByRole('button', { name: /groceries/i })
      .querySelector('div[style*="background-color"]') as HTMLElement

    expect(salaryMarker.style.backgroundColor).toBe('rgb(17, 34, 51)')
    expect(groceriesMarker.style.backgroundColor).toBe('rgb(171, 205, 239)')
  })

  it('shows an audit button and keeps rules management inside the drawer', async () => {
    renderAnalysisPage()

    expect(screen.queryByRole('link', { name: /rules/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /audit/i }))

    expect(
      await screen.findByText('Analysis audit', {}, { timeout: 5000 }),
    ).toBeTruthy()
    expect(
      mockFns.useTransactionAnalysisControllerGetAuditMock,
    ).toHaveBeenCalledWith(
      { startDate: '2026-02-01', endDate: '2026-02-28' },
      { query: { enabled: true } },
    )
    expect(
      screen
        .getAllByRole('link', { name: /manage rules/i })[0]
        .getAttribute('href'),
    ).toBe('/settings?tab=analysis')
  })

  it('renders the Sankey chart instead of donut sections when enabled', async () => {
    mockFns.useUserControllerMeMock.mockReturnValue({
      data: {
        settings: {
          analysisSankeyEnabled: true,
        },
      },
    })

    renderAnalysisPage()

    expect(await screen.findByTestId('analysis-sankey-chart')).toBeTruthy()
    expect(screen.queryByTestId('donut-chart')).toBeNull()
  })

  it('opens drilldown for Sankey category clicks and ignores the central hub', async () => {
    mockFns.useUserControllerMeMock.mockReturnValue({
      data: {
        settings: {
          analysisSankeyEnabled: true,
        },
      },
    })

    renderAnalysisPage()

    fireEvent.click(
      await screen.findByRole('button', { name: /salary sankey/i }),
    )
    await screen.findByTestId('category-modal')
    expect(mockFns.categoryModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        opened: true,
        categoryPrimary: 'Salary',
        flowDirection: 'inflow',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: /^available$/i }))
    expect(mockFns.categoryModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        opened: true,
        categoryPrimary: 'Salary',
        flowDirection: 'inflow',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: /groceries sankey/i }))
    expect(mockFns.categoryModalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        opened: true,
        categoryPrimary: 'Groceries',
        flowDirection: 'outflow',
      }),
    )
  })
})

it('offers retry and retains matching cached analysis after a refresh failure', () => {
  const refetch = vi.fn()
  mockFns.useTransactionAnalysisControllerGetAnalysisMock.mockReturnValue({
    data: analysisResponse,
    isPending: false,
    isError: true,
    refetch,
  })
  renderAnalysisPage()
  expect(
    screen.getByText('Previously loaded results are shown below.', {
      exact: false,
    }),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Retry analysis' }))
  expect(refetch).toHaveBeenCalledOnce()
})
