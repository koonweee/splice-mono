import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route } from './projections'
import type { ComponentType } from 'react'
import type * as ReactRouter from '@tanstack/react-router'
import type * as ProjectionHook from '../../hooks/useProjectionScenario'

const mockFns = vi.hoisted(() => ({
  useProjectionScenarioMock: vi.fn(),
}))

vi.mock('@tanstack/react-router', async () => {
  const actual: typeof ReactRouter = await vi.importActual(
    '@tanstack/react-router',
  )
  return {
    ...actual,
    createFileRoute: () => (config: Record<string, unknown>) => config,
  }
})

afterEach(() => {
  cleanup()
})

vi.mock('../../hooks/useProjectionScenario', async () => {
  const actual: typeof ProjectionHook = await vi.importActual(
    '../../hooks/useProjectionScenario',
  )
  return {
    ...actual,
    useProjectionScenario: mockFns.useProjectionScenarioMock,
  }
})

vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}))

vi.mock('../../components/projections/ProjectionChart', () => ({
  ProjectionChart: () => <div data-testid="projection-chart" />,
}))

vi.mock('../../components/projections/ProjectionPromptPanel', () => ({
  ProjectionPromptPanel: () => <div data-testid="projection-prompt-panel" />,
}))

vi.mock('../../components/projections/ProjectionControlsPanel', () => ({
  ProjectionControlsPanel: () => <div data-testid="projection-controls" />,
}))

vi.mock('../../components/projections/ProjectionSummaryMetrics', () => ({
  ProjectionSummaryMetrics: () => <div data-testid="projection-metrics" />,
}))

vi.mock('../../components/projections/ScenarioComparison', () => ({
  ScenarioComparison: () => <div data-testid="scenario-comparison" />,
}))

vi.mock('../../components/projections/ProjectionDisclaimer', () => ({
  ProjectionDisclaimer: () => <div data-testid="projection-disclaimer" />,
}))

const component = (Route as unknown as { component: ComponentType }).component

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
    configurable: true,
  })
})

function renderPage() {
  const ProjectionsPage = component
  render(
    <MantineProvider>
      <ProjectionsPage />
    </MantineProvider>,
  )
}

describe('ProjectionsPage', () => {
  it('renders the prompt, chart, metrics, controls, comparison, and disclaimer areas', () => {
    mockFns.useProjectionScenarioMock.mockReturnValue({
      editControl: vi.fn(),
      error: undefined,
      isComputing: false,
      isPlanning: false,
      messages: [],
      plan: { followUpQuestions: [] },
      result: { metrics: [] },
      scenario: { assumptions: [], controls: [] },
      submitPrompt: vi.fn(),
    })

    renderPage()

    expect(screen.getByRole('heading', { name: /projections/i })).toBeTruthy()
    expect(screen.getByTestId('projection-prompt-panel')).toBeTruthy()
    expect(screen.getByTestId('projection-chart')).toBeTruthy()
    expect(screen.getByTestId('projection-metrics')).toBeTruthy()
    expect(screen.getByTestId('projection-controls')).toBeTruthy()
    expect(screen.getByTestId('scenario-comparison')).toBeTruthy()
    expect(screen.getByTestId('projection-disclaimer')).toBeTruthy()
  })

  it('keeps the last projection visible while showing recoverable errors', () => {
    mockFns.useProjectionScenarioMock.mockReturnValue({
      editControl: vi.fn(),
      error: 'Could not generate that projection.',
      isComputing: false,
      isPlanning: false,
      messages: [],
      plan: { followUpQuestions: [] },
      result: { metrics: [] },
      scenario: { assumptions: [], controls: [] },
      submitPrompt: vi.fn(),
    })

    renderPage()

    expect(screen.getByText(/could not generate/i)).toBeTruthy()
    expect(screen.getByTestId('projection-chart')).toBeTruthy()
  })
})
