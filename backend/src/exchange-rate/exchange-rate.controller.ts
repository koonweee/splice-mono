import { Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodApiResponse } from '../common/zod-api-response';
import type { ExchangeRate } from '../types/ExchangeRate';
import { ExchangeRateSchema } from '../types/ExchangeRate';
import { ExchangeRateService } from './exchange-rate.service';

@ApiTags('exchange-rates')
@Controller('exchange-rates')
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  @Post('sync')
  @ApiOperation({
    description:
      'Manually trigger exchange rate sync for all required currency pairs',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns all synced exchange rates',
    schema: ExchangeRateSchema,
    isArray: true,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async syncRates(): Promise<ExchangeRate[]> {
    return this.exchangeRateService.syncDailyRates();
  }
}
