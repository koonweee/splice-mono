import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InvestmentSecurityEntity } from '../investment/investment-security.entity';
import type {
  MarketPriceQuote,
  MarketSecurityQuoteType,
  MarketSecuritySearchResult,
  ResolvedMarketPrices,
} from '../types/MarketPrice';
import { MarketPriceQuoteSchema } from '../types/MarketPrice';
import {
  MARKET_PRICE_PROVIDER,
  type MarketPriceProvider,
} from './market-price-provider.interface';

function isSupportedQuoteType(
  value: string | null,
): value is MarketSecurityQuoteType {
  return value === 'EQUITY' || value === 'ETF';
}

@Injectable()
export class MarketPriceService {
  private readonly logger = new Logger(MarketPriceService.name);

  constructor(
    @Inject(MARKET_PRICE_PROVIDER)
    private readonly provider: MarketPriceProvider,
    @InjectRepository(InvestmentSecurityEntity)
    private readonly securityRepository: Repository<InvestmentSecurityEntity>,
  ) {}

  search(query: string, limit: number): Promise<MarketSecuritySearchResult[]> {
    return this.provider.search(query, limit);
  }

  async resolveQuotes(
    userId: string,
    symbols: string[],
  ): Promise<ResolvedMarketPrices> {
    const uniqueSymbols = Array.from(
      new Set(symbols.map((symbol) => symbol.trim().toUpperCase())),
    );
    if (uniqueSymbols.length === 0) {
      return {
        quotes: new Map(),
        staleSymbols: [],
        missingSymbols: [],
      };
    }

    const providerQuotes = await this.fetchFreshQuotes(uniqueSymbols, userId);
    const freshQuotes = this.validateFreshQuotes(providerQuotes, uniqueSymbols);

    return this.resolveWithCache(userId, uniqueSymbols, freshQuotes);
  }

  async resolveQuotesForUsers(
    requests: Map<string, string[]>,
  ): Promise<Map<string, ResolvedMarketPrices>> {
    const allSymbols = Array.from(
      new Set(
        Array.from(requests.values()).flatMap((symbols) =>
          symbols.map((symbol) => symbol.trim().toUpperCase()),
        ),
      ),
    );
    const providerQuotes = await this.fetchFreshQuotes(allSymbols);
    const freshQuotes = this.validateFreshQuotes(providerQuotes, allSymbols);
    const results = new Map<string, ResolvedMarketPrices>();
    for (const [userId, symbols] of requests) {
      const uniqueSymbols = Array.from(
        new Set(symbols.map((symbol) => symbol.trim().toUpperCase())),
      );
      results.set(
        userId,
        await this.resolveWithCache(userId, uniqueSymbols, freshQuotes),
      );
    }
    return results;
  }

  private async fetchFreshQuotes(
    symbols: string[],
    userId?: string,
  ): Promise<Map<string, MarketPriceQuote>> {
    let freshQuotes = new Map<string, MarketPriceQuote>();
    try {
      freshQuotes = await this.provider.getQuotes(symbols);
    } catch (error) {
      this.logger.warn(
        {
          userId,
          symbolCount: symbols.length,
          error: error instanceof Error ? error.message : String(error),
        },
        'Market quote refresh failed; checking last-good cache',
      );
    }
    return freshQuotes;
  }

  private async resolveWithCache(
    userId: string,
    uniqueSymbols: string[],
    freshQuotes: Map<string, MarketPriceQuote>,
  ): Promise<ResolvedMarketPrices> {
    const unresolved = uniqueSymbols.filter(
      (symbol) => !freshQuotes.has(symbol),
    );
    const cached =
      unresolved.length === 0
        ? []
        : await this.securityRepository.find({
            where: {
              userId,
              provider: 'yahoo',
              externalSecurityId: In(unresolved),
            },
          });

    const quotes = new Map(freshQuotes);
    const staleSymbols: string[] = [];
    for (const security of cached) {
      const quote = this.cachedSecurityToQuote(security);
      if (!quote) continue;
      quotes.set(quote.symbol, quote);
      staleSymbols.push(quote.symbol);
    }

    const missingSymbols = uniqueSymbols.filter(
      (symbol) => !quotes.has(symbol),
    );
    this.logger.log(
      {
        userId,
        symbolCount: uniqueSymbols.length,
        freshCount: uniqueSymbols.filter((symbol) => freshQuotes.has(symbol))
          .length,
        staleCount: staleSymbols.length,
        failedCount: missingSymbols.length,
      },
      'Resolved market prices',
    );
    return {
      quotes,
      staleSymbols,
      missingSymbols,
    };
  }

  private validateFreshQuotes(
    providerQuotes: Map<string, MarketPriceQuote>,
    requestedSymbols: string[],
  ): Map<string, MarketPriceQuote> {
    const requested = new Set(requestedSymbols);
    const validated = new Map<string, MarketPriceQuote>();
    for (const rawQuote of providerQuotes.values()) {
      const parsed = MarketPriceQuoteSchema.safeParse(rawQuote);
      if (!parsed.success) continue;
      const symbol = parsed.data.symbol.toUpperCase();
      if (!requested.has(symbol)) continue;
      validated.set(symbol, { ...parsed.data, symbol });
    }
    return validated;
  }

  private cachedSecurityToQuote(
    security: InvestmentSecurityEntity,
  ): MarketPriceQuote | null {
    if (
      !security.closePrice ||
      !security.closePriceAsOf ||
      !security.updateDatetime ||
      !security.isoCurrencyCode ||
      !isSupportedQuoteType(security.type)
    ) {
      return null;
    }
    const candidate = {
      symbol: security.externalSecurityId.toUpperCase(),
      name: security.name ?? security.externalSecurityId,
      quoteType: security.type,
      exchangeCode: security.institutionId ?? '',
      exchangeName: security.institutionSecurityId ?? '',
      currency: security.isoCurrencyCode,
      marketIdentifierCode: security.marketIdentifierCode,
      price: security.closePrice,
      priceAsOf: security.closePriceAsOf,
      priceDatetime: security.updateDatetime,
    };
    const parsed = MarketPriceQuoteSchema.safeParse(candidate);
    return parsed.success ? parsed.data : null;
  }
}
