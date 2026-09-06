import { fxRequestKey } from '../currency-exchange/currency-exchange.service';
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
  PaginatedTransactionResponse,
  Transaction,
  UpdateManualTransactionDto,
  UpdateTransactionCategoryDto,
  UpdateTransactionReportingDateDto,
} from '../types/Transaction';
import {
  BulkTransactionCategoryUpdateDtoSchema,
  BulkTransactionCategoryUpdateResponseSchema,
  BulkTransactionCategoryUpdateUndoDtoSchema,
  CreateManualTransactionDtoSchema,
  PaginatedTransactionResponseSchema,
  TransactionSchema,
  UpdateManualTransactionDtoSchema,
  UpdateTransactionCategoryDtoSchema,
  UpdateTransactionReportingDateDtoSchema,
} from '../types/Transaction';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { TransactionService } from './transaction.service';
import { TransactionQueryService } from './transaction-query.service';
import { getTransactionActivityDate } from './transaction-date';
import type { RateWithSource } from '../types/ExchangeRate';

@ApiTags('transaction')
@Controller('transaction')
export class TransactionController {
  constructor(
    private transactionService: TransactionService,
    private currencyConversionService: CurrencyConversionService,
    private transactionQueries: TransactionQueryService,
  ) {}

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
  @ApiQuery({
    name: 'cursor',
    required: false,
    description:
      'Continuation cursor; omit pageIndex to use cursor pagination.',
  })
  @ApiQuery({
    name: 'includeTotal',
    required: false,
    type: Boolean,
    description:
      'Request the exact count. Defaults to true on the first page and false on cursor continuations.',
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
    @Query('cursor') cursor?: string,
    @Query('includeTotal') includeTotalStr?: string,
  ): Promise<PaginatedTransactionResponse> {
    const pageIndex = Math.max(0, parseInt(pageIndexStr ?? '0', 10) || 0);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(pageSizeStr ?? '20', 10) || 20),
    );
    const order = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    const staged = await this.transactionQueries.withReadSnapshot(
      async (manager) => {
        const page = await this.transactionQueries.readPage(
          user.userId,
          {
            pageIndex: pageIndexStr === undefined ? undefined : pageIndex,
            pageSize,
            sortBy,
            sortOrder: order,
            accountId,
            startDate,
            endDate,
            categoryId,
            categoryPrimary,
            amountSign,
            cursor,
            includeTotal:
              includeTotalStr === undefined
                ? undefined
                : includeTotalStr === 'true',
          },
          manager,
        );
        if (convertStr !== 'true' || page.entities.length === 0) {
          return {
            page,
            preferredCurrency: null,
            rates: new Map<string, RateWithSource>(),
          };
        }
        const preferredCurrency =
          await this.currencyConversionService.getPreferredCurrency(
            user.userId,
            manager,
          );
        const requests = page.entities
          .filter(
            (transaction) =>
              transaction.amount.currency !== preferredCurrency &&
              transaction.amount.amount !== '0',
          )
          .map((transaction) => ({
            baseCurrency: transaction.amount.currency,
            targetCurrency: preferredCurrency,
            requestedDate: getTransactionActivityDate(transaction),
          }));
        const rates = await this.currencyConversionService.getResolvedRates(
          requests,
          manager,
        );
        return { page, preferredCurrency, rates };
      },
    );
    // All SQL has committed before DTO formatting or monetary conversion.
    const { total, nextCursor, hasMore } = staged.page;
    const data = staged.page.entities.map((transaction) =>
      transaction.toObject(),
    );
    const { preferredCurrency, rates } = staged;
    const pagination = {
      total,
      nextCursor,
      hasMore,
      pageIndex: pageIndexStr === undefined ? null : pageIndex,
      pageSize,
    };

    if (preferredCurrency !== null) {
      const convertedData = data.map((txn) => {
        const currency = txn.amount.money.currency;
        if (currency === preferredCurrency) {
          return txn;
        }

        if (txn.amount.money.amount === '0')
          return {
            ...txn,
            convertedAmount: {
              money: { amount: '0', currency: preferredCurrency },
              sign: txn.amount.sign,
            },
          };
        const rate = rates.get(
          fxRequestKey({
            baseCurrency: currency,
            targetCurrency: preferredCurrency,
            requestedDate: txn.activityDate,
          }),
        );
        if (!rate)
          throw new Error(
            'Required transaction-date exchange rate was not resolved',
          );

        const convertedSmallestUnit =
          this.currencyConversionService.convertAmount(
            txn.amount.money.amount,
            currency,
            preferredCurrency,
            rate.ratio,
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

      return { data: convertedData, ...pagination };
    }

    return { data, ...pagination };
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
  @ApiOperation({ description: 'Update a transaction reporting date override' })
  @ZodApiBody({ schema: UpdateTransactionReportingDateDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Transaction updated successfully',
    schema: TransactionSchema,
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateTransactionReportingDateDtoSchema))
    updateTransactionDto: UpdateTransactionReportingDateDto,
  ): Promise<Transaction> {
    const transaction = await this.transactionService.updateReportingDate(
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
}
