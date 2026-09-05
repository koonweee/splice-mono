import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiResponse } from '../common/zod-api-response';
import type {
  AllBalancesQuery,
  BalanceQueryPerDateResult,
  BalancesQuery,
} from '../types/BalanceQuery';
import {
  AllBalancesQuerySchema,
  BalanceQueryPerDateResultSchema,
  BalancesQuerySchema,
} from '../types/BalanceQuery';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { BalanceQueryService } from './balance-query.service';
import { DashboardQueryService } from './dashboard-query.service';
import {
  DashboardPeriodSchema,
  DashboardQuerySchema,
  DashboardSummaryResponseSchema,
  DashboardSeriesResponseSchema,
  type DashboardQuery,
  type DashboardSummaryResponse,
  type DashboardSeriesResponse,
} from '../types/Dashboard';

@ApiTags('balance-query')
@Controller('balance-query')
export class BalanceQueryController {
  constructor(
    private readonly balanceQueryService: BalanceQueryService,
    private readonly dashboardQueryService: DashboardQueryService,
  ) {}

  @Get('dashboard-summary')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    description:
      'Compact dashboard totals and account summaries in the authenticated user reporting currency.',
  })
  @ApiQuery({
    name: 'period',
    required: true,
    enum: DashboardPeriodSchema.options,
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    type: String,
    description: 'Valid calendar date (YYYY-MM-DD, inclusive)',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Dashboard summary',
    schema: DashboardSummaryResponseSchema,
  })
  @ApiResponse({ status: 400, description: 'Invalid period or calendar date' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({
    status: 503,
    description: 'Required exchange rate unavailable',
  })
  getDashboardSummary(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(DashboardQuerySchema)) query: DashboardQuery,
  ): Promise<DashboardSummaryResponse> {
    return this.dashboardQueryService.getSummary(user.userId, query);
  }

  @Get('dashboard-series')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    description:
      'Bounded dashboard net-worth series with historical currency conversion.',
  })
  @ApiQuery({
    name: 'period',
    required: true,
    enum: DashboardPeriodSchema.options,
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    type: String,
    description: 'Valid calendar date (YYYY-MM-DD, inclusive)',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Dashboard series',
    schema: DashboardSeriesResponseSchema,
  })
  @ApiResponse({ status: 400, description: 'Invalid period or calendar date' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({
    status: 503,
    description: 'Required exchange rate unavailable',
  })
  getDashboardSeries(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(DashboardQuerySchema)) query: DashboardQuery,
  ): Promise<DashboardSeriesResponse> {
    return this.dashboardQueryService.getSeries(user.userId, query);
  }

  @Get('balances')
  @ApiOperation({
    description:
      "Get balances for specific accounts over a date range. Balances are converted to the user's preferred currency.",
  })
  @ApiQuery({
    name: 'accountIds',
    required: true,
    description: 'Comma-separated list of account UUIDs',
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
    description: 'Returns balance data for each date in the range',
    schema: BalanceQueryPerDateResultSchema,
    isArray: true,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  async getBalances(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(BalancesQuerySchema))
    query: BalancesQuery,
  ): Promise<BalanceQueryPerDateResult[]> {
    // Validate date range
    if (query.startDate > query.endDate) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    // Validate at least one account
    if (query.accountIds.length === 0) {
      throw new BadRequestException('At least one accountId is required');
    }

    return this.balanceQueryService.getBalancesForDateRange(
      query.accountIds,
      query.startDate,
      query.endDate,
      user.userId,
    );
  }

  @Get('all-balances')
  @ApiOperation({
    description:
      "Get balances for all linked accounts over a date range. Balances are converted to the user's preferred currency.",
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
    description: 'Returns balance data for each date in the range',
    schema: BalanceQueryPerDateResultSchema,
    isArray: true,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  async getAllBalances(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(AllBalancesQuerySchema))
    query: AllBalancesQuery,
  ): Promise<BalanceQueryPerDateResult[]> {
    // Validate date range
    if (query.startDate > query.endDate) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    return this.balanceQueryService.getAllBalancesForDateRange(
      query.startDate,
      query.endDate,
      user.userId,
    );
  }
}
