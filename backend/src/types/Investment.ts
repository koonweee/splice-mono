import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { OwnedSchema } from './Timestamps';

export const InvestmentProviderSchema = z.enum(['plaid']);
export type InvestmentProvider = z.infer<typeof InvestmentProviderSchema>;

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

const NullableDecimalStringSchema = z.string().nullable();

export const InvestmentSecuritySchema = registerSchema(
  'InvestmentSecurity',
  z
    .object({
      id: z.string().uuid(),
      provider: InvestmentProviderSchema,
      externalSecurityId: z.string(),
      institutionId: z.string().nullable(),
      institutionSecurityId: z.string().nullable(),
      name: z.string().nullable(),
      tickerSymbol: z.string().nullable(),
      isin: z.string().nullable(),
      cusip: z.string().nullable(),
      sedol: z.string().nullable(),
      type: z.string().nullable(),
      subtype: z.string().nullable(),
      isCashEquivalent: z.boolean().nullable(),
      closePrice: NullableDecimalStringSchema,
      closePriceAsOf: z.string().nullable(),
      updateDatetime: z.string().nullable(),
      isoCurrencyCode: z.string().nullable(),
      unofficialCurrencyCode: z.string().nullable(),
      marketIdentifierCode: z.string().nullable(),
      sector: z.string().nullable(),
      industry: z.string().nullable(),
    })
    .merge(OwnedSchema),
);

export type InvestmentSecurity = z.infer<typeof InvestmentSecuritySchema>;

export const InvestmentHoldingSnapshotSchema = registerSchema(
  'InvestmentHoldingSnapshot',
  z
    .object({
      id: z.string().uuid(),
      accountId: z.string().uuid(),
      securityId: z.string().uuid(),
      provider: InvestmentProviderSchema,
      snapshotDate: DateStringSchema,
      quantity: NullableDecimalStringSchema,
      costBasis: NullableDecimalStringSchema,
      institutionPrice: NullableDecimalStringSchema,
      institutionPriceAsOf: z.string().nullable(),
      institutionPriceDatetime: z.string().nullable(),
      institutionValue: NullableDecimalStringSchema,
      isoCurrencyCode: z.string().nullable(),
      unofficialCurrencyCode: z.string().nullable(),
      vestedQuantity: NullableDecimalStringSchema,
      vestedValue: NullableDecimalStringSchema,
      security: InvestmentSecuritySchema,
    })
    .merge(OwnedSchema),
);

export type InvestmentHoldingSnapshot = z.infer<
  typeof InvestmentHoldingSnapshotSchema
>;

export const InvestmentHoldingsResponseSchema = registerSchema(
  'InvestmentHoldingsResponse',
  z.object({
    accountId: z.string().uuid(),
    snapshotDate: DateStringSchema.nullable(),
    holdings: z.array(InvestmentHoldingSnapshotSchema),
  }),
);

export type InvestmentHoldingsResponse = z.infer<
  typeof InvestmentHoldingsResponseSchema
>;

export const InvestmentHoldingsDateQuerySchema = registerSchema(
  'InvestmentHoldingsDateQuery',
  z.object({
    snapshotDate: DateStringSchema,
  }),
);

export type InvestmentHoldingsDateQuery = z.infer<
  typeof InvestmentHoldingsDateQuerySchema
>;

export type ProviderInvestmentSecurity = {
  externalSecurityId: string;
  institutionId: string | null;
  institutionSecurityId: string | null;
  name: string | null;
  tickerSymbol: string | null;
  isin: string | null;
  cusip: string | null;
  sedol: string | null;
  type: string | null;
  subtype: string | null;
  isCashEquivalent: boolean | null;
  closePrice: string | null;
  closePriceAsOf: string | null;
  updateDatetime: string | null;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
  marketIdentifierCode: string | null;
  sector: string | null;
  industry: string | null;
};

export type ProviderInvestmentHolding = {
  externalAccountId: string;
  externalSecurityId: string;
  quantity: string | null;
  costBasis: string | null;
  institutionPrice: string | null;
  institutionPriceAsOf: string | null;
  institutionPriceDatetime: string | null;
  institutionValue: string | null;
  isoCurrencyCode: string | null;
  unofficialCurrencyCode: string | null;
  vestedQuantity: string | null;
  vestedValue: string | null;
};

export type ProviderInvestmentHoldingsResponse = {
  externalAccountIds: string[];
  securities: ProviderInvestmentSecurity[];
  holdings: ProviderInvestmentHolding[];
};

export type InvestmentHoldingsSyncResult = {
  accounts: number;
  securities: number;
  holdings: number;
  deletedStaleHoldings: number;
};
