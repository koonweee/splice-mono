import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RecurringManualTransactionController } from '../../src/recurring-manual-transaction/recurring-manual-transaction.controller';
import { RecurringManualTransactionService } from '../../src/recurring-manual-transaction/recurring-manual-transaction.service';
import { MoneySign } from '../../src/types/MoneyWithSign';
import type { RecurringManualTransactionSchedule } from '../../src/types/RecurringManualTransaction';

const user = {
  userId: '00000000-0000-4000-8000-000000000001',
  email: 'user@example.com',
};
const scheduleId = '00000000-0000-4000-8000-000000000030';
const schedule: RecurringManualTransactionSchedule = {
  id: scheduleId,
  userId: user.userId,
  accountId: '00000000-0000-4000-8000-000000000010',
  accountName: 'Checking',
  amount: {
    money: { amount: 125000, currency: 'USD' },
    sign: MoneySign.NEGATIVE,
  },
  merchantName: 'Rent',
  categoryId: '00000000-0000-4000-8000-000000000020',
  category: null,
  frequency: 'monthly',
  dayOfMonth: 31,
  startDate: '2026-01-31',
  endDate: null,
  nextOccurrenceDate: '2026-01-31',
  lastGeneratedOccurrenceDate: null,
  pausedAt: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('RecurringManualTransactionController', () => {
  const service = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    archive: jest.fn(),
  };
  let controller: RecurringManualTransactionController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecurringManualTransactionController],
      providers: [
        {
          provide: RecurringManualTransactionService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get(RecurringManualTransactionController);
  });

  it('delegates user-scoped schedule operations', async () => {
    service.findAll.mockResolvedValueOnce([schedule]);
    service.create.mockResolvedValueOnce(schedule);
    service.update.mockResolvedValueOnce({ ...schedule, merchantName: 'Gym' });
    service.pause.mockResolvedValueOnce({ ...schedule, pausedAt: new Date() });
    service.resume.mockResolvedValueOnce(schedule);
    service.archive.mockResolvedValueOnce(true);

    await expect(controller.findAll(user)).resolves.toEqual([schedule]);
    await expect(
      controller.create(user, {
        accountId: schedule.accountId,
        amount: schedule.amount,
        merchantName: schedule.merchantName,
        categoryId: schedule.categoryId,
        frequency: 'monthly',
        dayOfMonth: 31,
        startDate: '2026-01-31',
        endDate: null,
      }),
    ).resolves.toBe(schedule);
    await expect(
      controller.update(scheduleId, user, { merchantName: 'Gym' }),
    ).resolves.toMatchObject({ merchantName: 'Gym' });
    await expect(controller.pause(scheduleId, user)).resolves.toMatchObject({
      pausedAt: expect.any(Date),
    });
    await expect(controller.resume(scheduleId, user)).resolves.toBe(schedule);
    await expect(controller.archive(scheduleId, user)).resolves.toBeUndefined();

    expect(service.findAll).toHaveBeenCalledWith(user.userId);
    expect(service.create).toHaveBeenCalledWith(
      user.userId,
      expect.objectContaining({ dayOfMonth: 31 }),
    );
    expect(service.update).toHaveBeenCalledWith(scheduleId, user.userId, {
      merchantName: 'Gym',
    });
    expect(service.archive).toHaveBeenCalledWith(scheduleId, user.userId);
  });

  it('returns not found for missing schedules and invalid account/category selections', async () => {
    service.create.mockResolvedValueOnce(null);
    service.update.mockResolvedValueOnce(null);
    service.pause.mockResolvedValueOnce(null);
    service.resume.mockResolvedValueOnce(null);
    service.archive.mockResolvedValueOnce(false);

    await expect(
      controller.create(user, {
        accountId: schedule.accountId,
        amount: schedule.amount,
        merchantName: schedule.merchantName,
        categoryId: schedule.categoryId,
        frequency: 'monthly',
        dayOfMonth: 31,
        startDate: '2026-01-31',
        endDate: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.update(scheduleId, user, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.pause(scheduleId, user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.resume(scheduleId, user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(controller.archive(scheduleId, user)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
