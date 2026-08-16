import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import type {
  InvestmentActivityQuery,
  InvestmentHoldingsDateQuery,
  InvestmentHoldingsResponse,
  PaginatedInvestmentActivityResponse,
  CreateManualBrokerageAccountDto,
  ManualBrokeragePortfolioResponse,
  ReplaceManualBrokerageHoldingsDto,
} from '../types/Investment';
import {
  InvestmentActivityQuerySchema,
  InvestmentHoldingsDateQuerySchema,
  InvestmentHoldingsResponseSchema,
  PaginatedInvestmentActivityResponseSchema,
  CreateManualBrokerageAccountDtoSchema,
  ManualBrokeragePortfolioResponseSchema,
  ReplaceManualBrokerageHoldingsDtoSchema,
} from '../types/Investment';
import type {
  MarketSecuritySearchQuery,
  MarketSecuritySearchResult,
} from '../types/MarketPrice';
import {
  MarketSecuritySearchQuerySchema,
  MarketSecuritySearchResultSchema,
} from '../types/MarketPrice';
import { MarketPriceService } from '../market-price/market-price.service';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { InvestmentService } from './investment.service';
import { ManualBrokerageService } from './manual-brokerage.service';

@ApiTags('investment')
@Controller('investment')
export class InvestmentController {
  constructor(
    private readonly investmentService: InvestmentService,
    private readonly manualBrokerageService: ManualBrokerageService,
    private readonly marketPriceService: MarketPriceService,
  ) {}

  @Get('securities/search')
  @ApiQuery({ name: 'query', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ZodApiResponse({
    status: 200,
    description: 'Search supported stock and ETF securities',
    schema: MarketSecuritySearchResultSchema,
    isArray: true,
  })
  async searchSecurities(
    @Query(new ZodValidationPipe(MarketSecuritySearchQuerySchema))
    query: MarketSecuritySearchQuery,
  ): Promise<MarketSecuritySearchResult[]> {
    return this.marketPriceService.search(query.query, query.limit);
  }

  @Post('manual-account')
  @ZodApiBody({ schema: CreateManualBrokerageAccountDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Created manual brokerage and valued its holdings',
    schema: ManualBrokeragePortfolioResponseSchema,
  })
  async createManualBrokerageAccount(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateManualBrokerageAccountDtoSchema))
    dto: CreateManualBrokerageAccountDto,
  ): Promise<ManualBrokeragePortfolioResponse> {
    return this.manualBrokerageService.createManualBrokerageAccount(
      dto,
      user.userId,
    );
  }

  @Put('account/:accountId/manual-holdings')
  @ZodApiBody({ schema: ReplaceManualBrokerageHoldingsDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Replaced and revalued a manual brokerage snapshot',
    schema: ManualBrokeragePortfolioResponseSchema,
  })
  async replaceManualBrokerageHoldings(
    @CurrentUser() user: JwtUser,
    @Param('accountId') accountId: string,
    @Body(new ZodValidationPipe(ReplaceManualBrokerageHoldingsDtoSchema))
    dto: ReplaceManualBrokerageHoldingsDto,
  ): Promise<ManualBrokeragePortfolioResponse> {
    return this.manualBrokerageService.replaceManualBrokerageHoldings(
      accountId,
      dto,
      user.userId,
    );
  }

  @Post('account/:accountId/refresh-prices')
  @HttpCode(200)
  @ZodApiResponse({
    status: 200,
    description: 'Refreshed and revalued manual brokerage prices',
    schema: ManualBrokeragePortfolioResponseSchema,
  })
  async refreshManualBrokeragePrices(
    @CurrentUser() user: JwtUser,
    @Param('accountId') accountId: string,
  ): Promise<ManualBrokeragePortfolioResponse> {
    return this.manualBrokerageService.refreshManualBrokeragePrices(
      accountId,
      user.userId,
    );
  }

  @Get('account/:accountId/activity')
  @ApiOperation({
    description: 'Get investment activity for an account',
  })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'subtype', required: false, type: String })
  @ApiQuery({ name: 'pageIndex', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ZodApiResponse({
    status: 200,
    description: 'Investment activity for the account',
    schema: PaginatedInvestmentActivityResponseSchema,
  })
  async findActivityForAccount(
    @CurrentUser() user: JwtUser,
    @Param('accountId') accountId: string,
    @Query(new ZodValidationPipe(InvestmentActivityQuerySchema))
    query: InvestmentActivityQuery,
  ): Promise<PaginatedInvestmentActivityResponse> {
    return this.investmentService.findActivityForAccount(
      user.userId,
      accountId,
      {
        startDate: query.startDate,
        endDate: query.endDate,
        type: query.type,
        subtype: query.subtype,
        pageIndex: query.pageIndex,
        pageSize: query.pageSize,
      },
    );
  }

  @Get('activity')
  @ApiOperation({
    description: 'Get investment activity across investment accounts',
  })
  @ApiQuery({ name: 'accountId', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'subtype', required: false, type: String })
  @ApiQuery({ name: 'pageIndex', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ZodApiResponse({
    status: 200,
    description: 'Investment activity for the current user',
    schema: PaginatedInvestmentActivityResponseSchema,
  })
  async findActivity(
    @CurrentUser() user: JwtUser,
    @Query(new ZodValidationPipe(InvestmentActivityQuerySchema))
    query: InvestmentActivityQuery,
  ): Promise<PaginatedInvestmentActivityResponse> {
    return this.investmentService.findActivity(user.userId, query);
  }

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
