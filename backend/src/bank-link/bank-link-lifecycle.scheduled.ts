import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BankLinkLifecycleService } from './bank-link-lifecycle.service';

@Injectable()
export class BankLinkLifecycleScheduledService {
  private readonly logger = new Logger(BankLinkLifecycleScheduledService.name);

  constructor(
    private readonly bankLinkLifecycleService: BankLinkLifecycleService,
  ) {}

  @Cron('0 45 4 * * *', {
    name: 'emptyBankLinkArchival',
    timeZone: 'UTC',
  })
  async archiveStaleEmptyBankLinks(): Promise<void> {
    try {
      const archivedCount =
        await this.bankLinkLifecycleService.archiveStaleEmptyBankLinks();
      if (archivedCount > 0) {
        this.logger.log(
          { archivedCount },
          'Archived stale bank links without active accounts',
        );
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to archive stale bank links without active accounts',
      );
    }
  }
}
