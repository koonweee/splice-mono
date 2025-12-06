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
import type { Account, CreateAccountDto } from '../types/Account';
import { AccountSchema, CreateAccountDtoSchema } from '../types/Account';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { AccountService } from './account.service';

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
  @ApiOperation({ description: 'Create a new account' })
  @ZodApiBody({ schema: CreateAccountDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Account created successfully',
    schema: AccountSchema,
  })
  async create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateAccountDtoSchema))
    createAccountDto: CreateAccountDto,
  ): Promise<Account> {
    return this.accountService.create(createAccountDto, user.userId);
  }

  @Get(':id')
  @ApiOperation({ description: 'Get an account by ID' })
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
