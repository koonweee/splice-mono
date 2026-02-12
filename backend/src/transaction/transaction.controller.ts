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
  CreateTransactionDto,
  PaginatedTransactionResponse,
  Transaction,
  UpdateTransactionDto,
} from '../types/Transaction';
import {
  CreateTransactionDtoSchema,
  PaginatedTransactionResponseSchema,
  TransactionSchema,
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
    description: 'Sort column (date, merchantName, pending)',
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
    description: 'Filter by start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    description: 'Filter by end date (YYYY-MM-DD)',
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
