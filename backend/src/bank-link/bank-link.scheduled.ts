import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BankLinkService } from './bank-link.service';

/**
 * Scheduled service for automated bank link operations
 * Handles periodic syncing of accounts across all bank links
 */
@Injectable()
export class BankLinkScheduledService {
  private readonly logger = new Logger(BankLinkScheduledService.name);

  constructor(private readonly bankLinkService: BankLinkService) {}

  /**
   * Sync all bank link accounts daily at 5:00 PM PST
   */
  @Cron('0 0 17 * * *', {
    name: 'syncAllBankLinkAccounts',
    timeZone: 'America/Los_Angeles',
  })
  async handleSyncAllAccounts(): Promise<void> {
    this.logger.log({}, 'Starting scheduled sync of all bank link accounts');

    try {
      const accounts = await this.bankLinkService.syncAllAccountsSystem();
      this.logger.log(
        { accountsSynced: accounts.length },
        'Scheduled sync completed',
      );
    } catch (error) {
      this.logger.error({ error: String(error) }, 'Scheduled sync failed');
    }
  }
}
