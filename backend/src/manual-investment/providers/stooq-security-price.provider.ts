import { Injectable, Logger } from '@nestjs/common';
import dayjs from 'dayjs';
import type {
  SecurityPricePoint,
  SecurityPriceProvider,
} from './security-price-provider.interface';

@Injectable()
export class StooqSecurityPriceProvider implements SecurityPriceProvider {
  readonly providerName = 'stooq';

  private readonly logger = new Logger(StooqSecurityPriceProvider.name);
  private readonly baseUrl = 'https://stooq.com/q/d/l/';

  async getHistoricalPrices(
    providerSymbol: string,
    startDate: string,
    endDate: string,
  ): Promise<SecurityPricePoint[]> {
    const url = `${this.baseUrl}?s=${providerSymbol}&i=d`;

    this.logger.log({ providerSymbol, startDate, endDate }, 'Fetching security prices');

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch prices for ${providerSymbol}: ${response.status} ${response.statusText}`,
      );
    }

    const csv = await response.text();
    const lines = csv.trim().split('\n');
    if (lines.length <= 1) {
      throw new Error(`No price history available for ${providerSymbol}`);
    }

    const normalizedStart = dayjs(startDate).subtract(10, 'day').format('YYYY-MM-DD');
    const normalizedEnd = dayjs(endDate).format('YYYY-MM-DD');

    const prices: SecurityPricePoint[] = [];

    lines.slice(1).forEach((line) => {
      const [date, , , , close] = line.split(',');
      if (!date || !close || close === 'N/D') {
        return;
      }
      if (date < normalizedStart || date > normalizedEnd) {
        return;
      }

      const parsedClose = parseFloat(close);
      if (Number.isNaN(parsedClose)) {
        return;
      }

      prices.push({
        date,
        closePrice: parsedClose,
        priceCurrency: 'USD',
      });
    });

    if (prices.length === 0) {
      throw new Error(`No prices returned for ${providerSymbol} in requested range`);
    }

    return prices;
  }
}
