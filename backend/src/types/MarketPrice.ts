import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';

export const MarketSecurityQuoteTypeSchema = z.enum(['EQUITY', 'ETF']);
export type MarketSecurityQuoteType = z.infer<
  typeof MarketSecurityQuoteTypeSchema
>;

export const MarketSecuritySearchResultSchema = registerSchema(
  'MarketSecuritySearchResult',
  z.object({
    symbol: z.string(),
    name: z.string(),
    quoteType: MarketSecurityQuoteTypeSchema,
    exchangeCode: z.string(),
    exchangeName: z.string(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    marketIdentifierCode: z.string().nullable(),
  }),
);
export type MarketSecuritySearchResult = z.infer<
  typeof MarketSecuritySearchResultSchema
>;

export const MarketSecuritySearchQuerySchema = registerSchema(
  'MarketSecuritySearchQuery',
  z.object({
    query: z.string().trim().min(2).max(100),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  }),
);
export type MarketSecuritySearchQuery = z.infer<
  typeof MarketSecuritySearchQuerySchema
>;

export const MarketPriceQuoteSchema = z.object({
  symbol: z.string().trim().min(1),
  name: z.string().trim().min(1),
  quoteType: MarketSecurityQuoteTypeSchema,
  exchangeCode: z.string().trim().min(1),
  exchangeName: z.string().trim().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
  marketIdentifierCode: z.string().nullable(),
  price: z
    .string()
    .regex(/^\d+(?:\.\d+)?$/, 'Must be a positive decimal')
    .refine((value) => /[1-9]/.test(value), 'Must be greater than zero'),
  priceAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priceDatetime: z.string().datetime(),
});
export type MarketPriceQuote = z.infer<typeof MarketPriceQuoteSchema>;

export type ResolvedMarketPrices = {
  quotes: Map<string, MarketPriceQuote>;
  staleSymbols: string[];
  missingSymbols: string[];
};
