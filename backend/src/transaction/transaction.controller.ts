import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import dayjs from 'dayjs';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import { CurrencyConversionService } from '../currency-exchange/currency-conversion.service';
import { MoneySign } from '../types/MoneyWithSign';
import type {
  BulkTransactionCategoryReviewDto,
  BulkTransactionCategoryReviewResponse,
  BulkTransactionCategoryReviewUndoDto,
  CreateTransactionDto,
  PaginatedTransactionResponse,
  Transaction,
  TransactionCategoryReviewStatus,
  TransactionSummary,
  UpdateTransactionCategoryDto,
  UpdateTransactionCategoryReviewDto,
  UpdateTransactionDto,
} from '../types/Transaction';
import {
  BulkTransactionCategoryReviewDtoSchema,
  BulkTransactionCategoryReviewResponseSchema,
  BulkTransactionCategoryReviewUndoDtoSchema,
  CreateTransactionDtoSchema,
  PaginatedTransactionResponseSchema,
  TransactionSchema,
  TransactionSummarySchema,
  UpdateTransactionCategoryDtoSchema,
  UpdateTransactionCategoryReviewDtoSchema,
  UpdateTransactionDtoSchema,
} from '../types/Transaction';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { TransactionService } from './transaction.service';

@ApiTags('transaction')
@Controller('transaction')
export class TransactionController {
  constructor(
    private transactionService: TransactionService,
    private currencyConversionService: CurrencyConversionService,
  ) {}

  private normalizeCategoryReviewStatus(
    categoryReviewStatus?: string,
  ): TransactionCategoryReviewStatus | undefined {
    return categoryReviewStatus === 'needs_review' ||
      categoryReviewStatus === 'reviewed'
      ? categoryReviewStatus
      : undefined;
  }

  private async buildPreferredCurrencySummary(
    userId: string,
    nativeSummary: Awaited<ReturnType<TransactionService['getSummary']>>,
  ): Promise<TransactionSummary> {
    const preferredCurrency =
      await this.currencyConversionService.getPreferredCurrency(userId);
    const foreignCurrencies = nativeSummary.buckets
      .map((bucket) => bucket.currency)
      .filter((currency) => currency !== preferredCurrency);
    const rateMap = await this.currencyConversionService.getRateMap(
      foreignCurrencies,
      preferredCurrency,
      dayjs().format('YYYY-MM-DD'),
    );
    let inflowAmount = 0;
    let outflowAmount = 0;

    nativeSummary.buckets.forEach((bucket) => {
      const rate =
        bucket.currency === preferredCurrency
          ? 1
          : rateMap.get(bucket.currency);

      if (!rate) {
        return;
      }

      inflowAmount += this.currencyConversionService.convertAmount(
        bucket.inflowAmount,
        bucket.currency,
        preferredCurrency,
        rate,
      );
      outflowAmount += this.currencyConversionService.convertAmount(
        bucket.outflowAmount,
        bucket.currency,
        preferredCurrency,
        rate,
      );
    });

    const netAmount = inflowAmount - outflowAmount;

    return {
      currency: preferredCurrency,
      inflow: {
        money: { currency: preferredCurrency, amount: inflowAmount },
        sign: MoneySign.POSITIVE,
      },
      outflow: {
        money: { currency: preferredCurrency, amount: outflowAmount },
        sign: MoneySign.NEGATIVE,
      },
      net: {
        money: { currency: preferredCurrency, amount: Math.abs(netAmount) },
        sign: netAmount >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE,
      },
      transactionCount: nativeSummary.transactionCount,
      pendingCount: nativeSummary.pendingCount,
      needsReviewCount: nativeSummary.needsReviewCount,
    };
  }

