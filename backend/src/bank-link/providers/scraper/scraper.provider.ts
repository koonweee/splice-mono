import { Inject, Injectable, Logger } from '@nestjs/common';
import { chromium } from 'playwright';
import type {
  APIAccount,
  GetAccountsResponse,
  Institution,
  LinkInitiationResponse,
} from '../../../types/BankLink';
import type { IBankLinkProvider } from '../bank-link-provider.interface';
import { ScraperAuthenticationSchema } from './scraper.types';
import type { ScraperStrategy } from './strategies/scraper-strategy.interface';

const SCRAPER_TIMEOUT_MS = 420000;
const DEFAULT_SCRAPER_BANK_ID = 'dbs';

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

  async initiateLinking(input: {
    userId: string;
    redirectUri?: string;
    providerUserDetails?: Record<string, unknown>;
  }): Promise<LinkInitiationResponse> {
    void input;
    const username = process.env.DBS_USER ?? '';
    const password = process.env.DBS_PASS ?? '';

    if (!username || !password) {
      throw new Error('Missing DBS_USER or DBS_PASS for scraper linking');
    }

    this.logger.log({}, 'Initiating scraper link with DBS credentials');

    const strategy = this.strategies.get(DEFAULT_SCRAPER_BANK_ID);
    if (!strategy) {
      throw new Error(
        `No scraper strategy found for bankId: ${DEFAULT_SCRAPER_BANK_ID}`,
      );
    }

    const { accounts, institution } = await this.scrapeWithStrategy(strategy, {
      username,
      password,
    });

    return {
      immediateAccounts: [
        {
          authentication: {
            bankId: DEFAULT_SCRAPER_BANK_ID,
            username,
            password,
          },
          accounts,
          institution: institution ?? strategy.institution,
        },
      ],
    };
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

    const { accounts, institution } = await this.scrapeWithStrategy(strategy, {
      username,
      password,
    });

    const resolvedInstitution: Institution = institution ??
      strategy.institution ?? { id: bankId, name: bankId };

    return { accounts, institution: resolvedInstitution };
  }

  verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<boolean> {
    void rawBody;
    void headers;
    return Promise.resolve(false);
  }

  private async scrapeWithStrategy(
    strategy: ScraperStrategy,
    credentials: Record<string, string>,
  ): Promise<{ accounts: APIAccount[]; institution?: Institution }> {
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
}
