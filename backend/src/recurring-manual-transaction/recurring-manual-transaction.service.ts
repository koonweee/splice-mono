import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { In, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm';
import { AccountEntity } from '../account/account.entity';
import { CategoryEntity } from '../category/category.entity';
import { CategoryService } from '../category/category.service';
import { BalanceColumns } from '../common/balance.columns';
import { TransactionService } from '../transaction/transaction.service';
import { UserEntity } from '../user/user.entity';
import type { CreateManualTransactionDto } from '../types/Transaction';
import type {
  CreateRecurringManualTransactionScheduleDto,
  RecurringManualTransactionSchedule,
  UpdateRecurringManualTransactionScheduleDto,
} from '../types/RecurringManualTransaction';
import {
  getNextMonthlyOccurrenceAfter,
  getNextMonthlyOccurrenceOnOrAfter,
  isValidDateOnly,
} from './recurring-manual-transaction-date';
import { RecurringManualTransactionOccurrenceEntity } from './recurring-manual-transaction-occurrence.entity';
import { RecurringManualTransactionScheduleEntity } from './recurring-manual-transaction-schedule.entity';

dayjs.extend(utc);
dayjs.extend(timezone);

type ResolvedScheduleFields = {
  account: AccountEntity;
  category: CategoryEntity;
  amount: BalanceColumns;
  merchantName: string;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
};

export type RecurringManualTransactionGenerationResult = {
  created: number;
  skipped: number;
};

@Injectable()
export class RecurringManualTransactionService {
  private readonly logger = new Logger(RecurringManualTransactionService.name);
  private readonly relations = ['account', 'category'];

  constructor(
    @InjectRepository(RecurringManualTransactionScheduleEntity)
    private readonly scheduleRepository: Repository<RecurringManualTransactionScheduleEntity>,
    @InjectRepository(RecurringManualTransactionOccurrenceEntity)
    private readonly occurrenceRepository: Repository<RecurringManualTransactionOccurrenceEntity>,
    @InjectRepository(AccountEntity)
    private readonly accountRepository: Repository<AccountEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly categoryService: CategoryService,
    private readonly transactionService: TransactionService,
  ) {}

  async findAll(userId: string): Promise<RecurringManualTransactionSchedule[]> {
    const schedules = await this.scheduleRepository.find({
      where: { userId, archivedAt: IsNull() },
      relations: this.relations,
      order: { nextOccurrenceDate: 'ASC', merchantName: 'ASC' },
    });

    return schedules.map((schedule) => schedule.toObject());
  }

  async create(
    userId: string,
    dto: CreateRecurringManualTransactionScheduleDto,
  ): Promise<RecurringManualTransactionSchedule | null> {
    const resolved = await this.resolveScheduleFields(userId, dto);
    if (!resolved) {
      return null;
    }

    const nextOccurrenceDate = this.computeNextOccurrenceDate({
      startDate: resolved.startDate,
      dayOfMonth: resolved.dayOfMonth,
      endDate: resolved.endDate,
      onOrAfterDate: resolved.startDate,
    });

    if (!nextOccurrenceDate) {
      throw new BadRequestException(
        'Recurring schedule has no occurrence before its end date',
      );
    }

    const schedule = new RecurringManualTransactionScheduleEntity();
    schedule.userId = userId;
    this.applyResolvedFields(schedule, resolved);
    schedule.frequency = 'monthly';
    schedule.nextOccurrenceDate = nextOccurrenceDate;
    schedule.lastGeneratedOccurrenceDate = null;
    schedule.pausedAt = null;
    schedule.archivedAt = null;

    const saved = await this.scheduleRepository.save(schedule);
    const userToday = await this.getTodayForUser(userId);
    if (
      saved.nextOccurrenceDate &&
      !dayjs(saved.nextOccurrenceDate).isAfter(userToday, 'day')
    ) {
      await this.generateDueOccurrencesForSchedule(
        saved.id,
        saved.nextOccurrenceDate,
        1,
      );
    }

    const refreshed =
      (await this.scheduleRepository.findOne({
        where: { id: saved.id, userId },
        relations: this.relations,
      })) ?? saved;
    this.logger.log(
      {
        id: refreshed.id,
        userId,
        nextOccurrenceDate: refreshed.nextOccurrenceDate,
      },
      'Recurring manual transaction schedule created',
    );
    return refreshed.toObject();
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateRecurringManualTransactionScheduleDto,
  ): Promise<RecurringManualTransactionSchedule | null> {
    const schedule = await this.findActiveScheduleEntity(id, userId);
    if (!schedule) {
      return null;
    }

    const resolved = await this.resolveScheduleFields(userId, dto, schedule);
    if (!resolved) {
      return null;
    }

    this.applyResolvedFields(schedule, resolved);

    if (dto.paused !== undefined) {
      schedule.pausedAt = dto.paused ? new Date() : null;
    }

    const today = await this.getTodayForUser(userId);
    const onOrAfterDate =
      schedule.nextOccurrenceDate &&
      dayjs(schedule.nextOccurrenceDate).isAfter(today, 'day')
        ? schedule.nextOccurrenceDate
        : today;
    schedule.nextOccurrenceDate = this.computeNextOccurrenceDate({
      startDate: schedule.startDate,
      dayOfMonth: schedule.dayOfMonth,
      endDate: schedule.endDate,
      onOrAfterDate,
    });

    const saved = await this.scheduleRepository.save(schedule);
    this.logger.log({ id, userId }, 'Recurring manual transaction updated');
    return saved.toObject();
  }

  async archive(id: string, userId: string): Promise<boolean> {
    const schedule = await this.findActiveScheduleEntity(id, userId);
    if (!schedule) {
      return false;
    }

    schedule.archivedAt = new Date();
    await this.scheduleRepository.save(schedule);
    this.logger.log({ id, userId }, 'Recurring manual transaction archived');
    return true;
  }

  async pause(
    id: string,
    userId: string,
  ): Promise<RecurringManualTransactionSchedule | null> {
    return this.update(id, userId, { paused: true });
  }

  async resume(
    id: string,
    userId: string,
  ): Promise<RecurringManualTransactionSchedule | null> {
    return this.update(id, userId, { paused: false });
  }

  async generateDueOccurrences(
    todayDate: string,
  ): Promise<RecurringManualTransactionGenerationResult> {
    if (!isValidDateOnly(todayDate)) {
      throw new BadRequestException('todayDate must be a YYYY-MM-DD date');
    }

    const schedules = await this.scheduleRepository.find({
      where: {
        archivedAt: IsNull(),
        pausedAt: IsNull(),
        nextOccurrenceDate: LessThanOrEqual(todayDate),
      },
      relations: this.relations,
      order: { nextOccurrenceDate: 'ASC' },
    });

    const totals = await schedules.reduce(
      async (previous, schedule) => {
        const result = await previous;
        const scheduleResult = await this.generateDueOccurrencesForSchedule(
          schedule.id,
          todayDate,
        );
        return {
          created: result.created + scheduleResult.created,
          skipped: result.skipped + scheduleResult.skipped,
        };
      },
      Promise.resolve({ created: 0, skipped: 0 }),
    );

    return totals;
  }

  async generateDueOccurrencesForLocalDates(
    now: Date = new Date(),
  ): Promise<RecurringManualTransactionGenerationResult> {
    const schedules = await this.scheduleRepository.find({
      where: {
        archivedAt: IsNull(),
        pausedAt: IsNull(),
        nextOccurrenceDate: Not(IsNull()),
      },
      relations: this.relations,
      order: { nextOccurrenceDate: 'ASC' },
    });
    const userIds = [...new Set(schedules.map((schedule) => schedule.userId))];
    const users =
      userIds.length === 0
        ? []
        : await this.userRepository.find({
            where: { id: In(userIds) },
            select: ['id', 'settings'],
          });
    const timezoneByUserId = new Map(
      users.map((user) => [user.id, user.settings?.timezone ?? 'UTC']),
    );

    const totals = await schedules.reduce(
      async (previous, schedule) => {
        const result = await previous;
        const localToday = this.getLocalDate(
          now,
          timezoneByUserId.get(schedule.userId) ?? 'UTC',
        );
        if (
          !schedule.nextOccurrenceDate ||
          dayjs(schedule.nextOccurrenceDate).isAfter(localToday, 'day')
        ) {
          return result;
        }

        const scheduleResult = await this.generateDueOccurrencesForSchedule(
          schedule.id,
          localToday,
        );
        return {
          created: result.created + scheduleResult.created,
          skipped: result.skipped + scheduleResult.skipped,
        };
      },
      Promise.resolve({ created: 0, skipped: 0 }),
    );

    return totals;
  }

  private async generateDueOccurrencesForSchedule(
    scheduleId: string,
    todayDate: string,
    maxOccurrences = Number.POSITIVE_INFINITY,
  ): Promise<RecurringManualTransactionGenerationResult> {
    const result = { created: 0, skipped: 0 };
    let shouldContinue = true;

    while (shouldContinue && result.created + result.skipped < maxOccurrences) {
      const didCreate = await this.scheduleRepository.manager.transaction(
        async (manager) => {
          const schedule = await manager
            .getRepository(RecurringManualTransactionScheduleEntity)
            .findOne({
              where: { id: scheduleId },
              relations: this.relations,
            });

          if (
            !schedule ||
            schedule.archivedAt ||
            schedule.pausedAt ||
            !schedule.nextOccurrenceDate ||
            dayjs(schedule.nextOccurrenceDate).isAfter(todayDate, 'day')
          ) {
            shouldContinue = false;
            return false;
          }

          const occurrenceDate = schedule.nextOccurrenceDate;
          const existingOccurrence = await manager
            .getRepository(RecurringManualTransactionOccurrenceEntity)
            .findOne({
              where: { scheduleId: schedule.id, occurrenceDate },
            });

          if (existingOccurrence) {
            schedule.lastGeneratedOccurrenceDate = occurrenceDate;
            schedule.nextOccurrenceDate = this.computeNextOccurrenceAfter(
              schedule,
              occurrenceDate,
            );
            await manager
              .getRepository(RecurringManualTransactionScheduleEntity)
              .save(schedule);
            result.skipped += 1;
            return true;
          }

          const manualDto = this.buildManualTransactionDto(
            schedule,
            occurrenceDate,
          );
          const transaction =
            await this.transactionService.createManualEntityWithManager(
              schedule.userId,
              manualDto,
              schedule.account,
              schedule.category,
              manager,
            );

          const occurrence = new RecurringManualTransactionOccurrenceEntity();
          occurrence.userId = schedule.userId;
          occurrence.scheduleId = schedule.id;
          occurrence.occurrenceDate = occurrenceDate;
          occurrence.transactionId = transaction.id;
          occurrence.generatedAt = new Date();
          await manager
            .getRepository(RecurringManualTransactionOccurrenceEntity)
            .save(occurrence);

          schedule.lastGeneratedOccurrenceDate = occurrenceDate;
          schedule.nextOccurrenceDate = this.computeNextOccurrenceAfter(
            schedule,
            occurrenceDate,
          );
          await manager
            .getRepository(RecurringManualTransactionScheduleEntity)
            .save(schedule);

          this.logger.log(
            {
              scheduleId: schedule.id,
              userId: schedule.userId,
              occurrenceDate,
              transactionId: transaction.id,
            },
            'Generated recurring manual transaction occurrence',
          );
          result.created += 1;
          return true;
        },
      );

      shouldContinue = shouldContinue && didCreate;
    }

    return result;
  }

  private async findActiveScheduleEntity(
    id: string,
    userId: string,
  ): Promise<RecurringManualTransactionScheduleEntity | null> {
    return this.scheduleRepository.findOne({
      where: { id, userId, archivedAt: IsNull() },
      relations: this.relations,
    });
  }

  private async resolveScheduleFields(
    userId: string,
    dto:
      | CreateRecurringManualTransactionScheduleDto
      | UpdateRecurringManualTransactionScheduleDto,
    existing?: RecurringManualTransactionScheduleEntity,
  ): Promise<ResolvedScheduleFields | null> {
    const accountId = dto.accountId ?? existing?.accountId;
    const categoryId = dto.categoryId ?? existing?.categoryId;
    if (!accountId || !categoryId) {
      throw new NotFoundException('Account or category not found');
    }

    const [account, category] = await Promise.all([
      this.findActiveUserAccount(accountId, userId),
      this.categoryService.findActiveAssignableCategory(categoryId, userId),
    ]);

    if (!account || !category) {
      return null;
    }

    const amount = this.buildScheduleAmount(
      dto.amount ?? existing?.amount.toMoneyWithSign(),
      account,
    );
    const merchantName = dto.merchantName ?? existing?.merchantName;
    const dayOfMonth = dto.dayOfMonth ?? existing?.dayOfMonth;
    const startDate = dto.startDate ?? existing?.startDate;
    const endDate =
      dto.endDate === undefined ? (existing?.endDate ?? null) : dto.endDate;

    if (!merchantName || !dayOfMonth || !startDate) {
      throw new BadRequestException('Recurring schedule is incomplete');
    }
    if (!isValidDateOnly(startDate) || (endDate && !isValidDateOnly(endDate))) {
      throw new BadRequestException('Recurring schedule dates are invalid');
    }
    if (endDate && dayjs(endDate).isBefore(startDate, 'day')) {
      throw new BadRequestException('End date cannot be before start date');
    }

    return {
      account,
      category,
      amount,
      merchantName,
      dayOfMonth,
      startDate,
      endDate: endDate ?? null,
    };
  }

  private findActiveUserAccount(
    accountId: string,
    userId: string,
  ): Promise<AccountEntity | null> {
    return this.accountRepository.findOne({
      where: { id: accountId, userId, archivedAt: IsNull() },
    });
  }

  private async getTodayForUser(userId: string): Promise<string> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'settings'],
    });
    return this.getLocalDate(new Date(), user?.settings?.timezone ?? 'UTC');
  }

  private getLocalDate(now: Date, timezoneName: string): string {
    try {
      return dayjs(now).tz(timezoneName).format('YYYY-MM-DD');
    } catch {
      return dayjs(now).utc().format('YYYY-MM-DD');
    }
  }

  private buildScheduleAmount(
    amount: CreateRecurringManualTransactionScheduleDto['amount'] | undefined,
    account: AccountEntity,
  ): BalanceColumns {
    if (!amount || amount.money.amount === '0') {
      throw new BadRequestException(
        'Recurring manual transaction amount must be positive',
      );
    }

    const accountCurrency = account.currentBalance.currency;
    if (amount.money.currency !== accountCurrency) {
      throw new BadRequestException(
        'Recurring manual transaction currency must match the selected account currency',
      );
    }

    return BalanceColumns.fromMoneyWithSign({
      money: {
        amount: amount.money.amount,
        currency: accountCurrency,
      },
      sign: amount.sign,
    });
  }

  private applyResolvedFields(
    schedule: RecurringManualTransactionScheduleEntity,
    resolved: ResolvedScheduleFields,
  ): void {
    schedule.accountId = resolved.account.id;
    schedule.account = resolved.account;
    schedule.amount = resolved.amount;
    schedule.merchantName = resolved.merchantName;
    schedule.categoryId = resolved.category.id;
    schedule.category = resolved.category;
    schedule.dayOfMonth = resolved.dayOfMonth;
    schedule.startDate = resolved.startDate;
    schedule.endDate = resolved.endDate;
  }

  private computeNextOccurrenceDate(input: {
    startDate: string;
    dayOfMonth: number;
    onOrAfterDate: string;
    endDate?: string | null;
  }): string | null {
    return getNextMonthlyOccurrenceOnOrAfter(input);
  }

  private computeNextOccurrenceAfter(
    schedule: RecurringManualTransactionScheduleEntity,
    occurrenceDate: string,
  ): string | null {
    return getNextMonthlyOccurrenceAfter({
      startDate: schedule.startDate,
      dayOfMonth: schedule.dayOfMonth,
      afterDate: occurrenceDate,
      endDate: schedule.endDate,
    });
  }

  private buildManualTransactionDto(
    schedule: RecurringManualTransactionScheduleEntity,
    occurrenceDate: string,
  ): CreateManualTransactionDto {
    return {
      accountId: schedule.accountId,
      amount: schedule.amount.toMoneyWithSign(),
      merchantName: schedule.merchantName,
      providerDate: occurrenceDate,
      categoryId: schedule.categoryId,
    };
  }
}
