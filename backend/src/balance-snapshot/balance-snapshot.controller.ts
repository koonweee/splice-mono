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
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import {
  BalanceSnapshotSchema,
  CreateBalanceSnapshotDtoSchema,
  UpdateBalanceSnapshotDtoSchema,
  type BalanceSnapshot,
  type CreateBalanceSnapshotDto,
  type UpdateBalanceSnapshotDto,
} from '../types/BalanceSnapshot';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { BalanceSnapshotService } from './balance-snapshot.service';

@ApiTags('balance-snapshot')
@Controller('balance-snapshot')
export class BalanceSnapshotController {
  constructor(private balanceSnapshotService: BalanceSnapshotService) {}

  @Get()
  @ApiOperation({ description: 'Get all balance snapshots' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns all balance snapshots',
    schema: BalanceSnapshotSchema,
    isArray: true,
  })
  async findAll(@CurrentUser() user: JwtUser): Promise<BalanceSnapshot[]> {
    return this.balanceSnapshotService.findAll(user.userId);
  }

  @Post()
  @ApiOperation({ description: 'Create a new balance snapshot' })
  @ZodApiBody({ schema: CreateBalanceSnapshotDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Balance snapshot created successfully',
    schema: BalanceSnapshotSchema,
  })
  async create(
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(CreateBalanceSnapshotDtoSchema))
    createDto: CreateBalanceSnapshotDto,
  ): Promise<BalanceSnapshot> {
    return this.balanceSnapshotService.create(createDto, user.userId);
  }

  @Get(':id')
  @ApiOperation({ description: 'Get a balance snapshot by ID' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns the balance snapshot',
    schema: BalanceSnapshotSchema,
  })
  @ApiResponse({ status: 404, description: 'Balance snapshot not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<BalanceSnapshot> {
    const snapshot = await this.balanceSnapshotService.findOne(id, user.userId);
    if (!snapshot) {
      throw new NotFoundException(`Balance snapshot with id ${id} not found`);
    }
    return snapshot;
  }

  @Get('account/:accountId')
  @ApiOperation({ description: 'Get all balance snapshots for an account' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns balance snapshots for the account',
    schema: BalanceSnapshotSchema,
    isArray: true,
  })
  async findByAccountId(
    @Param('accountId') accountId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<BalanceSnapshot[]> {
    return this.balanceSnapshotService.findByAccountId(accountId, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ description: 'Update a balance snapshot' })
  @ZodApiBody({ schema: UpdateBalanceSnapshotDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Balance snapshot updated successfully',
    schema: BalanceSnapshotSchema,
  })
  @ApiResponse({ status: 404, description: 'Balance snapshot not found' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBalanceSnapshotDtoSchema))
    updateDto: UpdateBalanceSnapshotDto,
    @CurrentUser() user: JwtUser,
  ): Promise<BalanceSnapshot> {
    const snapshot = await this.balanceSnapshotService.update(
      id,
      updateDto,
      user.userId,
    );
    if (!snapshot) {
      throw new NotFoundException(`Balance snapshot with id ${id} not found`);
    }
    return snapshot;
  }

  @Delete(':id')
  @ApiOperation({ description: 'Delete a balance snapshot' })
  @ApiResponse({
    status: 204,
    description: 'Balance snapshot deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Balance snapshot not found' })
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    const deleted = await this.balanceSnapshotService.remove(id, user.userId);
    if (!deleted) {
      throw new NotFoundException(`Balance snapshot with id ${id} not found`);
    }
  }
}
