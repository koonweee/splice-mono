import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import type {
  AllBalancesRequest,
  BalanceQueryPerDateResult,
  BalancesRequest,
} from '../types/BalanceQuery';
import {
  AllBalancesRequestSchema,
  BalanceQueryPerDateResultSchema,
  BalancesRequestSchema,
} from '../types/BalanceQuery';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { BalanceQueryService } from './balance-query.service';

@ApiTags('balance-query')
@Controller('balance-query')
export class BalanceQueryController {
  constructor(private readonly balanceQueryService: BalanceQueryService) {}

  @Post('balances')
  @ApiOperation({
    description:
      "Get balances for specific accounts over a date range. Balances are converted to the user's preferred currency.",
  })
  @ZodApiBody({ schema: BalancesRequestSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Returns balance data for each date in the range',
    schema: BalanceQueryPerDateResultSchema,
    isArray: true,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  async getBalances(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(BalancesRequestSchema))
    dto: BalancesRequest,
  ): Promise<BalanceQueryPerDateResult[]> {
    // Validate date range
    if (dto.startDate > dto.endDate) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    // Validate at least one account
    if (dto.accountIds.length === 0) {
      throw new BadRequestException('At least one accountId is required');
    }

    return this.balanceQueryService.getBalancesForDateRange(
      dto.accountIds,
      dto.startDate,
      dto.endDate,
      user.userId,
    );
  }

  @Post('all-balances')
  @ApiOperation({
    description:
      "Get balances for all linked accounts over a date range. Balances are converted to the user's preferred currency.",
  })
  @ZodApiBody({ schema: AllBalancesRequestSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Returns balance data for each date in the range',
    schema: BalanceQueryPerDateResultSchema,
    isArray: true,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  async getAllBalances(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(AllBalancesRequestSchema))
    dto: AllBalancesRequest,
  ): Promise<BalanceQueryPerDateResult[]> {
    // Validate date range
    if (dto.startDate > dto.endDate) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate',
      );
    }

    return this.balanceQueryService.getAllBalancesForDateRange(
      dto.startDate,
      dto.endDate,
      user.userId,
    );
  }
}
