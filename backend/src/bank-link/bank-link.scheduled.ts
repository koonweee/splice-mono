import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import type { Account } from '../types/Account';
import { BankLinkEntity } from './bank-link.entity';
import { BankLinkService } from './bank-link.service';

/**
 * Scheduled service for automated bank link operations
 * Handles periodic syncing of accounts across all bank links
 */
@Injectable()
export class BankLinkScheduledService {
  private readonly logger = new Logger(BankLinkScheduledService.name);

  constructor(
    private readonly bankLinkService: BankLinkService,
    @InjectRepository(BankLinkEntity)
    private readonly bankLinkRepository: Repository<BankLinkEntity>,
  ) {}

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
      const accounts = await this.syncAllAccountsSystem();
      this.logger.log(
        { accountsSynced: accounts.length },
        'Scheduled sync completed',
      );
    } catch (error) {
      this.logger.error({ error: String(error) }, 'Scheduled sync failed');
    }
  }

  /**
   * Sync accounts for all bank links across all users (system operation)
   * Excludes Plaid providers which are synced via webhooks
   *
   * @returns Updated accounts from all bank links
   */
  private async syncAllAccountsSystem(): Promise<Account[]> {
    this.logger.log(
      {},
      'Syncing accounts for all bank links (system operation)',
    );

    // Exclude Plaid - it uses webhook-driven sync via DEFAULT_UPDATE
    const bankLinks = await this.bankLinkRepository.find({
      where: { providerName: Not('plaid') },
    });
    this.logger.log(
      { count: bankLinks.length },
      'Found bank links to sync (system)',
    );

    const results = await Promise.allSettled(
      bankLinks.map((bankLink) =>
        this.bankLinkService.syncAccounts(bankLink.id, bankLink.userId),
      ),
    );

    const allAccounts: Account[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allAccounts.push(...result.value);
      } else {
        this.logger.error(
          { bankLinkId: bankLinks[index].id, error: String(result.reason) },
          'Failed to sync accounts for bank link (system)',
        );
      }
    });

    this.logger.log(
      { count: allAccounts.length },
      'Synced accounts total (system)',
    );
    return allAccounts;
  }
}
