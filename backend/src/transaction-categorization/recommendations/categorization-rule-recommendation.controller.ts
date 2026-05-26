import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../../auth/decorators/current-user.decorator';
import { ZodApiBody, ZodApiResponse } from '../../common/zod-api-response';
import { ZodValidationPipe } from '../../zod-validation/zod-validation.pipe';
import {
  AcceptCategorizationRuleSuggestionResponseSchema,
  CategorizationRuleRecommendationGenerationResponseSchema,
  CategorizationRuleRecommendationListResponseSchema,
  DismissCategorizationRuleSuggestionResponseSchema,
  GenerateCategorizationRuleRecommendationsDtoSchema,
  type AcceptCategorizationRuleSuggestionResponse,
  type CategorizationRuleRecommendationGenerationResponse,
  type CategorizationRuleRecommendationListResponse,
  type DismissCategorizationRuleSuggestionResponse,
  type GenerateCategorizationRuleRecommendationsDto,
} from '../../types/CategorizationRuleSuggestion';
import { CategorizationRuleRecommendationProcessor } from './categorization-rule-recommendation.processor';
import { CategorizationRuleRecommendationService } from './categorization-rule-recommendation.service';

@ApiTags('categorization-rule-recommendations')
@Controller('categorization-rule-recommendations')
export class CategorizationRuleRecommendationController {
  constructor(
    private readonly recommendationService: CategorizationRuleRecommendationService,
    private readonly recommendationProcessor: CategorizationRuleRecommendationProcessor,
  ) {}

  @Get()
  @ApiOperation({
    description:
      'List pending categorization rule recommendations and latest generation state.',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns categorization rule recommendations',
    schema: CategorizationRuleRecommendationListResponseSchema,
  })
  async list(
    @CurrentUser() user: JwtUser,
  ): Promise<CategorizationRuleRecommendationListResponse> {
    return this.recommendationService.list(user.userId);
  }

  @Post('generate')
  @ApiOperation({
    description:
      'Start async categorization rule recommendation generation when none is already running.',
  })
  @ZodApiResponse({
    status: 201,
    description: 'Recommendation generation queued',
    schema: CategorizationRuleRecommendationGenerationResponseSchema,
  })
  @ZodApiBody({ schema: GenerateCategorizationRuleRecommendationsDtoSchema })
  @ApiResponse({
    status: 503,
    description: 'Recommendation generation is not configured',
  })
  async generate(
    @CurrentUser() user: JwtUser,
    @Body(
      new ZodValidationPipe(GenerateCategorizationRuleRecommendationsDtoSchema),
    )
    dto: GenerateCategorizationRuleRecommendationsDto,
  ): Promise<CategorizationRuleRecommendationGenerationResponse> {
    const result = await this.recommendationService.requestGeneration(
      user.userId,
      { regenerate: false, ignoredCategoryIds: dto.ignoredCategoryIds },
    );
    void this.recommendationProcessor.processPending();
    return result;
  }

  @Post('regenerate')
  @ApiOperation({
    description:
      'Supersede pending recommendations and start a fresh async generation.',
  })
  @ZodApiResponse({
    status: 201,
    description: 'Recommendation regeneration queued',
    schema: CategorizationRuleRecommendationGenerationResponseSchema,
  })
  @ZodApiBody({ schema: GenerateCategorizationRuleRecommendationsDtoSchema })
  @ApiResponse({
    status: 503,
    description: 'Recommendation generation is not configured',
  })
  async regenerate(
    @CurrentUser() user: JwtUser,
    @Body(
      new ZodValidationPipe(GenerateCategorizationRuleRecommendationsDtoSchema),
    )
    dto: GenerateCategorizationRuleRecommendationsDto,
  ): Promise<CategorizationRuleRecommendationGenerationResponse> {
    const result = await this.recommendationService.requestGeneration(
      user.userId,
      { regenerate: true, ignoredCategoryIds: dto.ignoredCategoryIds },
    );
    void this.recommendationProcessor.processPending();
    return result;
  }

  @Post(':id/accept')
  @ApiOperation({
    description:
      'Accept a pending recommendation and create a normal categorization rule.',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Recommendation accepted',
    schema: AcceptCategorizationRuleSuggestionResponseSchema,
  })
  @ApiResponse({ status: 404, description: 'Recommendation not found' })
  async accept(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<AcceptCategorizationRuleSuggestionResponse> {
    return {
      suggestion: await this.recommendationService.accept(id, user.userId),
    };
  }

  @Post(':id/dismiss')
  @ApiOperation({ description: 'Dismiss a pending recommendation.' })
  @ZodApiResponse({
    status: 200,
    description: 'Recommendation dismissed',
    schema: DismissCategorizationRuleSuggestionResponseSchema,
  })
  @ApiResponse({ status: 404, description: 'Recommendation not found' })
  async dismiss(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<DismissCategorizationRuleSuggestionResponse> {
    return {
      suggestion: await this.recommendationService.dismiss(id, user.userId),
    };
  }
}
