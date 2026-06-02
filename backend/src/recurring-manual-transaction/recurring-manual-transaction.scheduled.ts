import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RecurringManualTransactionService } from './recurring-manual-transaction.service';

@Injectable()
export class RecurringManualTransactionScheduledService {
  private readonly logger = new Logger(
    RecurringManualTransactionScheduledService.name,
  );

  constructor(
    private readonly recurringManualTransactionService: RecurringManualTransactionService,
  ) {}

  @Cron('0 */30 * * * *', {
    name: 'generateRecurringManualTransactions',
    timeZone: 'UTC',
  })
  async handleGenerateDueOccurrences(): Promise<void> {
    const now = new Date();
    this.logger.log({ now }, 'Generating recurring manual transactions');

    try {
      const result =
        await this.recurringManualTransactionService.generateDueOccurrencesForLocalDates(
          now,
        );
      this.logger.log(
        { now, ...result },
        'Recurring manual transaction generation completed',
      );
    } catch (error) {
      this.logger.error(
        { now, error: String(error) },
        'Recurring manual transaction generation failed',
      );
    }
  }
}
