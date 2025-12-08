import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import type {
  AccountWithConvertedBalance,
  CreateAccountDto,
} from '../types/Account';
import {
  AccountWithConvertedBalanceSchema,
  CreateAccountDtoSchema,
} from '../types/Account';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { AccountService } from './account.service';

@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(private accountService: AccountService) {}

  @Get()
  @ApiOperation({ description: 'Get all accounts with converted balances' })
  @ZodApiResponse({
    status: 200,
    description:
      'Returns all accounts with balances converted to user currency',
    schema: AccountWithConvertedBalanceSchema,
    isArray: true,
  })
  async findAll(
    @CurrentUser() user: JwtUser,
  ): Promise<AccountWithConvertedBalance[]> {
    return this.accountService.findAllWithConversion(user.userId);
  }

  @Post()
  @ApiOperation({ description: 'Create a new account' })
  @ZodApiBody({ schema: CreateAccountDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Account created successfully',
    schema: AccountWithConvertedBalanceSchema,
  })
  async create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateAccountDtoSchema))
    createAccountDto: CreateAccountDto,
  ): Promise<AccountWithConvertedBalance> {
    // Create the account, then return it with converted balances
    const account = await this.accountService.create(
      createAccountDto,
      user.userId,
    );
    const accountWithConversion =
      await this.accountService.findOneWithConversion(account.id, user.userId);
    // Account was just created, so it must exist
    return accountWithConversion!;
  }

  @Get(':id')
  @ApiOperation({ description: 'Get an account by ID with converted balances' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns the account with balances converted to user currency',
    schema: AccountWithConvertedBalanceSchema,
  })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<AccountWithConvertedBalance> {
    const account = await this.accountService.findOneWithConversion(
      id,
      user.userId,
    );
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
