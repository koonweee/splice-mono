import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
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

@ApiTags('balance-query')
@Controller('balance-query')
export class BalanceQueryController {
  constructor(private readonly balanceQueryService: BalanceQueryService) {}

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
