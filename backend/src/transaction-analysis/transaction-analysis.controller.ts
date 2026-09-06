import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiResponse } from '../common/zod-api-response';
import {
  TransactionAnalysisQuerySchema,
  TransactionAnalysisAuditResponseSchema,
  TransactionAnalysisResponseSchema,
  TransactionAnalysisTransactionsQuerySchema,
  TransactionAnalysisTransactionsResponseSchema,
} from '../types/TransactionAnalysis';
import type {
  TransactionAnalysisQuery,
  TransactionAnalysisTransactionsQuery,
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
      'Get cash flow analysis grouped by category for an activity date range. ' +
      'Pending transactions are included and treated like settled transactions. Exact equal-and-opposite transactions can be neutralized using the user lookaround setting before aggregation. ' +
      'Returns inflow/outflow breakdowns with amounts converted to the user preferred currency.',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    type: String,
    description: 'Activity start date (YYYY-MM-DD, inclusive)',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    type: String,
    description: 'Activity end date (YYYY-MM-DD, inclusive)',
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

  @Get('transactions')
  @ApiOperation({
    description:
      'Get unmatched transactions for a category drilldown within an activity date range. ' +
      'Transactions are neutralized using the same exact equal-and-opposite matching pipeline as the summary analysis before category and flow filtering. ' +
      'Returned rows include exact once-rounded amounts using each transaction’s effective reporting date for conversion.',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    type: String,
    description: 'Activity start date (YYYY-MM-DD, inclusive)',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    type: String,
    description: 'Activity end date (YYYY-MM-DD, inclusive)',
  })
  @ApiQuery({
    name: 'categoryPrimary',
    required: true,
    type: String,
    description:
      'Primary category to drill into (for example FOOD_AND_DRINK or UNCATEGORIZED)',
  })
  @ApiQuery({
    name: 'flowDirection',
    required: true,
    enum: ['inflow', 'outflow'],
    description:
      'Whether to return positive or negative unmatched transactions',
  })
  @ZodApiResponse({
    status: 200,
    description:
      'Returns unmatched transaction rows for the requested category',
    schema: TransactionAnalysisTransactionsResponseSchema,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  async getTransactions(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(TransactionAnalysisTransactionsQuerySchema))
    query: TransactionAnalysisTransactionsQuery,
  ): Promise<unknown> {
    if (query.startDate > query.endDate) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    return this.transactionAnalysisService.getCategoryTransactions(
      query.startDate,
      query.endDate,
      query.categoryPrimary,
      query.flowDirection,
      user.userId,
    );
  }

  @Get('audit')
  @ApiOperation({
    description:
      'Get analysis rule effects for an activity date range. ' +
      'Rows explain in-range exclusions and neutralized pairs where at least one side affects the selected report range.',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    type: String,
    description: 'Activity start date (YYYY-MM-DD, inclusive)',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    type: String,
    description: 'Activity end date (YYYY-MM-DD, inclusive)',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns analysis rule audit rows for the requested range',
    schema: TransactionAnalysisAuditResponseSchema,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  async getAudit(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(TransactionAnalysisQuerySchema))
    query: TransactionAnalysisQuery,
  ): Promise<unknown> {
    if (query.startDate > query.endDate) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    return this.transactionAnalysisService.getAnalysisAudit(
      query.startDate,
      query.endDate,
      user.userId,
    );
  }
}
