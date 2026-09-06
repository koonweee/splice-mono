import { z } from 'zod';
import { CalendarDateSchema } from '../common/query-bounds';
import { registerSchema } from '../common/zod-api-response';
import {
  MoneyWithSignSchema,
  type SerializedMoneyWithSign,
} from './MoneyWithSign';
import { AccountSchema } from './Account';
import { OwnedSchema } from './Timestamps';

export const InvestmentSecurityProviderSchema = z.enum(['plaid', 'yahoo']);
export type InvestmentSecurityProvider = z.infer<
  typeof InvestmentSecurityProviderSchema
>;
export const InvestmentHoldingProviderSchema = z.enum(['plaid', 'manual']);
export type InvestmentHoldingProvider = z.infer<
  typeof InvestmentHoldingProviderSchema
>;
export const InvestmentActivityProviderSchema = z.literal('plaid');
export type InvestmentActivityProvider = z.infer<
  typeof InvestmentActivityProviderSchema
>;

export const DateStringSchema = CalendarDateSchema;

const NullableDecimalStringSchema = z.string().nullable();
const ProviderJsonObjectSchema = z.record(z.string(), z.unknown());

export const InvestmentSecuritySchema = registerSchema(
  'InvestmentSecurity',
  z
    .object({
      id: z.string().uuid(),
      provider: InvestmentSecurityProviderSchema,
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
      provider: InvestmentHoldingProviderSchema,
      snapshotDate: DateStringSchema,
      quantity: NullableDecimalStringSchema,
      costBasis: NullableDecimalStringSchema,
      institutionPrice: NullableDecimalStringSchema,
      institutionPriceAsOf: z.string().nullable(),
      institutionPriceDatetime: z.string().nullable(),
      institutionValue: NullableDecimalStringSchema,
      isoCurrencyCode: z.string().nullable(),
      unofficialCurrencyCode: z.string().nullable(),
      accountCurrency: z.string().nullable(),
      exchangeRateToAccountCurrency: NullableDecimalStringSchema,
      accountValue: NullableDecimalStringSchema,
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
    provider: InvestmentActivityProviderSchema,
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
    accountCurrency: z.string().nullable(),
    accountValue: MoneyWithSignSchema.nullable(),
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

const CurrencyCodeSchema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'Must be an uppercase ISO 4217 currency code');

export const ManualBrokeragePositionInputSchema = registerSchema(
  'ManualBrokeragePositionInput',
  z.object({
    symbol: z.string().trim().min(1).max(32),
    quantity: z
      .string()
      .regex(
        /^(?:0|[1-9]\d{0,17})(?:\.\d{1,12})?$/,
        'Must have at most 18 integer and 12 fractional digits',
      )
      .refine((value) => /[1-9]/.test(value), 'Must be greater than zero'),
  }),
);
export type ManualBrokeragePositionInput = z.infer<
  typeof ManualBrokeragePositionInputSchema
>;

export const CreateManualBrokerageAccountDtoSchema = registerSchema(
  'CreateManualBrokerageAccountDto',
  z
    .object({
      name: z.string().trim().min(1),
      customName: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      accountCurrency: CurrencyCodeSchema,
      positions: z.array(ManualBrokeragePositionInputSchema).min(1),
    })
    .strict(),
);
export type CreateManualBrokerageAccountDto = z.infer<
  typeof CreateManualBrokerageAccountDtoSchema
>;

export const ReplaceManualBrokerageHoldingsDtoSchema = registerSchema(
  'ReplaceManualBrokerageHoldingsDto',
  z.object({ positions: z.array(ManualBrokeragePositionInputSchema) }).strict(),
);
export type ReplaceManualBrokerageHoldingsDto = z.infer<
  typeof ReplaceManualBrokerageHoldingsDtoSchema
>;

export const ManualBrokeragePortfolioResponseSchema = registerSchema(
  'ManualBrokeragePortfolioResponse',
  z.object({
    account: AccountSchema,
    snapshot: InvestmentHoldingsResponseSchema,
    staleSymbols: z.array(z.string()),
  }),
);
export type ManualBrokeragePortfolioResponse = z.infer<
  typeof ManualBrokeragePortfolioResponseSchema
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
