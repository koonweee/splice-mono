import type {
  ProjectionAnnualContribution,
  ProjectionScenario,
} from './types'

function updateContribution(
  contribution: ProjectionAnnualContribution,
  field: 'amount' | 'inflationAdjust',
  value: string | number | boolean,
): ProjectionAnnualContribution {
  if (field === 'amount') {
    return {
      ...contribution,
      amount: typeof value === 'number' ? value : Number(value),
    }
  }

  return {
    ...contribution,
    inflationAdjust: Boolean(value),
  }
}

export function updateProjectionParameter(
  scenario: ProjectionScenario,
  parameterPath: string,
  value: string | number | boolean,
): ProjectionScenario {
  if (parameterPath === 'horizonYears') {
    return {
      ...scenario,
      horizonYears: Number(value),
    }
  }

  if (parameterPath === 'parameters.expectedAnnualReturn') {
    return {
      ...scenario,
      parameters: {
        ...scenario.parameters,
        expectedAnnualReturn: Number(value),
      },
    }
  }

  if (parameterPath === 'parameters.inflationRate') {
    return {
      ...scenario,
      parameters: {
        ...scenario.parameters,
        inflationRate: Number(value),
      },
    }
  }

  if (parameterPath === 'parameters.taxDragRate') {
    return {
      ...scenario,
      parameters: {
        ...scenario.parameters,
        taxDragRate: Number(value),
      },
    }
  }

  if (parameterPath === 'parameters.volatility') {
    return {
      ...scenario,
      parameters: {
        ...scenario.parameters,
        volatility: Number(value),
      },
    }
  }

  const contributionMatch = parameterPath.match(
    /^parameters\.annualContributions\.([^.]+)\.(amount|inflationAdjust)$/,
  )

  if (contributionMatch) {
    const [, id, field] = contributionMatch
    return {
      ...scenario,
      parameters: {
        ...scenario.parameters,
        annualContributions: scenario.parameters.annualContributions.map(
          (contribution) =>
            contribution.id === id
              ? updateContribution(
                  contribution,
                  field as 'amount' | 'inflationAdjust',
                  value,
                )
              : contribution,
        ),
      },
    }
  }

  return scenario
}
