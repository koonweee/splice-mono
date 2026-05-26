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
  ApplyCategorizationRuleResponseSchema,
  CategorizationRuleDraftPreviewSchema,
  CategorizationRuleViewSchema,
  CreateCategorizationRuleDtoSchema,
  PreviewCategorizationRuleDraftDtoSchema,
  PreviewCategorizationRuleApplicationResponseSchema,
  UpdateCategorizationRuleDtoSchema,
  type ApplyCategorizationRuleResponse,
  type CategorizationRuleDraftPreview,
  type CategorizationRuleView,
  type CreateCategorizationRuleDto,
  type PreviewCategorizationRuleDraftDto,
  type PreviewCategorizationRuleApplicationResponse,
  type UpdateCategorizationRuleDto,
} from '../types/CategorizationRule';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { TransactionCategorizationService } from './categorization-rule.service';

@ApiTags('categorization-rules')
@Controller('categorization-rules')
export class CategorizationRuleController {
  constructor(
    private readonly categorizationService: TransactionCategorizationService,
  ) {}

  @Get()
  @ApiOperation({
    description:
      "List the current user's transaction categorization rules. Active rules are returned by default; pass archived=true to list archived rules.",
  })
  @ApiQuery({
    name: 'archived',
    required: false,
    description: 'When true, returns archived categorization rules only',
    type: Boolean,
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns categorization rules',
    schema: CategorizationRuleViewSchema,
    isArray: true,
  })
  async findAll(
    @CurrentUser() user: JwtUser,
    @Query('archived') archived?: string,
  ): Promise<CategorizationRuleView[]> {
    return this.categorizationService.findAll(user.userId, {
      archivedMode: archived === 'true',
    });
  }

  @Post()
  @ApiOperation({ description: 'Create a transaction categorization rule' })
  @ZodApiBody({ schema: CreateCategorizationRuleDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Categorization rule created successfully',
    schema: CategorizationRuleViewSchema,
  })
  @ApiResponse({ status: 409, description: 'A matching rule already exists' })
  async create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateCategorizationRuleDtoSchema))
    dto: CreateCategorizationRuleDto,
  ): Promise<CategorizationRuleView> {
    return this.categorizationService.create(user.userId, dto);
  }

  @Post('application-preview')
  @ApiOperation({
    description:
      'Preview how an unsaved categorization rule draft would match existing transactions. Manual categories are never overwritten.',
  })
  @ZodApiBody({ schema: PreviewCategorizationRuleDraftDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Draft categorization rule application preview',
    schema: CategorizationRuleDraftPreviewSchema,
  })
  @ApiResponse({ status: 409, description: 'A matching active rule exists' })
  async previewDraftApplication(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(PreviewCategorizationRuleDraftDtoSchema))
    dto: PreviewCategorizationRuleDraftDto,
  ): Promise<CategorizationRuleDraftPreview> {
    return this.categorizationService.previewDraftRuleApplication(
      user.userId,
      dto,
    );
  }

  @Patch(':id')
  @ApiOperation({
    description:
      'Update, archive, or restore a transaction categorization rule',
  })
  @ZodApiBody({ schema: UpdateCategorizationRuleDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Categorization rule updated successfully',
    schema: CategorizationRuleViewSchema,
  })
  @ApiResponse({ status: 404, description: 'Categorization rule not found' })
  @ApiResponse({ status: 409, description: 'A matching rule already exists' })
  async update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateCategorizationRuleDtoSchema))
    dto: UpdateCategorizationRuleDto,
  ): Promise<CategorizationRuleView> {
    const rule = await this.categorizationService.update(id, user.userId, dto);
    if (!rule) {
      throw new NotFoundException(
        `Categorization rule with id ${id} not found`,
      );
    }

    return rule;
  }

  @Get(':id/application-preview')
  @ApiOperation({
    description:
      'Preview how many existing transactions one active categorization rule would match and update. Manual categories are never overwritten.',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Categorization rule application preview',
    schema: PreviewCategorizationRuleApplicationResponseSchema,
  })
  @ApiResponse({ status: 404, description: 'Categorization rule not found' })
  async previewApplication(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<PreviewCategorizationRuleApplicationResponse> {
    const result = await this.categorizationService.previewRuleApplication(
      id,
      user.userId,
    );
    if (!result) {
      throw new NotFoundException(
        `Categorization rule with id ${id} not found`,
      );
    }

    return result;
  }

  @Post(':id/apply')
  @ApiOperation({
    description:
      'Apply one active categorization rule to existing eligible transactions. Manual categories are never overwritten.',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Categorization rule application result',
    schema: ApplyCategorizationRuleResponseSchema,
  })
  @ApiResponse({ status: 404, description: 'Categorization rule not found' })
  async apply(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<ApplyCategorizationRuleResponse> {
    const result = await this.categorizationService.applyRuleToExisting(
      id,
      user.userId,
    );
    if (!result) {
      throw new NotFoundException(
        `Categorization rule with id ${id} not found`,
      );
    }

    return result;
  }
}
