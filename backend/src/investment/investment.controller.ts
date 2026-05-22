import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiResponse } from '../common/zod-api-response';
import type {
  InvestmentHoldingsDateQuery,
  InvestmentHoldingsResponse,
} from '../types/Investment';
import {
  InvestmentHoldingsDateQuerySchema,
  InvestmentHoldingsResponseSchema,
} from '../types/Investment';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { InvestmentService } from './investment.service';

@ApiTags('investment')
@Controller('investment')
export class InvestmentController {
  constructor(private readonly investmentService: InvestmentService) {}

  @Get('account/:accountId/holdings/latest')
  @ApiOperation({
    description: 'Get latest investment holdings for an account',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Latest investment holdings for the account',
    schema: InvestmentHoldingsResponseSchema,
  })
  async findLatestHoldingsForAccount(
    @CurrentUser() user: JwtUser,
    @Param('accountId') accountId: string,
  ): Promise<InvestmentHoldingsResponse> {
    return this.investmentService.findLatestHoldingsForAccount(
      user.userId,
      accountId,
    );
  }

  @Get('account/:accountId/holdings')
  @ApiOperation({
    description: 'Get investment holdings for an account on a snapshot date',
  })
  @ApiQuery({
    name: 'snapshotDate',
    required: true,
    type: String,
    description: 'Snapshot date in YYYY-MM-DD format',
    example: '2026-05-20',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Investment holdings for the account and snapshot date',
    schema: InvestmentHoldingsResponseSchema,
  })
  async findHoldingsForAccountOnDate(
    @CurrentUser() user: JwtUser,
    @Param('accountId') accountId: string,
    @Query(new ZodValidationPipe(InvestmentHoldingsDateQuerySchema))
    query: InvestmentHoldingsDateQuery,
  ): Promise<InvestmentHoldingsResponse> {
    return this.investmentService.findHoldingsForAccountOnDate(
      user.userId,
      accountId,
      query.snapshotDate,
    );
  }
}
