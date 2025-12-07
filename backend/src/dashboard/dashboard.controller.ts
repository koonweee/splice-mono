import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiResponse } from '../common/zod-api-response';
import {
  DashboardSummary,
  DashboardSummarySchema,
  TimePeriod,
} from '../types/Dashboard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    description: 'Get dashboard summary with net worth and account summaries',
  })
  @ApiQuery({
    name: 'period',
    enum: TimePeriod,
    required: false,
    description:
      'Time period for comparison (day, week, month, year). Defaults to month.',
  })
  @ZodApiResponse({
    status: 200,
    description:
      'Returns dashboard summary including net worth, period-over-period changes, and account summaries',
    schema: DashboardSummarySchema,
  })
  async getSummary(
    @CurrentUser() user: JwtUser,
    @Query('period') period?: TimePeriod,
  ): Promise<DashboardSummary> {
    return this.dashboardService.getSummary(user.userId, period);
  }
}
