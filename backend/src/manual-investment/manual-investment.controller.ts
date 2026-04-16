import { Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type JwtUser,
} from '../auth/decorators/current-user.decorator';
import { ZodApiBody, ZodApiResponse } from '../common/zod-api-response';
import type {
  ManualInvestmentSnapshot,
  ReplaceManualInvestmentSnapshotDto,
} from '../types/ManualInvestment';
import {
  ManualInvestmentSnapshotSchema,
  ReplaceManualInvestmentSnapshotDtoSchema,
} from '../types/ManualInvestment';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { Body } from '@nestjs/common';
import { ManualInvestmentService } from './manual-investment.service';

@ApiTags('account')
@Controller('account/:accountId/manual-investment-snapshots')
export class ManualInvestmentController {
  constructor(
    private readonly manualInvestmentService: ManualInvestmentService,
  ) {}

  @Get()
  @ApiOperation({
    description: 'List manual investment snapshots for an account',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Returns snapshots',
    schema: ManualInvestmentSnapshotSchema,
    isArray: true,
  })
  async listSnapshots(
    @Param('accountId') accountId: string,
    @CurrentUser() user: JwtUser,
  ): Promise<ManualInvestmentSnapshot[]> {
    return this.manualInvestmentService.listSnapshots(accountId, user.userId);
  }

  @Get(':date')
  @ApiOperation({ description: 'Get a manual investment snapshot by date' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns the snapshot',
    schema: ManualInvestmentSnapshotSchema,
  })
  async getSnapshot(
    @Param('accountId') accountId: string,
    @Param('date') date: string,
    @CurrentUser() user: JwtUser,
  ): Promise<ManualInvestmentSnapshot> {
    return this.manualInvestmentService.getSnapshot(
      accountId,
      user.userId,
      date,
    );
  }

  @Put(':date')
  @ApiOperation({
    description: 'Create or replace a manual investment snapshot for a date',
  })
  @ZodApiBody({ schema: ReplaceManualInvestmentSnapshotDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Returns the saved snapshot',
    schema: ManualInvestmentSnapshotSchema,
  })
  async replaceSnapshot(
    @Param('accountId') accountId: string,
    @Param('date') date: string,
    @CurrentUser() user: JwtUser,
    @Body(new ZodValidationPipe(ReplaceManualInvestmentSnapshotDtoSchema))
    body: ReplaceManualInvestmentSnapshotDto,
  ): Promise<ManualInvestmentSnapshot> {
    return this.manualInvestmentService.replaceSnapshot(
      accountId,
      user.userId,
      date,
      body,
    );
  }

  @Delete(':date')
  @ApiOperation({ description: 'Delete a manual investment snapshot by date' })
  @ApiResponse({ status: 204, description: 'Snapshot deleted successfully' })
  async deleteSnapshot(
    @Param('accountId') accountId: string,
    @Param('date') date: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    await this.manualInvestmentService.deleteSnapshot(
      accountId,
      user.userId,
      date,
    );
  }
}
