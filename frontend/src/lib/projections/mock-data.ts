import dayjs from 'dayjs'
import type { ProjectionPlanResponse, ProjectionScenario } from './types'

export const mockProjectionScenario: ProjectionScenario = {
  id: 'mock-base',
  title: 'Base case',
  prompt:
    'What would it look like if I continue maxing out my 401k every year and contribute $50k to my brokerage every year, assuming VWRA growth, for the next 10 years?',
  currency: 'USD',
  startDate: dayjs().format('YYYY-MM-DD'),
  scope: { kind: 'accountGroups', accountGroupings: ['investment'] },
  horizonYears: 10,
  cadence: 'monthly',
  parameters: {
    currentValue: 612000,
    annualContributions: [
      {
        id: '401k',
        label: '401k contribution',
        amount: 30500,
        currency: 'USD',
        target: { kind: 'accountGroups', accountGroupings: ['investment'] },
      },
      {
        id: 'brokerage',
        label: 'Brokerage contribution',
        amount: 50000,
        currency: 'USD',
        target: { kind: 'accountGroups', accountGroupings: ['investment'] },
      },
    ],
    expectedAnnualReturn: 0.07,
    inflationRate: 0.025,
    taxDragRate: 0,
    volatility: 0.14,
  },
  assumptions: [
    {
      id: 'assumption-401k',
      label: '401k',
      valueLabel: 'Maxed ($30,500/yr)',
      source: 'user_prompt',
      parameterPath: 'parameters.annualContributions.401k.amount',
    },
    {
      id: 'assumption-brokerage',
      label: 'Brokerage',
      valueLabel: '$50,000/yr',
      source: 'user_prompt',
      parameterPath: 'parameters.annualContributions.brokerage.amount',
    },
    {
      id: 'assumption-return',
      label: 'Return',
      valueLabel: '7.0% (VWRA)',
      source: 'llm_inferred',
      parameterPath: 'parameters.expectedAnnualReturn',
    },
  ],
  controls: [
    {
      kind: 'currencyAmount',
      id: 'control-401k',
      label: '401k contribution',
      parameterPath: 'parameters.annualContributions.401k.amount',
      currency: 'USD',
      min: 0,
      max: 40000,
      step: 500,
    },
    {
      kind: 'currencyAmount',
      id: 'control-brokerage',
      label: 'Brokerage contribution',
      parameterPath: 'parameters.annualContributions.brokerage.amount',
      currency: 'USD',
      min: 0,
      max: 200000,
      step: 1000,
    },
    {
      kind: 'percentageSlider',
      id: 'control-return',
      label: 'Expected return (VWRA)',
      parameterPath: 'parameters.expectedAnnualReturn',
      min: 0.04,
      max: 0.1,
      step: 0.005,
    },
    {
      kind: 'segmentedSelect',
      id: 'control-horizon',
      label: 'Time horizon',
      parameterPath: 'horizonYears',
      options: [
        { label: '5 yrs', value: 5 },
        { label: '10 yrs', value: 10 },
        { label: '15 yrs', value: 15 },
        { label: '20 yrs', value: 20 },
      ],
    },
  ],
  annotations: [
    {
      id: 'vwra',
      kind: 'assumption',
      label: 'Assuming VWRA growth',
      description: '7.0% avg. annual return',
    },
  ],
}

export const mockProjectionResponse: ProjectionPlanResponse = {
  plan: {
    version: 1,
    assistantMessage:
      "I've created a projection using your 401k and brokerage contribution assumptions. You can edit the controls to explore the range.",
    scenario: mockProjectionScenario,
    followUpQuestions: [
      'What if I save 20% instead?',
      'What if I retire at 52?',
      'What if I buy a home in 3 years?',
    ],
    warnings: [],
  },
  result: {
    scenarioId: 'mock-base',
    currency: 'USD',
    points: [
      ...Array.from({ length: 6 }, (_, index) => ({
        date: dayjs()
          .subtract(5 - index, 'year')
          .format('YYYY-MM-DD'),
        historical: 140000 + index * 82000,
        totalContributions: 0,
      })),
      ...Array.from({ length: 10 }, (_, index) => {
        const value = 612000 * Math.pow(1.07, index + 1) + 80500 * (index + 1)
        return {
          date: dayjs()
            .add(index + 1, 'year')
            .format('YYYY-MM-DD'),
          projectedMedian: value,
          projectedLow: value * (0.9 - index * 0.015),
          projectedHigh: value * (1.12 + index * 0.02),
          totalContributions: 80500 * (index + 1),
        }
      }),
    ],
    metrics: [
      {
        id: 'projected-end-value',
        label: 'Projected value in 10 years',
        value: 2180000,
        formattedValue: '$2.18M',
      },
      {
        id: 'cagr',
        label: 'Median annual growth',
        value: 0.102,
        formattedValue: '10.2%',
        description: 'CAGR',
      },
      {
        id: 'confidence-range',
        label: 'Projected range in 10 years',
        value: 3020000,
        formattedValue: '$1.55M - $3.02M',
      },
      {
        id: 'total-contributions',
        label: 'Total contributions',
        value: 805000,
        formattedValue: '$805K',
      },
    ],
    milestones: [
      {
        id: 'cross-1000000',
        label: 'Portfolio crosses $1M',
        targetValue: 1000000,
        reachedAt: dayjs().add(3, 'year').format('YYYY-MM-DD'),
      },
    ],
    annotations: [
      ...mockProjectionScenario.annotations,
      {
        id: 'annotation-1m',
        kind: 'milestone',
        label: 'Portfolio crosses $1M',
        description: 'Est. in Q2 2028',
        date: dayjs().add(3, 'year').format('YYYY-MM-DD'),
        value: 1000000,
      },
    ],
  },
}
