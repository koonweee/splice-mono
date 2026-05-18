import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import {
  ProjectionComputeRequestSchema,
  ProjectionPlanRequestSchema,
  ProjectionPlanResponseSchema,
  ProjectionResultSchema,
} from '../types/Projection';
import type {
  ProjectionComputeRequest,
  ProjectionPlanRequest,
  ProjectionPlanResponse,
  ProjectionResult,
} from '../types/Projection';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { ProjectionService } from './projection.service';

@ApiTags('projection')
@Controller('projection')
export class ProjectionController {
  constructor(private readonly projectionService: ProjectionService) {}

  @Post('compute')
  @ApiOperation({
    description:
      'Compute deterministic projection points, metrics, ranges, and milestones for a validated scenario.',
  })
  @ZodApiBody({ schema: ProjectionComputeRequestSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Returns deterministic projection results',
    schema: ProjectionResultSchema,
  })
  @ApiResponse({ status: 400, description: 'Invalid projection scenario' })
  async compute(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(ProjectionComputeRequestSchema))
    body: ProjectionComputeRequest,
  ): Promise<ProjectionResult> {
    return this.projectionService.compute(user.userId, body);
  }

  @Post('plan')
  @ApiOperation({
    description:
      'Generate a typed projection plan from a natural-language prompt, then compute deterministic projection results.',
  })
  @ZodApiBody({ schema: ProjectionPlanRequestSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Returns an LLM-generated typed plan and computed results',
    schema: ProjectionPlanResponseSchema,
  })
  @ApiResponse({ status: 400, description: 'Invalid projection prompt' })
  @ApiResponse({ status: 503, description: 'OpenAI is unavailable' })
  async plan(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(ProjectionPlanRequestSchema))
    body: ProjectionPlanRequest,
  ): Promise<ProjectionPlanResponse> {
    return this.projectionService.plan(user.userId, body);
  }
}
