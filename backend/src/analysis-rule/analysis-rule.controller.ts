import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import {
  AnalysisRuleViewSchema,
  CreateAnalysisRuleDtoSchema,
  UpdateAnalysisRuleDtoSchema,
  type AnalysisRuleView,
  type CreateAnalysisRuleDto,
  type UpdateAnalysisRuleDto,
} from '../types/AnalysisRule';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { AnalysisRuleService } from './analysis-rule.service';

@ApiTags('analysis-rules')
@Controller('analysis-rules')
export class AnalysisRuleController {
  constructor(private readonly analysisRuleService: AnalysisRuleService) {}

  @Get()
  @ApiOperation({
    description:
      "List the current user's analysis rules. Active rules are returned by default; pass archived=true to list archived rules.",
  })
  @ApiQuery({
    name: 'archived',
    required: false,
    description: 'When true, returns archived analysis rules only',
    type: Boolean,
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns analysis rules',
    schema: AnalysisRuleViewSchema,
    isArray: true,
  })
  async findAll(
    @CurrentUser() user: JwtUser,
    @Query('archived') archived?: string,
  ): Promise<AnalysisRuleView[]> {
    return this.analysisRuleService.findAll(user.userId, {
      archivedMode: archived === 'true',
    });
  }

  @Post()
  @ApiOperation({ description: 'Create an analysis rule' })
  @ZodApiBody({ schema: CreateAnalysisRuleDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Analysis rule created successfully',
    schema: AnalysisRuleViewSchema,
  })
  @ApiResponse({ status: 409, description: 'A matching rule already exists' })
  async create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateAnalysisRuleDtoSchema))
    dto: CreateAnalysisRuleDto,
  ): Promise<AnalysisRuleView> {
    return this.analysisRuleService.create(user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ description: 'Update, archive, or restore an analysis rule' })
  @ZodApiBody({ schema: UpdateAnalysisRuleDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Analysis rule updated successfully',
    schema: AnalysisRuleViewSchema,
  })
  @ApiResponse({ status: 404, description: 'Analysis rule not found' })
  @ApiResponse({ status: 409, description: 'A matching rule already exists' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateAnalysisRuleDtoSchema))
    dto: UpdateAnalysisRuleDto,
  ): Promise<AnalysisRuleView> {
    const rule = await this.analysisRuleService.update(id, user.userId, dto);
    if (!rule) {
      throw new NotFoundException(`Analysis rule with id ${id} not found`);
    }

    return rule;
  }
}
