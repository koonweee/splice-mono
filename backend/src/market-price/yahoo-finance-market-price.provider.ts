import { Injectable, Logger } from '@nestjs/common';
import YahooFinance from 'yahoo-finance2';
import { z } from 'zod';
import type {
  MarketPriceQuote,
  MarketSecurityQuoteType,
  MarketSecuritySearchResult,
} from '../types/MarketPrice';
import { MarketPriceQuoteSchema } from '../types/MarketPrice';
import type { MarketPriceProvider } from './market-price-provider.interface';

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
    queue: { concurrency: 2, interval: 250 },
    quoteCombine: { maxSymbolsPerRequest: 50 },
    suppressNotices: ['yahooSurvey'],
    versionCheck: false,
    fetch: (input: string | URL | Request, init?: RequestInit) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
  });

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
