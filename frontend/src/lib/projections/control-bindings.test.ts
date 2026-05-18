import { describe, expect, it } from 'vitest'
import { updateProjectionParameter } from './control-bindings'
import type { ProjectionScenario } from './types'

function scenario(): ProjectionScenario {
  return {
    id: 'scenario-1',
    title: 'Base',
    currency: 'USD',
    startDate: '2026-01-01',
    scope: { kind: 'netWorth' },
    horizonYears: 10,
    cadence: 'monthly',
    parameters: {
      annualContributions: [
        {
          id: 'brokerage',
          label: 'Brokerage',
          amount: 50000,
          currency: 'USD',
          target: { kind: 'netWorth' },
        },
      ],
      expectedAnnualReturn: 0.07,
      inflationRate: 0.02,
      taxDragRate: 0,
      volatility: 0.15,
    },
    assumptions: [],
    controls: [],
    annotations: [],
  }
}

describe('updateProjectionParameter', () => {
  it('updates top-level horizon and percentage assumptions', () => {
    const updated = updateProjectionParameter(
      updateProjectionParameter(
        scenario(),
        'parameters.expectedAnnualReturn',
        0.08,
      ),
      'horizonYears',
      15,
    )

    expect(updated.horizonYears).toBe(15)
    expect(updated.parameters.expectedAnnualReturn).toBe(0.08)
  })

  it('updates generated contribution controls by contribution id', () => {
    const updated = updateProjectionParameter(
      scenario(),
      'parameters.annualContributions.brokerage.amount',
      75000,
    )

    expect(updated.parameters.annualContributions[0].amount).toBe(75000)
  })

  it('ignores unknown parameter paths', () => {
    const base = scenario()
    expect(updateProjectionParameter(base, 'user.settings.currency', 'SGD')).toBe(
      base,
    )
  })
})
