import { BadRequestException } from '@nestjs/common';
import { AccountEntity } from '../../src/account/account.entity';
import { CategoryEntity } from '../../src/category/category.entity';
import { CategoryService } from '../../src/category/category.service';
import { BalanceColumns } from '../../src/common/balance.columns';
import { RecurringManualTransactionOccurrenceEntity } from '../../src/recurring-manual-transaction/recurring-manual-transaction-occurrence.entity';
import { RecurringManualTransactionScheduleEntity } from '../../src/recurring-manual-transaction/recurring-manual-transaction-schedule.entity';
import { RecurringManualTransactionService } from '../../src/recurring-manual-transaction/recurring-manual-transaction.service';
import { TransactionService } from '../../src/transaction/transaction.service';
import { MoneySign } from '../../src/types/MoneyWithSign';
import type { CreateRecurringManualTransactionScheduleDto } from '../../src/types/RecurringManualTransaction';

const userId = '00000000-0000-4000-8000-000000000001';
const losAngelesUserId = '00000000-0000-4000-8000-000000000002';
const tokyoUserId = '00000000-0000-4000-8000-000000000003';
const accountId = '00000000-0000-4000-8000-000000000010';
const categoryId = '00000000-0000-4000-8000-000000000020';
const scheduleId = '00000000-0000-4000-8000-000000000030';
const transactionId = '00000000-0000-4000-8000-000000000040';

function buildAccount(overrides: Partial<AccountEntity> = {}): AccountEntity {
  const account = new AccountEntity();
  account.id = overrides.id ?? accountId;
  account.userId = overrides.userId ?? userId;
  account.name = overrides.name ?? 'Checking';
  account.customName = overrides.customName ?? null;
  account.mask = overrides.mask ?? null;
  account.availableBalance =
    overrides.availableBalance ??
    BalanceColumns.fromMoneyWithSign({
      money: { amount: '10000', currency: 'USD' },
      sign: MoneySign.POSITIVE,
    });
  account.currentBalance =
    overrides.currentBalance ??
    BalanceColumns.fromMoneyWithSign({
      money: { amount: '10000', currency: 'USD' },
      sign: MoneySign.POSITIVE,
    });
  account.type = overrides.type ?? 'depository';
  account.subType = overrides.subType ?? 'checking';
  account.externalAccountId = overrides.externalAccountId ?? null;
  account.rawApiAccount = overrides.rawApiAccount ?? null;
  account.archivedAt = overrides.archivedAt ?? null;
  account.bankLinkId = overrides.bankLinkId ?? null;
  account.bankLink = overrides.bankLink ?? null;
  account.createdAt =
    overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z');
  account.updatedAt =
    overrides.updatedAt ?? new Date('2026-01-01T00:00:00.000Z');
  return account;
}

function buildCategory(
  overrides: Partial<CategoryEntity> = {},
): CategoryEntity {
  const category = new CategoryEntity();
  category.id = overrides.id ?? categoryId;
  category.userId = overrides.userId ?? userId;
  category.setLabels(
    overrides.primary ?? 'Bills',
    overrides.detailed ?? 'Rent',
  );
  category.description = overrides.description ?? '';
  category.color = overrides.color ?? '#228be6';
  category.archivedAt = overrides.archivedAt ?? null;
  category.createdAt =
    overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z');
  category.updatedAt =
    overrides.updatedAt ?? new Date('2026-01-01T00:00:00.000Z');
  return category;
}

function buildCreateDto(
  overrides: Partial<CreateRecurringManualTransactionScheduleDto> = {},
): CreateRecurringManualTransactionScheduleDto {
  return {
    accountId,
    amount: {
      money: { amount: '125000', currency: 'USD' },
      sign: MoneySign.NEGATIVE,
    },
    merchantName: 'Rent',
    categoryId,
    frequency: 'monthly',
    dayOfMonth: 31,
    startDate: '2099-01-31',
    endDate: null,
    ...overrides,
  };
}

function buildSchedule(
  overrides: Partial<RecurringManualTransactionScheduleEntity> = {},
): RecurringManualTransactionScheduleEntity {
  const schedule = new RecurringManualTransactionScheduleEntity();
  schedule.id = overrides.id ?? scheduleId;
  schedule.userId = overrides.userId ?? userId;
  schedule.account = overrides.account ?? buildAccount();
  schedule.accountId = overrides.accountId ?? schedule.account.id;
  schedule.amount =
    overrides.amount ??
    BalanceColumns.fromMoneyWithSign({
      money: { amount: '125000', currency: 'USD' },
      sign: MoneySign.NEGATIVE,
    });
  schedule.merchantName = overrides.merchantName ?? 'Rent';
  schedule.category = overrides.category ?? buildCategory();
  schedule.categoryId = overrides.categoryId ?? schedule.category.id;
  schedule.frequency = overrides.frequency ?? 'monthly';
  schedule.dayOfMonth = overrides.dayOfMonth ?? 31;
  schedule.startDate = overrides.startDate ?? '2026-01-31';
  schedule.endDate = overrides.endDate ?? null;
  schedule.nextOccurrenceDate = overrides.nextOccurrenceDate ?? '2026-01-31';
  schedule.lastGeneratedOccurrenceDate =
    overrides.lastGeneratedOccurrenceDate ?? null;
  schedule.pausedAt = overrides.pausedAt ?? null;
  schedule.archivedAt = overrides.archivedAt ?? null;
  schedule.createdAt =
    overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z');
  schedule.updatedAt =
    overrides.updatedAt ?? new Date('2026-01-01T00:00:00.000Z');
  return schedule;
}

