import { ProjectionEngineService } from '../../src/projection/projection-engine.service';
import type { ProjectionScenario } from '../../src/types/Projection';

function scenario(
  overrides: Partial<ProjectionScenario> = {},
): ProjectionScenario {
  return {
    id: 'scenario-1',
    title: 'Base case',
    currency: 'USD',
    startDate: '2026-01-01',
    scope: { kind: 'netWorth' },
    horizonYears: 10,
    cadence: 'monthly',
    parameters: {
      annualContributions: [
        {
          id: 'brokerage',
          label: 'Brokerage contribution',
          amount: 12000,
          currency: 'USD',
          target: { kind: 'netWorth' },
        },
      ],
      expectedAnnualReturn: 0.06,
      inflationRate: 0.02,
      taxDragRate: 0.01,
      volatility: 0.15,
    },
    assumptions: [],
    controls: [],
    annotations: [],
    ...overrides,
  };
}

describe('ProjectionEngineService', () => {
  const service = new ProjectionEngineService();

  it('computes deterministic monthly projection points and summary metrics', () => {
    const result = service.compute({
      scenario: scenario({ horizonYears: 1 }),
      historicalPoints: [
        { date: '2025-12-01', value: 95000 },
        { date: '2026-01-01', value: 100000 },
      ],
      startingValue: 100000,
    });

    expect(result.points).toHaveLength(14);
    expect(result.points[0]).toEqual({
      date: '2025-12-01',
      historical: 95000,
      totalContributions: 0,
    });
    expect(result.points[2]).toMatchObject({
      date: '2026-02-01',
      totalContributions: 1000,
    });
    expect(result.points.at(-1)?.projectedMedian).toBeGreaterThan(112000);
    expect(result.metrics.map((metric) => metric.id)).toEqual([
      'projected-end-value',
      'cagr',
      'confidence-range',
      'total-contributions',
    ]);
    expect(
      result.metrics.find((metric) => metric.id === 'total-contributions')
        ?.value,
    ).toBeCloseTo(12000);
  });

  it('applies tax drag and inflation-adjusted contributions', () => {
    const base = service.compute({
      scenario: scenario({ horizonYears: 2 }),
      historicalPoints: [],
      startingValue: 100000,
    });
    const adjusted = service.compute({
      scenario: scenario({
        horizonYears: 2,
        parameters: {
          annualContributions: [
            {
              id: 'brokerage',
              label: 'Brokerage contribution',
              amount: 12000,
              currency: 'USD',
              target: { kind: 'netWorth' },
              inflationAdjust: true,
            },
          ],
          expectedAnnualReturn: 0.06,
          inflationRate: 0.1,
          taxDragRate: 0.04,
          volatility: 0.15,
        },
      }),
      historicalPoints: [],
      startingValue: 100000,
    });

    expect(adjusted.metrics[3].value).toBeGreaterThan(base.metrics[3].value);
    expect(adjusted.metrics[0].value).toBeLessThan(base.metrics[0].value);
  });

  it('adds milestone annotations for crossed thresholds', () => {
    const result = service.compute({
      scenario: scenario({ horizonYears: 10 }),
      historicalPoints: [],
      startingValue: 900000,
    });

    expect(result.milestones[0]).toMatchObject({
      id: 'cross-1000000',
      label: 'Crosses $1,000,000',
      targetValue: 1000000,
    });
    expect(result.annotations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'annotation:cross-1000000',
          kind: 'milestone',
        }),
      ]),
    );
  });
});
