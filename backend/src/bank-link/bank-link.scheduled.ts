import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOptionsWhere } from 'typeorm';
import { In, Not, Repository } from 'typeorm';
import type { Account } from '../types/Account';
import { BankLinkEntity } from './bank-link.entity';
import { BankLinkService } from './bank-link.service';

/**
 * Providers excluded from scheduled sync (use webhooks instead)
 */
const WEBHOOK_PROVIDERS = ['plaid'];

/**
 * Providers that need frequent (hourly) sync due to price volatility
 */
const FREQUENT_SYNC_PROVIDERS = ['crypto'];

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
   * Daily sync at 5:00 PM PST for standard providers
   * Excludes webhook-driven providers (Plaid) and frequent-sync providers (crypto)
   */
  @Cron('0 0 17 * * *', {
    name: 'dailyBankLinkSync',
    timeZone: 'America/Los_Angeles',
  })
  async handleDailySync(): Promise<void> {
    this.logger.log({}, 'Starting daily bank link sync');

    const excludedProviders = [
      ...WEBHOOK_PROVIDERS,
      ...FREQUENT_SYNC_PROVIDERS,
    ];

    try {
      const accounts = await this.syncBankLinks(
        { providerName: Not(In(excludedProviders)) },
        'daily',
      );
      this.logger.log(
        { accountsSynced: accounts.length },
        'Daily sync completed',
      );
    } catch (error) {
      this.logger.error({ error: String(error) }, 'Daily sync failed');
    }
  }

  /**
   * Hourly sync for volatile providers (crypto)
   * More frequent due to price volatility
   */
  @Cron('0 0 * * * *', {
    name: 'frequentBankLinkSync',
    timeZone: 'UTC',
  })
  async handleFrequentSync(): Promise<void> {
    this.logger.log({}, 'Starting frequent bank link sync');

    try {
      const accounts = await this.syncBankLinks(
        { providerName: In(FREQUENT_SYNC_PROVIDERS) },
        'frequent',
      );
      this.logger.log(
        { accountsSynced: accounts.length },
        'Frequent sync completed',
      );
    } catch (error) {
      this.logger.error({ error: String(error) }, 'Frequent sync failed');
    }
  }

  /**
   * Sync accounts for bank links matching the given criteria
   *
   * @param where - TypeORM where clause to filter bank links
   * @param context - Description for logging purposes
   * @returns Updated accounts from all matching bank links
   */
  private async syncBankLinks(
    where: FindOptionsWhere<BankLinkEntity>,
    context: string,
  ): Promise<Account[]> {
    const bankLinks = await this.bankLinkRepository.find({ where });

    if (bankLinks.length === 0) {
      this.logger.log({ context }, 'No bank links to sync');
      return [];
    }

    this.logger.log(
      { count: bankLinks.length, context },
      'Found bank links to sync',
    );

    const results = await Promise.allSettled(
      bankLinks.map((link) =>
        this.bankLinkService.syncAccounts(link.id, link.userId),
      ),
    );

    const allAccounts: Account[] = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        allAccounts.push(...result.value);
      } else {
        this.logger.error(
          {
            bankLinkId: bankLinks[index].id,
            context,
            error: String(result.reason),
          },
          'Failed to sync bank link',
        );
      }
    });

    return allAccounts;
  }
}
