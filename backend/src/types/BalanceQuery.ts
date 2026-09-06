import { CalendarDateSchema } from '../common/query-bounds';
import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { AccountSchema } from './Account';
import { MoneyWithSignSchema } from './MoneyWithSign';

import { RateWithSourceSchema } from './ExchangeRate';
export { RateWithSourceSchema, RateSourceSchema } from './ExchangeRate';
export type { RateWithSource, RateSource } from './ExchangeRate';

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
    latestSyncedAt: z.date().optional(),
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
    startDate: CalendarDateSchema,
    /** End date (YYYY-MM-DD, inclusive) */
    endDate: CalendarDateSchema,
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
    startDate: CalendarDateSchema,
    /** End date (YYYY-MM-DD, inclusive) */
    endDate: CalendarDateSchema,
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
    startDate: CalendarDateSchema,
    /** End date (YYYY-MM-DD, inclusive) */
    endDate: CalendarDateSchema,
  }),
);
export type AllBalancesQuery = z.infer<typeof AllBalancesQuerySchema>;
