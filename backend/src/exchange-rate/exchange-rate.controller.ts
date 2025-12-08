import { Controller, Get, Param, Post, Query } from '@nestjs/common';
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

  @Get('latest/:baseCurrency/:targetCurrency')
  @ApiOperation({
    description: 'Get the latest exchange rate for a currency pair',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns the latest exchange rate',
    schema: ExchangeRateSchema,
  })
  @ApiResponse({ status: 404, description: 'Exchange rate not found' })
  async getLatestRate(
    @Param('baseCurrency') baseCurrency: string,
    @Param('targetCurrency') targetCurrency: string,
  ): Promise<ExchangeRate | null> {
    return this.exchangeRateService.getLatestRate(baseCurrency, targetCurrency);
  }

  @Get(':baseCurrency/:targetCurrency')
  @ApiOperation({
    description: 'Get exchange rate for a currency pair on a specific date',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns the exchange rate',
    schema: ExchangeRateSchema,
  })
  @ApiResponse({ status: 404, description: 'Exchange rate not found' })
  async getRate(
    @Param('baseCurrency') baseCurrency: string,
    @Param('targetCurrency') targetCurrency: string,
    @Query('date') date: string,
  ): Promise<ExchangeRate | null> {
    return this.exchangeRateService.getRate(baseCurrency, targetCurrency, date);
  }

  @Get()
  @ApiOperation({ description: 'Get all exchange rates for a specific date' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns all exchange rates for the date',
    schema: ExchangeRateSchema,
    isArray: true,
  })
  async getRatesForDate(@Query('date') date: string): Promise<ExchangeRate[]> {
    return this.exchangeRateService.getRatesForDate(date);
  }
}