  @Get()
  @ApiOperation({ description: 'Get all transactions (paginated)' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns paginated transactions',
    schema: PaginatedTransactionResponseSchema,
  })
  @ApiQuery({
    name: 'pageIndex',
    required: false,
    description: 'Page index (0-based)',
    example: 0,
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    description: 'Page size',
    example: 20,
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    description: 'Sort column (activityDate, merchantName, pending, amount)',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    description: 'Sort order (ASC or DESC)',
    example: 'DESC',
  })
  @ApiQuery({
    name: 'accountId',
    required: false,
    description: 'Filter by account ID',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter by activity start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter by activity end date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'categoryPrimary',
    required: false,
    description:
      'Filter by primary category (e.g. FOOD_AND_DRINK, UNCATEGORIZED)',
  })
  @ApiQuery({
    name: 'amountSign',
    required: false,
    description: 'Filter by amount sign (positive or negative)',
    enum: ['positive', 'negative'],
  })
  @ApiQuery({
    name: 'categoryReviewStatus',
    required: false,
    description: 'Filter by category review status',
    enum: ['needs_review', 'reviewed'],
  })
  @ApiQuery({
    name: 'convert',
    required: false,
    description:
      'When true, adds convertedAmount in user preferred currency to each transaction',
    type: Boolean,
  })
  async findAll(
    @CurrentUser() user: JwtUser,
    @Query('pageIndex') pageIndexStr?: string,
    @Query('pageSize') pageSizeStr?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('accountId') accountId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('categoryPrimary') categoryPrimary?: string,
    @Query('amountSign') amountSign?: string,
    @Query('convert') convertStr?: string,
    @Query('categoryReviewStatus') categoryReviewStatus?: string,
  ): Promise<PaginatedTransactionResponse> {
    const pageIndex = Math.max(0, parseInt(pageIndexStr ?? '0', 10) || 0);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(pageSizeStr ?? '20', 10) || 20),
    );
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const { data, total } = await this.transactionService.findAllPaginated(
      user.userId,
      {
        pageIndex,
        pageSize,
        sortBy,
        sortOrder: order,
        accountId,
        startDate,
        endDate,
        categoryPrimary,
        amountSign,
        categoryReviewStatus:
          categoryReviewStatus === 'needs_review' ||
          categoryReviewStatus === 'reviewed'
            ? categoryReviewStatus
            : undefined,
      },
    );

    // Optionally convert amounts to user's preferred currency
    if (convertStr === 'true' && data.length > 0) {
      const preferredCurrency =
        await this.currencyConversionService.getPreferredCurrency(user.userId);

      const foreignCurrencies = [
        ...new Set(
          data
            .map((txn) => txn.amount.money.currency)
            .filter((c) => c !== preferredCurrency),
        ),
      ];

      const rateMap = await this.currencyConversionService.getRateMap(
        foreignCurrencies,
        preferredCurrency,
        dayjs().format('YYYY-MM-DD'),
      );

      const convertedData = data.map((txn) => {
        const currency = txn.amount.money.currency;
        if (currency === preferredCurrency) {
          return txn;
        }

        const rate = rateMap.get(currency);
        if (!rate) {
          return txn;
        }

        const convertedSmallestUnit =
          this.currencyConversionService.convertAmount(
            txn.amount.money.amount,
            currency,
            preferredCurrency,
            rate,
          );

        return {
          ...txn,
          convertedAmount: {
            money: {
              currency: preferredCurrency,
              amount: convertedSmallestUnit,
            },
            sign: txn.amount.sign as MoneySign,
          },
        };
      });

      return { data: convertedData, total, pageIndex, pageSize };
    }

    return { data, total, pageIndex, pageSize };
  }

  @Get('summary')
  @ApiOperation({ description: 'Get filtered transaction summary totals' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns filtered transaction summary totals',
    schema: TransactionSummarySchema,
  })
  @ApiQuery({
    name: 'accountId',
    required: false,
    description: 'Filter by account ID',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    description: 'Filter by activity start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter by activity end date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'categoryPrimary',
    required: false,
    description:
      'Filter by primary category (e.g. FOOD_AND_DRINK, UNCATEGORIZED)',
  })
  @ApiQuery({
    name: 'amountSign',
    required: false,
    description: 'Filter by amount sign (positive or negative)',
    enum: ['positive', 'negative'],
  })
  @ApiQuery({
    name: 'categoryReviewStatus',
    required: false,
    description: 'Filter by category review status',
    enum: ['needs_review', 'reviewed'],
  })
  @ApiQuery({
    name: 'convert',
    required: false,
    description:
      'When false, still returns preferred-currency totals for stable frontend display',
    type: Boolean,
  })
  async getSummary(
    @CurrentUser() user: JwtUser,
    @Query('accountId') accountId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('categoryPrimary') categoryPrimary?: string,
    @Query('amountSign') amountSign?: string,
    @Query('convert') _convertStr?: string,
    @Query('categoryReviewStatus') categoryReviewStatus?: string,
  ): Promise<TransactionSummary> {
    const nativeSummary = await this.transactionService.getSummary(
      user.userId,
      {
        accountId,
        startDate,
        endDate,
        categoryPrimary,
        amountSign,
        categoryReviewStatus:
          this.normalizeCategoryReviewStatus(categoryReviewStatus),
      },
    );

    return this.buildPreferredCurrencySummary(user.userId, nativeSummary);
  }

  @Post()
  @ApiOperation({ description: 'Create a new transaction' })
  @ZodApiBody({ schema: CreateTransactionDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Transaction created successfully',
    schema: TransactionSchema,
  })
  async create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateTransactionDtoSchema))
    createTransactionDto: CreateTransactionDto,
  ): Promise<Transaction> {
    return this.transactionService.create(createTransactionDto, user.userId);
  }

  @Get(':id')
  @ApiOperation({ description: 'Get a transaction by ID' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns the transaction',
    schema: TransactionSchema,
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<Transaction> {
    const transaction = await this.transactionService.findOne(id, user.userId);
    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }
    return transaction;
  }

  @Patch(':id/category')
  @ApiOperation({ description: 'Update a transaction category override' })
  @ZodApiBody({ schema: UpdateTransactionCategoryDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Transaction category updated successfully',
    schema: TransactionSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction or category not found',
  })
  async updateCategory(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateTransactionCategoryDtoSchema))
    updateTransactionCategoryDto: UpdateTransactionCategoryDto,
  ): Promise<Transaction> {
    const transaction = await this.transactionService.updateCategory(
      id,
      updateTransactionCategoryDto,
      user.userId,
    );
    if (!transaction) {
      throw new NotFoundException(
        `Transaction or category for transaction ${id} not found`,
      );
    }
    return transaction;
  }

  @Patch(':id/category-review')
  @ApiOperation({ description: 'Update transaction category review status' })
  @ZodApiBody({ schema: UpdateTransactionCategoryReviewDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Transaction category review updated successfully',
    schema: TransactionSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction not found',
  })
  async updateCategoryReview(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateTransactionCategoryReviewDtoSchema))
    updateTransactionCategoryReviewDto: UpdateTransactionCategoryReviewDto,
  ): Promise<Transaction> {
    const transaction = await this.transactionService.updateCategoryReview(
      id,
      updateTransactionCategoryReviewDto,
      user.userId,
    );
    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }
    return transaction;
  }

  @Post('category-review/bulk')
  @ApiOperation({
    description: 'Mark matching unreviewed transaction categories as reviewed',
  })
  @ZodApiBody({ schema: BulkTransactionCategoryReviewDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Transaction categories bulk reviewed successfully',
    schema: BulkTransactionCategoryReviewResponseSchema,
  })
  async bulkReviewCategories(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(BulkTransactionCategoryReviewDtoSchema))
    bulkReviewDto: BulkTransactionCategoryReviewDto,
  ): Promise<BulkTransactionCategoryReviewResponse> {
    return this.transactionService.bulkReviewCategories(
      user.userId,
      bulkReviewDto,
    );
  }

  @Post('category-review/bulk/undo')
  @ApiOperation({ description: 'Undo a bulk transaction category review' })
  @ZodApiBody({ schema: BulkTransactionCategoryReviewUndoDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Bulk transaction category review undone successfully',
    schema: BulkTransactionCategoryReviewResponseSchema,
  })
  async undoBulkReviewCategories(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(BulkTransactionCategoryReviewUndoDtoSchema))
    undoDto: BulkTransactionCategoryReviewUndoDto,
  ): Promise<BulkTransactionCategoryReviewResponse> {
    return this.transactionService.undoBulkReviewCategories(
      user.userId,
      undoDto,
    );
  }

  @Patch(':id')
  @ApiOperation({ description: 'Update a transaction' })
  @ZodApiBody({ schema: UpdateTransactionDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Transaction updated successfully',
    schema: TransactionSchema,
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateTransactionDtoSchema))
    updateTransactionDto: UpdateTransactionDto,
  ): Promise<Transaction> {
    const transaction = await this.transactionService.update(
      id,
      updateTransactionDto,
      user.userId,
    );
    if (!transaction) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }
    return transaction;
  }

  @Delete(':id')
  @ApiOperation({ description: 'Delete a transaction' })
  @ApiResponse({ status: 204, description: 'Transaction deleted successfully' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    const deleted = await this.transactionService.remove(id, user.userId);
    if (!deleted) {
      throw new NotFoundException(`Transaction with id ${id} not found`);
    }
  }
}
