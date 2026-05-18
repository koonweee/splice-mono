import { Injectable } from '@nestjs/common';
import dayjs from 'dayjs';
import {
  ProjectionScenario,
  ProjectionResult,
  ProjectionChartAnnotation,
} from '../types/Projection';

export interface ProjectionEngineInput {
  scenario: ProjectionScenario;
  historicalPoints: Array<{ date: string; value: number }>;
  startingValue: number;
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class ProjectionEngineService {
  compute(input: ProjectionEngineInput): ProjectionResult {
    const { scenario } = input;
    const horizonMonths = scenario.horizonYears * 12;
    const netAnnualReturn = Math.max(
      -0.95,
      scenario.parameters.expectedAnnualReturn -
        scenario.parameters.taxDragRate,
    );
    const monthlyReturn = Math.pow(1 + netAnnualReturn, 1 / 12) - 1;
    const monthlyVolatility = scenario.parameters.volatility / Math.sqrt(12);

    let median = input.startingValue;
    let low = input.startingValue;
    let high = input.startingValue;
    let totalContributions = 0;
    const projectedPoints: ProjectionResult['points'] = [];

    for (let month = 1; month <= horizonMonths; month += 1) {
      const date = dayjs(scenario.startDate)
        .add(month, 'month')
        .format('YYYY-MM-DD');
      const annualContribution = this.getAnnualContributionForMonth(
        scenario,
        date,
        month,
      );
      const monthlyContribution = annualContribution / 12;
      const bandMultiplier = Math.sqrt(month / 12);
      const lowReturn = monthlyReturn - monthlyVolatility * bandMultiplier;
      const highReturn = monthlyReturn + monthlyVolatility * bandMultiplier;

      median = median * (1 + monthlyReturn) + monthlyContribution;
      low = low * (1 + lowReturn) + monthlyContribution;
      high = high * (1 + highReturn) + monthlyContribution;
      totalContributions += monthlyContribution;

      projectedPoints.push({
        date,
        projectedMedian: roundMoney(median),
        projectedLow: roundMoney(Math.min(low, median, high)),
        projectedHigh: roundMoney(Math.max(low, median, high)),
        totalContributions: roundMoney(totalContributions),
      });
    }

    const historicalPoints = input.historicalPoints.map((point) => ({
      date: point.date,
      historical: roundMoney(point.value),
      totalContributions: 0,
    }));
    const endPoint = projectedPoints[projectedPoints.length - 1];
    const cagr =
      input.startingValue > 0 && endPoint.projectedMedian !== undefined
        ? Math.pow(
            endPoint.projectedMedian / input.startingValue,
            1 / scenario.horizonYears,
          ) - 1
        : 0;
    const milestones = this.buildMilestones(
      scenario,
      input.startingValue,
      projectedPoints,
    );
    const milestoneAnnotations = milestones
      .filter((milestone) => milestone.reachedAt)
      .map(
        (milestone): ProjectionChartAnnotation => ({
          id: `annotation:${milestone.id}`,
          kind: 'milestone',
          label: milestone.label,
          date: milestone.reachedAt,
          value: milestone.targetValue,
        }),
      );

    return {
      scenarioId: scenario.id,
      currency: scenario.currency,
      points: [...historicalPoints, ...projectedPoints],
      metrics: [
        {
          id: 'projected-end-value',
          label: `Projected value in ${scenario.horizonYears} years`,
          value: endPoint.projectedMedian ?? input.startingValue,
          formattedValue: formatCurrency(
            endPoint.projectedMedian ?? input.startingValue,
            scenario.currency,
          ),
        },
        {
          id: 'cagr',
          label: 'Median annual growth',
          value: cagr,
          formattedValue: formatPercent(cagr),
          description: 'CAGR',
        },
        {
          id: 'confidence-range',
          label: `Projected range in ${scenario.horizonYears} years`,
          value: endPoint.projectedHigh ?? input.startingValue,
          formattedValue: `${formatCurrency(
            endPoint.projectedLow ?? input.startingValue,
            scenario.currency,
          )} - ${formatCurrency(
            endPoint.projectedHigh ?? input.startingValue,
            scenario.currency,
          )}`,
          description: 'Deterministic estimate',
        },
        {
          id: 'total-contributions',
          label: 'Total contributions',
          value: totalContributions,
          formattedValue: formatCurrency(totalContributions, scenario.currency),
        },
      ],
      milestones,
      annotations: [...scenario.annotations, ...milestoneAnnotations],
    };
  }

  private getAnnualContributionForMonth(
    scenario: ProjectionScenario,
    date: string,
    month: number,
  ): number {
    return scenario.parameters.annualContributions.reduce(
      (sum, contribution) => {
        if (contribution.startDate && date < contribution.startDate) {
          return sum;
        }
        if (contribution.endDate && date > contribution.endDate) {
          return sum;
        }

        const inflationFactor = contribution.inflationAdjust
          ? Math.pow(1 + scenario.parameters.inflationRate, month / 12)
          : 1;
        return sum + contribution.amount * inflationFactor;
      },
      0,
    );
  }

  private buildMilestones(
    scenario: ProjectionScenario,
    startingValue: number,
    points: ProjectionResult['points'],
  ): ProjectionResult['milestones'] {
    const endValue =
      points[points.length - 1]?.projectedMedian ?? startingValue;
    const thresholds = [100000, 250000, 500000, 1000000, 2000000, 5000000]
      .filter((threshold) => threshold > startingValue && threshold <= endValue)
      .slice(0, 4);

    return thresholds.map((threshold) => {
      const reachedPoint = points.find(
        (point) =>
          point.projectedMedian !== undefined &&
          point.projectedMedian >= threshold,
      );

      return {
        id: `cross-${threshold}`,
        label: `Crosses ${formatCurrency(threshold, scenario.currency)}`,
        targetValue: threshold,
        reachedAt: reachedPoint?.date,
      };
    });
  }
}
