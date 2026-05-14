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
  BulkTransactionCategoryUpdateDto,
  BulkTransactionCategoryUpdateResponse,
  BulkTransactionCategoryUpdateUndoDto,
  CreateManualTransactionDto,
  CreateTransactionDto,
  PaginatedTransactionResponse,
  Transaction,
  TransactionSummary,
  UpdateManualTransactionDto,
  UpdateTransactionCategoryDto,
  UpdateTransactionDto,
} from '../types/Transaction';
import {
  BulkTransactionCategoryUpdateDtoSchema,
  BulkTransactionCategoryUpdateResponseSchema,
  BulkTransactionCategoryUpdateUndoDtoSchema,
  CreateManualTransactionDtoSchema,
  CreateTransactionDtoSchema,
  PaginatedTransactionResponseSchema,
  TransactionSchema,
  TransactionSummarySchema,
  UpdateManualTransactionDtoSchema,
  UpdateTransactionCategoryDtoSchema,
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
      uncategorizedCount: nativeSummary.uncategorizedCount,
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
    name: 'categoryId',
    required: false,
    description:
      'Filter by exact category ID, or UNCATEGORIZED for transactions without a category',
  })
  @ApiQuery({
    name: 'amountSign',
    required: false,
    description: 'Filter by amount sign (positive or negative)',
    enum: ['positive', 'negative'],
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
    @Query('categoryId') categoryId?: string,
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
        categoryId,
        categoryPrimary,
        amountSign,
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
    name: 'categoryId',
    required: false,
    description:
      'Filter by exact category ID, or UNCATEGORIZED for transactions without a category',
  })
  @ApiQuery({
    name: 'amountSign',
    required: false,
    description: 'Filter by amount sign (positive or negative)',
    enum: ['positive', 'negative'],
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
    @Query('categoryId') categoryId?: string,
  ): Promise<TransactionSummary> {
    const nativeSummary = await this.transactionService.getSummary(
      user.userId,
      {
        accountId,
        startDate,
        endDate,
        categoryId,
        categoryPrimary,
        amountSign,
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

  @Post('manual')
  @ApiOperation({ description: 'Create a manual transaction' })
  @ZodApiBody({ schema: CreateManualTransactionDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Manual transaction created successfully',
    schema: TransactionSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Account or category not found',
  })
  async createManual(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateManualTransactionDtoSchema))
    createManualTransactionDto: CreateManualTransactionDto,
  ): Promise<Transaction> {
    const transaction = await this.transactionService.createManual(
      user.userId,
      createManualTransactionDto,
    );
    if (!transaction) {
      throw new NotFoundException(
        'Manual transaction account or category not found',
      );
    }
    return transaction;
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

  @Post('category/bulk')
  @ApiOperation({ description: 'Bulk update transaction category overrides' })
  @ZodApiBody({ schema: BulkTransactionCategoryUpdateDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Transaction categories bulk updated successfully',
    schema: BulkTransactionCategoryUpdateResponseSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Transaction or category not found',
  })
  async bulkUpdateCategories(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(BulkTransactionCategoryUpdateDtoSchema))
    bulkUpdateDto: BulkTransactionCategoryUpdateDto,
  ): Promise<BulkTransactionCategoryUpdateResponse> {
    const result = await this.transactionService.bulkUpdateCategories(
      user.userId,
      bulkUpdateDto,
    );
    if (!result) {
      throw new NotFoundException(
        'One or more transactions or the selected category were not found',
      );
    }

    return result;
  }

  @Post('category/bulk/undo')
  @ApiOperation({ description: 'Undo a bulk transaction category update' })
  @ZodApiBody({ schema: BulkTransactionCategoryUpdateUndoDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Bulk transaction category update undone successfully',
    schema: BulkTransactionCategoryUpdateResponseSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Undo payload is invalid or expired',
  })
  async undoBulkUpdateCategories(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(BulkTransactionCategoryUpdateUndoDtoSchema))
    undoDto: BulkTransactionCategoryUpdateUndoDto,
  ): Promise<BulkTransactionCategoryUpdateResponse> {
    const result = await this.transactionService.undoBulkUpdateCategories(
      user.userId,
      undoDto,
    );
    if (!result) {
      throw new NotFoundException('Bulk category update undo is unavailable');
    }

    return result;
  }

  @Patch(':id/manual')
  @ApiOperation({ description: 'Update a manual transaction' })
  @ZodApiBody({ schema: UpdateManualTransactionDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Manual transaction updated successfully',
    schema: TransactionSchema,
  })
  @ApiResponse({ status: 404, description: 'Manual transaction not found' })
  async updateManual(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateManualTransactionDtoSchema))
    updateManualTransactionDto: UpdateManualTransactionDto,
  ): Promise<Transaction> {
    const transaction = await this.transactionService.updateManual(
      id,
      user.userId,
      updateManualTransactionDto,
    );
    if (!transaction) {
      throw new NotFoundException(`Manual transaction with id ${id} not found`);
    }
    return transaction;
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

  @Delete(':id/manual')
  @ApiOperation({ description: 'Delete a manual transaction' })
  @ApiResponse({
    status: 204,
    description: 'Manual transaction deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Manual transaction not found' })
  async removeManual(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    const deleted = await this.transactionService.removeManual(id, user.userId);
    if (!deleted) {
      throw new NotFoundException(`Manual transaction with id ${id} not found`);
    }
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
