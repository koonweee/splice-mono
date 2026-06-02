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
import type {
  CreateRecurringManualTransactionScheduleDto,
  RecurringManualTransactionSchedule,
  UpdateRecurringManualTransactionScheduleDto,
} from '../types/RecurringManualTransaction';
import {
  CreateRecurringManualTransactionScheduleDtoSchema,
  RecurringManualTransactionScheduleSchema,
  UpdateRecurringManualTransactionScheduleDtoSchema,
} from '../types/RecurringManualTransaction';
import { ZodValidationPipe } from '../zod-validation/zod-validation.pipe';
import { RecurringManualTransactionService } from './recurring-manual-transaction.service';

@ApiTags('recurring-manual-transaction')
@Controller('recurring-manual-transaction')
export class RecurringManualTransactionController {
  constructor(
    private readonly recurringManualTransactionService: RecurringManualTransactionService,
  ) {}

  @Get()
  @ApiOperation({ description: 'Get recurring manual transaction schedules' })
  @ZodApiResponse({
    status: 200,
    description: 'Returns recurring manual transaction schedules',
    schema: RecurringManualTransactionScheduleSchema,
    isArray: true,
  })
  findAll(
    @CurrentUser() user: JwtUser,
  ): Promise<RecurringManualTransactionSchedule[]> {
    return this.recurringManualTransactionService.findAll(user.userId);
  }

  @Post()
  @ApiOperation({
    description: 'Create a recurring manual transaction schedule',
  })
  @ZodApiBody({ schema: CreateRecurringManualTransactionScheduleDtoSchema })
  @ZodApiResponse({
    status: 201,
    description: 'Recurring manual transaction schedule created',
    schema: RecurringManualTransactionScheduleSchema,
  })
  @ApiResponse({ status: 404, description: 'Account or category not found' })
  async create(
    @CurrentUser() user: JwtUser,
    @Body(
      new ZodValidationPipe(CreateRecurringManualTransactionScheduleDtoSchema),
    )
    dto: CreateRecurringManualTransactionScheduleDto,
  ): Promise<RecurringManualTransactionSchedule> {
    const schedule = await this.recurringManualTransactionService.create(
      user.userId,
      dto,
    );
    if (!schedule) {
      throw new NotFoundException(
        'Recurring manual transaction account or category not found',
      );
    }

    return schedule;
  }

  @Patch(':id')
  @ApiOperation({
    description: 'Update a recurring manual transaction schedule',
  })
  @ZodApiBody({ schema: UpdateRecurringManualTransactionScheduleDtoSchema })
  @ZodApiResponse({
    status: 200,
    description: 'Recurring manual transaction schedule updated',
    schema: RecurringManualTransactionScheduleSchema,
  })
  @ApiResponse({
    status: 404,
    description: 'Recurring manual transaction schedule not found',
  })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
    @Body(
      new ZodValidationPipe(UpdateRecurringManualTransactionScheduleDtoSchema),
    )
    dto: UpdateRecurringManualTransactionScheduleDto,
  ): Promise<RecurringManualTransactionSchedule> {
    const schedule = await this.recurringManualTransactionService.update(
      id,
      user.userId,
      dto,
    );
    if (!schedule) {
      throw new NotFoundException(
        `Recurring manual transaction schedule with id ${id} not found`,
      );
    }

    return schedule;
  }

  @Post(':id/pause')
  @ApiOperation({
    description: 'Pause a recurring manual transaction schedule',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Recurring manual transaction schedule paused',
    schema: RecurringManualTransactionScheduleSchema,
  })
  async pause(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<RecurringManualTransactionSchedule> {
    const schedule = await this.recurringManualTransactionService.pause(
      id,
      user.userId,
    );
    if (!schedule) {
      throw new NotFoundException(
        `Recurring manual transaction schedule with id ${id} not found`,
      );
    }

    return schedule;
  }

  @Post(':id/resume')
  @ApiOperation({
    description: 'Resume a recurring manual transaction schedule',
  })
  @ZodApiResponse({
    status: 200,
    description: 'Recurring manual transaction schedule resumed',
    schema: RecurringManualTransactionScheduleSchema,
  })
  async resume(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<RecurringManualTransactionSchedule> {
    const schedule = await this.recurringManualTransactionService.resume(
      id,
      user.userId,
    );
    if (!schedule) {
      throw new NotFoundException(
        `Recurring manual transaction schedule with id ${id} not found`,
      );
    }

    return schedule;
  }

  @Delete(':id')
  @ApiOperation({
    description: 'Archive a recurring manual transaction schedule',
  })
  @ApiResponse({
    status: 204,
    description: 'Recurring manual transaction schedule archived',
  })
  @ApiResponse({
    status: 404,
    description: 'Recurring manual transaction schedule not found',
  })
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ): Promise<void> {
    const archived = await this.recurringManualTransactionService.archive(
      id,
      user.userId,
    );
    if (!archived) {
      throw new NotFoundException(
        `Recurring manual transaction schedule with id ${id} not found`,
      );
    }
  }
}
