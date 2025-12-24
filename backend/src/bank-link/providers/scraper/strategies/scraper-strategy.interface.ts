import type { Logger } from '@nestjs/common';
import type { Page } from 'playwright';
import type { APIAccount, Institution } from '../../../../types/BankLink';

export interface ScraperStrategy<Credentials = unknown> {
  name: string;
  startUrl: string;
  institution?: Institution;
  scrape(
    credentials: Credentials,
    page: Page,
    logger: Logger,
  ): Promise<{ accounts: APIAccount[]; institution?: Institution }>;
}