describe('RecurringManualTransactionService', () => {
  const scheduleRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    manager: {
      transaction: jest.fn(),
    },
  };
  const occurrenceRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const accountRepository = {
    findOne: jest.fn(),
  };
  const userRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };
  const categoryService = {
    findActiveAssignableCategory: jest.fn(),
  };
  const transactionService = {
    createManualEntityWithManager: jest.fn(),
  };
  let service: RecurringManualTransactionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RecurringManualTransactionService(
      scheduleRepository as never,
      occurrenceRepository as never,
      accountRepository as never,
      userRepository as never,
      categoryService as unknown as CategoryService,
      transactionService as unknown as TransactionService,
    );
    userRepository.findOne.mockResolvedValue({
      id: userId,
      settings: { timezone: 'UTC' },
    });
    userRepository.find.mockResolvedValue([]);
    scheduleRepository.save.mockImplementation(
      async (schedule: RecurringManualTransactionScheduleEntity) => {
        schedule.id = schedule.id ?? scheduleId;
        schedule.createdAt =
          schedule.createdAt ?? new Date('2026-01-01T00:00:00.000Z');
        schedule.updatedAt =
          schedule.updatedAt ?? new Date('2026-01-01T00:00:00.000Z');
        return schedule;
      },
    );
    occurrenceRepository.save.mockImplementation(
      async (occurrence: RecurringManualTransactionOccurrenceEntity) =>
        occurrence,
    );
    scheduleRepository.manager.transaction.mockImplementation(
      async (callback) =>
        callback({
          getRepository: (entity: unknown) => {
            if (entity === RecurringManualTransactionScheduleEntity) {
              return scheduleRepository;
            }
            if (entity === RecurringManualTransactionOccurrenceEntity) {
              return occurrenceRepository;
            }
            return {};
          },
        }),
    );
  });

  it('creates a monthly schedule with a clamped next occurrence', async () => {
    accountRepository.findOne.mockResolvedValueOnce(buildAccount());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      buildCategory(),
    );

    const result = await service.create(userId, buildCreateDto());

    expect(result).toMatchObject({
      userId,
      accountId,
      merchantName: 'Rent',
      dayOfMonth: 31,
      startDate: '2099-01-31',
      nextOccurrenceDate: '2099-01-31',
      pausedAt: null,
      archivedAt: null,
    });
    expect(scheduleRepository.save).toHaveBeenCalledTimes(1);
  });

  it('materializes one due first occurrence when a new schedule starts in the past', async () => {
    const dueSchedule = buildSchedule({
      startDate: '2026-01-31',
      nextOccurrenceDate: '2026-01-31',
    });
    const advancedSchedule = buildSchedule({
      startDate: '2026-01-31',
      nextOccurrenceDate: '2026-02-28',
      lastGeneratedOccurrenceDate: '2026-01-31',
    });
    accountRepository.findOne.mockResolvedValueOnce(buildAccount());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      buildCategory(),
    );
    scheduleRepository.save.mockResolvedValueOnce(dueSchedule);
    scheduleRepository.findOne
      .mockResolvedValueOnce(dueSchedule)
      .mockResolvedValueOnce(advancedSchedule);
    occurrenceRepository.findOne.mockResolvedValueOnce(null);
    transactionService.createManualEntityWithManager.mockResolvedValueOnce({
      id: transactionId,
    });

    const result = await service.create(
      userId,
      buildCreateDto({ startDate: '2026-01-31' }),
    );

    expect(result?.nextOccurrenceDate).toBe('2026-02-28');
    expect(
      transactionService.createManualEntityWithManager,
    ).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ providerDate: '2026-01-31' }),
      dueSchedule.account,
      dueSchedule.category,
      expect.any(Object),
    );
  });

  it('rejects unavailable accounts, categories, invalid dates, and mismatched currencies', async () => {
    accountRepository.findOne.mockResolvedValueOnce(null);
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      buildCategory(),
    );
    await expect(service.create(userId, buildCreateDto())).resolves.toBeNull();

    accountRepository.findOne.mockResolvedValueOnce(buildAccount());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(null);
    await expect(service.create(userId, buildCreateDto())).resolves.toBeNull();

    accountRepository.findOne.mockResolvedValueOnce(buildAccount());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      buildCategory(),
    );
    await expect(
      service.create(
        userId,
        buildCreateDto({
          amount: {
            money: { amount: '1200', currency: 'EUR' },
            sign: MoneySign.NEGATIVE,
          },
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    accountRepository.findOne.mockResolvedValueOnce(buildAccount());
    categoryService.findActiveAssignableCategory.mockResolvedValueOnce(
      buildCategory(),
    );
    await expect(
      service.create(
        userId,
        buildCreateDto({ startDate: '2026-04-01', endDate: '2026-03-31' }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('archives schedules without deleting generated transactions', async () => {
    scheduleRepository.findOne.mockResolvedValueOnce(buildSchedule());

    await expect(service.archive(scheduleId, userId)).resolves.toBe(true);

    const saved = scheduleRepository.save.mock.calls[0][0] as
      | RecurringManualTransactionScheduleEntity
      | undefined;
    expect(saved?.archivedAt).toBeInstanceOf(Date);
  });

  it('generates due occurrences once and advances to the next month', async () => {
    const dueSchedule = buildSchedule();
    const advancedSchedule = buildSchedule({
      nextOccurrenceDate: '2026-02-28',
      lastGeneratedOccurrenceDate: '2026-01-31',
    });
    scheduleRepository.find.mockResolvedValueOnce([dueSchedule]);
    scheduleRepository.findOne
      .mockResolvedValueOnce(dueSchedule)
      .mockResolvedValueOnce(advancedSchedule);
    occurrenceRepository.findOne.mockResolvedValueOnce(null);
    transactionService.createManualEntityWithManager.mockResolvedValueOnce({
      id: transactionId,
    });

    const result = await service.generateDueOccurrences('2026-01-31');

    expect(result).toEqual({ created: 1, skipped: 0 });
    expect(
      transactionService.createManualEntityWithManager,
    ).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        providerDate: '2026-01-31',
        merchantName: 'Rent',
      }),
      dueSchedule.account,
      dueSchedule.category,
      expect.any(Object),
    );
    expect(occurrenceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        scheduleId,
        occurrenceDate: '2026-01-31',
        transactionId,
      }),
    );
    expect(scheduleRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lastGeneratedOccurrenceDate: '2026-01-31',
        nextOccurrenceDate: '2026-02-28',
      }),
    );
  });

  it('generates half-hourly occurrences only after each user local date is due', async () => {
    const losAngelesSchedule = buildSchedule({
      id: '00000000-0000-4000-8000-000000000031',
      userId: losAngelesUserId,
      nextOccurrenceDate: '2026-06-02',
      startDate: '2026-06-02',
    });
    const tokyoSchedule = buildSchedule({
      id: '00000000-0000-4000-8000-000000000032',
      userId: tokyoUserId,
      nextOccurrenceDate: '2026-06-02',
      startDate: '2026-06-02',
    });
    scheduleRepository.find.mockResolvedValueOnce([
      losAngelesSchedule,
      tokyoSchedule,
    ]);
    userRepository.find.mockResolvedValueOnce([
      {
        id: losAngelesUserId,
        settings: { timezone: 'America/Los_Angeles' },
      },
      { id: tokyoUserId, settings: { timezone: 'Asia/Tokyo' } },
    ]);
    scheduleRepository.findOne.mockResolvedValueOnce(tokyoSchedule);
    occurrenceRepository.findOne.mockResolvedValueOnce(null);
    transactionService.createManualEntityWithManager.mockResolvedValueOnce({
      id: transactionId,
    });

    const result = await service.generateDueOccurrencesForLocalDates(
      new Date('2026-06-01T16:30:00.000Z'),
    );

    expect(result).toEqual({ created: 1, skipped: 0 });
    expect(scheduleRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: tokyoSchedule.id },
      }),
    );
    expect(
      transactionService.createManualEntityWithManager,
    ).toHaveBeenCalledWith(
      tokyoUserId,
      expect.objectContaining({ providerDate: '2026-06-02' }),
      tokyoSchedule.account,
      tokyoSchedule.category,
      expect.any(Object),
    );
  });

  it('skips an already-recorded occurrence without creating a duplicate transaction', async () => {
    const dueSchedule = buildSchedule();
    scheduleRepository.find.mockResolvedValueOnce([dueSchedule]);
    scheduleRepository.findOne
      .mockResolvedValueOnce(dueSchedule)
      .mockResolvedValueOnce(
        buildSchedule({
          nextOccurrenceDate: '2026-02-28',
          lastGeneratedOccurrenceDate: '2026-01-31',
        }),
      );
    occurrenceRepository.findOne.mockResolvedValueOnce(
      new RecurringManualTransactionOccurrenceEntity(),
    );

    const result = await service.generateDueOccurrences('2026-01-31');

    expect(result).toEqual({ created: 0, skipped: 1 });
    expect(
      transactionService.createManualEntityWithManager,
    ).not.toHaveBeenCalled();
  });
});
