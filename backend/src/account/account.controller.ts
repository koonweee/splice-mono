import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import {
  registerSchema,
  ZodApiBody,
  ZodApiResponse,
} from '../common/zod-api-response';
import { z } from 'zod';
import type {
  Account,
  CreateManualAccountDto,
  UpdateAccountMetadataDto,
} from '../types/Account';
import {
  AccountSchema,
  CreateManualAccountDtoSchema,
  UpdateAccountMetadataDtoSchema,
} from '../types/Account';
import { CurrentAndAvailableBalanceSchema } from '../types/MoneyWithSign';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { AccountService } from './account.service';

export const UpdateBalanceBodySchema = registerSchema(
  'UpdateBalanceBody',
  z
    .object({
      balance: CurrentAndAvailableBalanceSchema.shape.currentBalance,
    })
    .strict(),
);

@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(private accountService: AccountService) {}

  @Get()
  @ApiOperation({ description: 'Get all accounts' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns all accounts',
    schema: AccountSchema,
    isArray: true,
  })
  async findAll(@CurrentUser() user: JwtUser): Promise<Account[]> {
    return this.accountService.findAll(user.userId);
  }

  @Post()
  @ApiOperation({ description: 'Create a new manual account' })
  @ZodApiBody({ schema: CreateManualAccountDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Account created successfully',
    schema: AccountSchema,
  })
  async create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateManualAccountDtoSchema))
    createAccountDto: CreateManualAccountDto,
  ): Promise<Account> {
    // Create the account, then return it with converted balances
    const account = await this.accountService.create(
      createAccountDto,
      user.userId,
    );
    return account;
  }

  @Get(':id')
  @ApiOperation({ description: 'Get an account by ID with converted balances' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns the account',
    schema: AccountSchema,
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<Account> {
    const account = await this.accountService.findOne(id, user.userId);
    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }
    return account;
  }

  @Patch(':id')
  @ApiOperation({ description: 'Update user-editable account metadata' })
  @ZodApiBody({ schema: UpdateAccountMetadataDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Returns the updated account',
    schema: AccountSchema,
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateAccountMetadataDtoSchema))
    updateAccountDto: UpdateAccountMetadataDto,
  ): Promise<Account> {
    const account = await this.accountService.update(
      id,
      updateAccountDto,
      user.userId,
    );
    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }
    return account;
  }

  @Post(':id/balance')
  @ApiOperation({ description: 'Manually update account balance' })
  @ZodApiBody({ schema: UpdateBalanceBodySchema })
  @ZodApiResponse({
    status: 200,
    description: 'Returns the updated account',
    schema: AccountSchema,
  })
  async updateBalance(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(UpdateBalanceBodySchema))
    body: z.infer<typeof UpdateBalanceBodySchema>,
  ): Promise<Account> {
    return this.accountService.updateManualBalance(
      id,
      user.userId,
      body.balance,
    );
  }

  @Post(':id/archive')
  @ApiOperation({
    description: 'Archive an account and zero its current balances',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns the archived account',
    schema: AccountSchema,
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<Account> {
    const account = await this.accountService.archive(id, user.userId);
    if (!account) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }
    return account;
  }

  @Delete(':id')
  @ApiOperation({ description: 'Delete an account' })
  @ApiResponse({ status: 204, description: 'Account deleted successfully' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    const deleted = await this.accountService.remove(id, user.userId);
    if (!deleted) {
      throw new NotFoundException(`Account with id ${id} not found`);
    }
  }
}
