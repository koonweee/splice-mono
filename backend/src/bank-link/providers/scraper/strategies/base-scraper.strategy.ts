import type { Logger } from '@nestjs/common';
import type { Page } from 'playwright';
import type { APIAccount, Institution } from '../../../../types/BankLink';
import type { ScraperStrategy } from './scraper-strategy.interface';

export abstract class BaseScraperStrategy<Credentials>
  implements ScraperStrategy<Credentials>
{
  abstract name: string;
  abstract startUrl: string;
  institution?: Institution;

  protected async screenshotStep(
    page: Page,
    stepName: string,
    logger: Logger,
  ): Promise<void> {
    const enableScreenshots = process.env.SCRAPER_SCREENSHOTS === 'true';
    if (!enableScreenshots) {
      logger.debug({ stepName }, 'Skipping scraper screenshot');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({
      path: `scraper-screenshots/${timestamp}-${stepName}.png`,
      fullPage: true,
    });
    logger.debug({ stepName }, 'Captured scraper screenshot');
  }

  abstract scrape(
    credentials: Credentials,
    page: Page,
    logger: Logger,
  ): Promise<{ accounts: APIAccount[]; institution?: Institution }>;
}
