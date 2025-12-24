import { Inject, Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import { AccountSubtype, AccountType } from 'plaid';
import type {
  APIAccount,
  GetAccountsResponse,
  Institution,
  LinkInitiationResponse,
} from '../../../types/BankLink';
import { MoneySign, MoneyWithSign } from '../../../types/MoneyWithSign';
import type { IBankLinkProvider } from '../bank-link-provider.interface';
import {
  type ScrapedAccountData,
  type ScrapedData,
  ScraperAuthenticationSchema,
} from './scraper.types';
import type { ScraperStrategy } from './strategies/scraper-strategy.interface';

const SCRAPER_TIMEOUT_MS = 20000;

@Injectable()
export class ScraperProvider implements IBankLinkProvider {
  readonly providerName = 'scraper';
  private readonly logger = new Logger(ScraperProvider.name);
  private readonly strategies = new Map<string, ScraperStrategy>();

  constructor(
    @Inject('SCRAPER_STRATEGIES')
    strategyList: ScraperStrategy[],
  ) {
    strategyList.forEach((strategy) => {
      this.strategies.set(strategy.name, strategy);
    });
  }

  async initiateLinking(_input: {
    userId: string;
    redirectUri?: string;
    providerUserDetails?: Record<string, unknown>;
  }): Promise<LinkInitiationResponse> {
    this.logger.log({}, 'Scraper provider does not initiate linking flow');
    return {};
  }

  async getAccounts(
    authentication: Record<string, unknown>,
  ): Promise<GetAccountsResponse> {
    const parseResult = ScraperAuthenticationSchema.safeParse(authentication);
    if (!parseResult.success) {
      throw new Error(
        `Invalid scraper authentication: ${parseResult.error.message}`,
      );
    }

    const { bankId, username, password } = parseResult.data;
    const strategy = this.strategies.get(bankId);
    if (!strategy) {
      throw new Error(`No scraper strategy found for bankId: ${bankId}`);
    }

    this.logger.log({ bankId }, 'Fetching accounts via scraper');

    const scrapedData = await this.scrapeWithStrategy(strategy, {
      username,
      password,
    });

    const accounts = this.mapScrapedDataToAccounts(
      scrapedData,
      bankId,
      strategy,
    );

    const institution: Institution = strategy.institution ?? {
      id: bankId,
      name: bankId,
    };

    return { accounts, institution };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async verifyWebhook(
    _rawBody: string,
    _headers: Record<string, string>,
  ): Promise<boolean> {
    return false;
  }

  private async scrapeWithStrategy(
    strategy: ScraperStrategy,
    credentials: Record<string, string>,
  ): Promise<ScrapedData> {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ acceptDownloads: true });
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Scraping timeout')),
            SCRAPER_TIMEOUT_MS,
          );
        });

        const scrapingPromise = async () => {
          this.logger.log(
            { bankId: strategy.name, startUrl: strategy.startUrl },
            'Starting scraper session',
          );
          await page.goto(strategy.startUrl);
          await page.waitForLoadState('networkidle');
          return strategy.scrape(credentials, page, this.logger);
        };

        return await Promise.race([scrapingPromise(), timeoutPromise]);
      } finally {
        await page.close();
      }
    } catch (error) {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Scraper execution failed',
      );
      throw error;
    } finally {
      await browser.close();
    }
  }

  private mapScrapedDataToAccounts(
    scrapedData: ScrapedData,
    bankId: string,
    strategy: ScraperStrategy,
  ): APIAccount[] {
    const accounts: APIAccount[] = [];

    for (const [accountName, accountData] of Object.entries(scrapedData)) {
      if (!this.isScrapedAccountData(accountData)) {
        this.logger.warn(
          { bankId, accountName },
          'Skipping invalid scraped account data',
        );
        continue;
      }

      const balanceValue = accountData.totalBalance;
      if (!Number.isFinite(balanceValue)) {
        this.logger.warn(
          { bankId, accountName, balanceValue },
          'Skipping account with invalid balance',
        );
        continue;
      }

      const sign =
        balanceValue >= 0 ? MoneySign.POSITIVE : MoneySign.NEGATIVE;
      const balance = MoneyWithSign.fromFloat(
        strategy.defaultCurrency,
        balanceValue,
        sign,
      );

      const accountType =
        accountData.type === 'credit_card'
          ? AccountType.Credit
          : AccountType.Depository;

      accounts.push({
        accountId: `scraper:${bankId}:${accountName}`,
        name: accountName,
        mask: null,
        type: accountType,
        subType:
          accountData.type === 'credit_card'
            ? AccountSubtype.CreditCard
            : null,
        availableBalance: balance.toSerialized(),
        currentBalance: balance.toSerialized(),
      });
    }

    return accounts;
  }

  private isScrapedAccountData(
    value: unknown,
  ): value is ScrapedAccountData {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const record = value as ScrapedAccountData;
    return (
      typeof record.totalBalance === 'number' &&
      (record.type === 'savings_or_checking' || record.type === 'credit_card')
    );
  }
}
