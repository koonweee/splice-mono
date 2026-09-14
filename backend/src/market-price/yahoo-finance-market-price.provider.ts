import { ExactDecimal } from '../common/exact-money';
import { assertDateRange } from '../common/query-bounds';
import { Injectable, Logger } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';
import { z } from 'zod';
import type {
  MarketPriceQuote,
  MarketSecurityQuoteType,
  MarketSecuritySearchResult,
} from '../types/MarketPrice';
import { MarketPriceQuoteSchema } from '../types/MarketPrice';
import type {
  HistoricalMarketPrices,
  MarketPriceProvider,
} from './market-price-provider.interface';

const SUPPORTED_QUOTE_TYPES = new Set(['EQUITY', 'ETF']);
const EXCHANGE_TO_MIC: Record<string, string> = {
  NMS: 'XNAS',
  NGM: 'XNAS',
  NCM: 'XNAS',
  NYQ: 'XNYS',
  ASE: 'XASE',
  SES: 'XSES',
  SGX: 'XSES',
};

const YahooQuoteSchema = z.object({
  symbol: z.string(),
  quoteType: z.string(),
  regularMarketPrice: z.number().positive().optional(),
  regularMarketTime: z.coerce.date().optional(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  exchange: z.string(),
  fullExchangeName: z.string().optional(),
  longName: z.string().optional(),
  shortName: z.string().optional(),
  displayName: z.string().optional(),
});

function isSupportedQuoteType(value: string): value is MarketSecurityQuoteType {
  return value === 'EQUITY' || value === 'ETF';
}

@Injectable()
export class YahooFinanceMarketPriceProvider implements MarketPriceProvider {
  private readonly logger = new Logger(YahooFinanceMarketPriceProvider.name);
  private readonly client = new YahooFinance({
    queue: { concurrency: 2 },
    quoteCombine: { maxSymbolsPerRequest: 50 },
    suppressNotices: ['yahooSurvey'],
    versionCheck: false,
    fetch: (input: string | URL | Request, init?: RequestInit) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  });

  async getHistoricalPrices(
    symbol: string,
    startDate: string,
    endDate: string,
  ): Promise<HistoricalMarketPrices> {
    assertDateRange(startDate, endDate, { maxDays: 366 });
    // Yahoo period2 is exclusive. Include a UTC day buffer then filter exchange-local dates.
    const period1 = new Date(`${startDate}T00:00:00Z`);
    period1.setUTCDate(period1.getUTCDate() - 1);
    const period2 = new Date(`${endDate}T00:00:00Z`);
    period2.setUTCDate(period2.getUTCDate() + 2);
    const response = await this.client.chart(symbol, {
      period1,
      period2,
      interval: '1d',
      events: 'div,splits',
      return: 'array',
    });
    if (response.meta.symbol.toUpperCase() !== symbol.toUpperCase())
      throw new Error('Historical price provider returned a different symbol');
    const currency = z
      .string()
      .regex(/^[A-Z]{3}$/)
      .parse(response.meta.currency);
    const timezone = z
      .string()
      .trim()
      .min(1)
      .parse(response.meta.exchangeTimezoneName);
    const prices = response.quotes.flatMap((quote) => {
      if (
        quote.close === null ||
        !Number.isFinite(quote.close) ||
        quote.close <= 0
      )
        return [];
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(quote.date);
      if (date < startDate || date > endDate) return [];
      return [
        {
          date,
          priceDatetime: quote.date.toISOString(),
          close: new ExactDecimal(String(quote.close)).toFixed(),
          adjustedClose:
            quote.adjclose !== undefined &&
            quote.adjclose !== null &&
            Number.isFinite(quote.adjclose) &&
            quote.adjclose > 0
              ? new ExactDecimal(String(quote.adjclose)).toFixed()
              : null,
        },
      ];
    });
    return {
      symbol: response.meta.symbol,
      currency,
      exchange: response.meta.exchangeName,
      exchangeTimezone: timezone,
      prices,
      corporateActionsPresent:
        !!response.events &&
        Object.values(response.events).some(
          (events) => Array.isArray(events) && events.length > 0,
        ),
    };
  }

  async search(
    query: string,
    limit: number,
  ): Promise<MarketSecuritySearchResult[]> {
    const response = await this.client.search(query, {
      quotesCount: Math.min(limit * 2, 40),
      newsCount: 0,
      enableFuzzyQuery: true,
    });
    const candidates: string[] = [];
    for (const quote of response.quotes) {
      if (!quote.isYahooFinance || !('quoteType' in quote)) continue;
      if (!SUPPORTED_QUOTE_TYPES.has(String(quote.quoteType))) continue;
      candidates.push(quote.symbol);
      if (candidates.length === limit) break;
    }
    if (candidates.length === 0) return [];

    const quotes = await this.getQuotes(candidates);
    return candidates
      .map((symbol) => quotes.get(symbol.toUpperCase()))
      .filter((quote): quote is MarketPriceQuote => !!quote)
      .map((quote) => ({
        symbol: quote.symbol,
        name: quote.name,
        quoteType: quote.quoteType,
        exchangeCode: quote.exchangeCode,
        exchangeName: quote.exchangeName,
        currency: quote.currency,
        marketIdentifierCode: quote.marketIdentifierCode,
      }));
  }

  async getQuotes(symbols: string[]): Promise<Map<string, MarketPriceQuote>> {
    if (symbols.length === 0) return new Map();
    try {
      const rawResponse: unknown = await this.client.quote(symbols);
      const response = z
        .array(z.unknown())
        .parse(rawResponse)
        .flatMap((rawQuote) => {
          const parsed = YahooQuoteSchema.safeParse(rawQuote);
          return parsed.success ? [parsed.data] : [];
        });
      const quotes = new Map<string, MarketPriceQuote>();
      for (const raw of response) {
        if (!isSupportedQuoteType(raw.quoteType)) continue;
        if (
          raw.regularMarketPrice === undefined ||
          !Number.isFinite(raw.regularMarketPrice) ||
          raw.regularMarketPrice <= 0 ||
          !raw.currency ||
          !raw.regularMarketTime
        ) {
          continue;
        }
        const timestamp = raw.regularMarketTime;
        const quote = MarketPriceQuoteSchema.parse({
          symbol: raw.symbol.toUpperCase(),
          name: raw.longName ?? raw.shortName ?? raw.displayName ?? raw.symbol,
          quoteType: raw.quoteType,
          exchangeCode: raw.exchange,
          exchangeName: raw.fullExchangeName ?? raw.exchange,
          currency: raw.currency,
          marketIdentifierCode: EXCHANGE_TO_MIC[raw.exchange] ?? null,
          price: String(raw.regularMarketPrice),
          priceAsOf: timestamp.toISOString().slice(0, 10),
          priceDatetime: timestamp.toISOString(),
        });
        quotes.set(quote.symbol, quote);
      }
      return quotes;
    } catch (error) {
      this.logger.warn(
        {
          symbolCount: symbols.length,
          error: error instanceof Error ? error.message : String(error),
        },
        'Yahoo market quote request failed',
      );
      throw error;
    }
  }
}
