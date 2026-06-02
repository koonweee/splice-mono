import { RecurringManualTransactionScheduledService } from '../../src/recurring-manual-transaction/recurring-manual-transaction.scheduled';
import { RecurringManualTransactionService } from '../../src/recurring-manual-transaction/recurring-manual-transaction.service';

describe('RecurringManualTransactionScheduledService', () => {
  const recurringManualTransactionService = {
    generateDueOccurrences: jest.fn(),
    generateDueOccurrencesForLocalDates: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates half-hourly generation to the recurring service', async () => {
    recurringManualTransactionService.generateDueOccurrencesForLocalDates.mockResolvedValueOnce(
      { created: 2, skipped: 1 },
    );
    const scheduledService = new RecurringManualTransactionScheduledService(
      recurringManualTransactionService as unknown as RecurringManualTransactionService,
    );

    await scheduledService.handleGenerateDueOccurrences();

    expect(
      recurringManualTransactionService.generateDueOccurrencesForLocalDates,
    ).toHaveBeenCalledWith(expect.any(Date));
  });

  it('logs and swallows generation errors so cron remains healthy', async () => {
    recurringManualTransactionService.generateDueOccurrencesForLocalDates.mockRejectedValueOnce(
      new Error('failed'),
    );
    const scheduledService = new RecurringManualTransactionScheduledService(
      recurringManualTransactionService as unknown as RecurringManualTransactionService,
    );

    await expect(
      scheduledService.handleGenerateDueOccurrences(),
    ).resolves.toBeUndefined();
  });
});
