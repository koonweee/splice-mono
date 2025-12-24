import type { Logger } from '@nestjs/common';
import type { Page } from 'playwright';
import type { ScrapedData } from '../scraper.types';

export interface ScraperStrategy<Credentials = unknown> {
  name: string;
  startUrl: string;
  defaultCurrency: string;
  institution?: {
    id?: string | null;
    name?: string | null;
  };
  scrape(
    credentials: Credentials,
    page: Page,
    logger: Logger,
  ): Promise<ScrapedData>;
}
