import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ProjectionComputeRequest,
  ProjectionPlanRequest,
  ProjectionPlanResponse,
  ProjectionScenario,
  isAllowedProjectionParameterPath,
} from '../types/Projection';
import { ProjectionContextService } from './projection-context.service';
import { ProjectionEngineService } from './projection-engine.service';
import { ProjectionLlmService } from './projection-llm.service';

@Injectable()
export class ProjectionService {
  constructor(
    private readonly contextService: ProjectionContextService,
    private readonly engineService: ProjectionEngineService,
    private readonly llmService: ProjectionLlmService,
  ) {}

  async compute(userId: string, request: ProjectionComputeRequest) {
    const scenario = this.normalizeScenario(request.scenario);
    const context = await this.contextService.getProjectionContext(
      userId,
      scenario,
      request.historyWindowYears,
    );

    return this.engineService.compute({
      scenario,
      historicalPoints: context.historicalPoints,
      startingValue: context.startingValue,
    });
  }

  async plan(
    userId: string,
    request: ProjectionPlanRequest,
  ): Promise<ProjectionPlanResponse> {
    const planningContext = await this.contextService.getPlanningContext(
      userId,
      request.historyWindowYears ?? 5,
    );
    const plan = await this.llmService.createPlan({
      prompt: request.prompt,
      currentScenario: request.currentScenario,
      planningContext,
    });
    const scenario = this.normalizeScenario(plan.scenario);
    const result = await this.compute(userId, {
      scenario,
      historyWindowYears: request.historyWindowYears,
    });

    return {
      plan: {
        ...plan,
        scenario,
      },
      result,
    };
  }

  private normalizeScenario(scenario: ProjectionScenario): ProjectionScenario {
    const normalized: ProjectionScenario = {
      ...scenario,
      horizonYears: Math.min(Math.max(scenario.horizonYears, 1), 50),
      parameters: {
        ...scenario.parameters,
        annualContributions: scenario.parameters.annualContributions.map(
          (contribution) => ({
            ...contribution,
            amount: Math.min(Math.max(contribution.amount, 0), 10000000),
          }),
        ),
        expectedAnnualReturn: Math.min(
          Math.max(scenario.parameters.expectedAnnualReturn, -0.5),
          0.5,
        ),
        inflationRate: Math.min(
          Math.max(scenario.parameters.inflationRate, 0),
          0.25,
        ),
        taxDragRate: Math.min(
          Math.max(scenario.parameters.taxDragRate, 0),
          0.5,
        ),
        volatility: Math.min(Math.max(scenario.parameters.volatility, 0), 1),
      },
    };

    const unsafeControl = normalized.controls.find(
      (control) =>
        !isAllowedProjectionParameterPath(control.parameterPath, normalized),
    );
    if (unsafeControl) {
      throw new BadRequestException(
        `Unsupported projection control parameterPath: ${unsafeControl.parameterPath}`,
      );
    }

    const unsafeAssumption = normalized.assumptions.find(
      (assumption) =>
        assumption.parameterPath &&
        !isAllowedProjectionParameterPath(assumption.parameterPath, normalized),
    );
    if (unsafeAssumption) {
      throw new BadRequestException(
        `Unsupported projection assumption parameterPath: ${unsafeAssumption.parameterPath}`,
      );
    }

    return normalized;
  }
}
