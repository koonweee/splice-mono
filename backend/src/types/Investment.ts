import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import {
  MoneyWithSignSchema,
  type SerializedMoneyWithSign,
} from './MoneyWithSign';
import { OwnedSchema } from './Timestamps';

export const InvestmentProviderSchema = z.enum(['plaid']);
export type InvestmentProvider = z.infer<typeof InvestmentProviderSchema>;

export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');

const NullableDecimalStringSchema = z.string().nullable();
const ProviderJsonObjectSchema = z.record(z.string(), z.unknown());

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

export const InvestmentTransactionSchema = registerSchema(
  'InvestmentTransaction',
  z
    .object({
      id: z.string().uuid(),
      activityId: z.string().uuid(),
      securityId: z.string().uuid().nullable(),
      externalSecurityId: z.string().nullable(),
      name: z.string(),
      quantity: z.string(),
      price: z.string(),
      fees: NullableDecimalStringSchema,
      investmentType: z.string(),
      investmentSubtype: z.string(),
      cancelExternalActivityId: z.string().nullable(),
      providerPayload: ProviderJsonObjectSchema.nullable(),
    })
    .merge(OwnedSchema),
);

export type InvestmentTransaction = z.infer<typeof InvestmentTransactionSchema>;

export const InvestmentActivitySchema = registerSchema(
  'InvestmentActivity',
  z.object({
    id: z.string().uuid(),
    activityId: z.string().uuid(),
    accountId: z.string().uuid(),
    accountName: z.string().nullable(),
    provider: InvestmentProviderSchema,
    externalActivityId: z.string().nullable(),
    activityDate: DateStringSchema,
    providerDate: DateStringSchema,
    providerDatetime: z.string().datetime().nullable(),
    amount: MoneyWithSignSchema,
    security: InvestmentSecuritySchema.nullable(),
    externalSecurityId: z.string().nullable(),
    name: z.string(),
    providerDescription: z.string(),
    quantity: z.string(),
    price: z.string(),
    fees: NullableDecimalStringSchema,
    investmentType: z.string(),
    investmentSubtype: z.string(),
    cancelExternalActivityId: z.string().nullable(),
  }),
);

export type InvestmentActivity = z.infer<typeof InvestmentActivitySchema>;

export const PaginatedInvestmentActivityResponseSchema = registerSchema(
  'PaginatedInvestmentActivityResponse',
  z.object({
    data: z.array(InvestmentActivitySchema),
    total: z.number().int(),
    pageIndex: z.number().int(),
    pageSize: z.number().int(),
  }),
);

export type PaginatedInvestmentActivityResponse = z.infer<
  typeof PaginatedInvestmentActivityResponseSchema
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

export type ProviderInvestmentTransaction = {
  externalActivityId: string;
  externalAccountId: string;
  externalSecurityId: string | null;
  providerDate: string;
  providerDatetime: string | null;
  name: string;
  quantity: string;
  amount: SerializedMoneyWithSign;
  price: string;
  fees: string | null;
  investmentType: string;
  investmentSubtype: string;
  cancelExternalActivityId: string | null;
  providerPayload: Record<string, unknown>;
};

export type ProviderInvestmentTransactionsResponse = {
  externalAccountIds: string[];
  securities: ProviderInvestmentSecurity[];
  transactions: ProviderInvestmentTransaction[];
  startDate: string;
  endDate: string;
};

export type InvestmentTransactionsSyncResult = {
  accounts: number;
  securities: number;
  transactions: number;
  skippedMissingAccount: number;
};

export const InvestmentActivityQuerySchema = registerSchema(
  'InvestmentActivityQuery',
  z.object({
    accountId: z.string().uuid().optional(),
    startDate: DateStringSchema.optional(),
    endDate: DateStringSchema.optional(),
    type: z.string().optional(),
    subtype: z.string().optional(),
    pageIndex: z.coerce.number().int().min(0).default(0),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
);

export type InvestmentActivityQuery = z.infer<
  typeof InvestmentActivityQuerySchema
>;
