import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiResponse } from '../common/zod-api-response';
import type { TransactionAnalysisQuery } from '../types/TransactionAnalysis';
import {
  TransactionAnalysisQuerySchema,
  TransactionAnalysisResponseSchema,
} from '../types/TransactionAnalysis';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { TransactionAnalysisService } from './transaction-analysis.service';

@ApiTags('transaction-analysis')
@Controller('transaction-analysis')
export class TransactionAnalysisController {
  constructor(
    private readonly transactionAnalysisService: TransactionAnalysisService,
  ) {}

  @Get()
  @ApiOperation({
    description:
      'Get cash flow analysis grouped by category for a date range. ' +
      'Returns inflow/outflow breakdowns with amounts converted to user preferred currency. ' +
      'Transfer categories (TRANSFER_IN, TRANSFER_OUT) and credit card payments are excluded.',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    description: 'Start date (YYYY-MM-DD, inclusive)',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    description: 'End date (YYYY-MM-DD, inclusive)',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns transaction analysis with inflow/outflow breakdowns',
    schema: TransactionAnalysisResponseSchema,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  async getAnalysis(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(TransactionAnalysisQuerySchema))
    query: TransactionAnalysisQuery,
  ): Promise<unknown> {
    if (query.startDate > query.endDate) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    return this.transactionAnalysisService.getAnalysis(
      query.startDate,
      query.endDate,
      user.userId,
    );
  }
}
