import type {
  MarketPriceQuote,
  MarketSecuritySearchResult,
} from '../types/MarketPrice';

export const MARKET_PRICE_PROVIDER = Symbol('MARKET_PRICE_PROVIDER');

export type HistoricalMarketPrice = {
  date: string;
  priceDatetime: string;
  close: string;
  adjustedClose: string | null;
};
export type HistoricalMarketPrices = {
  symbol: string;
  currency: string;
  exchange: string;
  exchangeTimezone: string;
  prices: HistoricalMarketPrice[];
  corporateActionsPresent: boolean;
};

export interface MarketPriceProvider {
  search(query: string, limit: number): Promise<MarketSecuritySearchResult[]>;
  getQuotes(symbols: string[]): Promise<Map<string, MarketPriceQuote>>;
  getHistoricalPrices?(
    symbol: string,
    startDate: string,
    endDate: string,
  ): Promise<HistoricalMarketPrices>;
}
