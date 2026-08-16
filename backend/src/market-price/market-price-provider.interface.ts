import type {
  MarketPriceQuote,
  MarketSecuritySearchResult,
} from '../types/MarketPrice';

export const MARKET_PRICE_PROVIDER = Symbol('MARKET_PRICE_PROVIDER');

export interface MarketPriceProvider {
  search(query: string, limit: number): Promise<MarketSecuritySearchResult[]>;
  getQuotes(symbols: string[]): Promise<Map<string, MarketPriceQuote>>;
}
