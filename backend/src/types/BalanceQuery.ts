import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { AccountSchema } from './Account';
import { MoneyWithSignSchema } from './MoneyWithSign';

/**
 * Source of an exchange rate value
 */
export const RateSourceSchema = z.enum(['DB', 'FILLED']);
export type RateSource = z.infer<typeof RateSourceSchema>;

/**
 * Exchange rate with source indicator (for API responses)
 */
export const RateWithSourceSchema = registerSchema(
  'RateWithSource',
  z.object({
    baseCurrency: z.string(),
    targetCurrency: z.string(),
    rate: z.number(),
    source: RateSourceSchema,
  }),
);
export type RateWithSource = z.infer<typeof RateWithSourceSchema>;

/**
 * Balance with optional converted balance and exchange rate info
 */
export const BalanceWithConvertedBalanceSchema = registerSchema(
  'BalanceWithConvertedBalance',
  z.object({
    balance: MoneyWithSignSchema,
    convertedBalance: MoneyWithSignSchema.optional(),
    exchangeRate: RateWithSourceSchema.optional(),
  }),
);
export type BalanceWithConvertedBalance = z.infer<
  typeof BalanceWithConvertedBalanceSchema
>;

/**
 * Balance result for a single account on a single date
 */
export const AccountBalanceResultSchema = registerSchema(
  'AccountBalanceResult',
  z.object({
    account: AccountSchema,
    availableBalance: BalanceWithConvertedBalanceSchema,
    currentBalance: BalanceWithConvertedBalanceSchema,
    effectiveBalance: BalanceWithConvertedBalanceSchema,
    syncedAt: z.date().optional(),
  }),
);
export type AccountBalanceResult = z.infer<typeof AccountBalanceResultSchema>;

/**
 * Result for a single date containing balances for all requested accounts
 */
export const BalanceQueryPerDateResultSchema = registerSchema(
  'BalanceQueryPerDateResult',
  z.object({
    date: z.string(),
    balances: z.record(z.string(), AccountBalanceResultSchema),
  }),
);
export type BalanceQueryPerDateResult = z.infer<
  typeof BalanceQueryPerDateResultSchema
>;

/**
 * Request DTO for snapshot balances endpoint (internal use)
 */
export const SnapshotBalancesRequestSchema = registerSchema(
  'SnapshotBalancesRequest',
  z.object({
    /** List of account IDs to query balances for */
    accountIds: z.array(z.string().uuid()),
    /** Start date (YYYY-MM-DD, inclusive) */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    /** End date (YYYY-MM-DD, inclusive) */
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  }),
);
export type SnapshotBalancesRequest = z.infer<
  typeof SnapshotBalancesRequestSchema
>;

/**
 * Query params for balances endpoint (specific accounts)
 * accountIds is received as comma-separated string and transformed to array
 */
export const BalancesQuerySchema = registerSchema(
  'BalancesQuery',
  z.object({
    /** Comma-separated list of account UUIDs */
    accountIds: z
      .string()
      .transform((s) => s.split(','))
      .pipe(z.array(z.string().uuid())),
    /** Start date (YYYY-MM-DD, inclusive) */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    /** End date (YYYY-MM-DD, inclusive) */
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  }),
);
export type BalancesQuery = z.infer<typeof BalancesQuerySchema>;

/**
 * Query params for all-balances endpoint (all user accounts)
 */
export const AllBalancesQuerySchema = registerSchema(
  'AllBalancesQuery',
  z.object({
    /** Start date (YYYY-MM-DD, inclusive) */
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    /** End date (YYYY-MM-DD, inclusive) */
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  }),
);
export type AllBalancesQuery = z.infer<typeof AllBalancesQuerySchema>;
