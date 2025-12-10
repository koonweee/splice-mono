import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { AccountTypeSchema } from './Account';
import { ConvertedBalanceSchema, MoneyWithSignSchema } from './MoneyWithSign';

/**
 * Time period for comparison calculations
 */
export enum TimePeriod {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export const TimePeriodSchema = registerSchema(
  'TimePeriod',
  z.nativeEnum(TimePeriod),
);

/**
 * A single data point for the net worth chart
 */
export const NetWorthChartPointSchema = registerSchema(
  'NetWorthChartPoint',
  z.object({
    /** Date in YYYY-MM-DD format */
    date: z.string(),
    /** Net worth value, null if no data */
    value: MoneyWithSignSchema.nullable(),
  }),
);

export type NetWorthChartPoint = z.infer<typeof NetWorthChartPointSchema>;

/**
 * Account summary with period-over-period change
 */
export const AccountSummarySchema = registerSchema(
  'AccountSummary',
  z.object({
    id: z.string(),
    name: z.string().nullable(),
    type: AccountTypeSchema,
    subType: z.string().nullable(),
    /** Current balance in account's original currency */
    currentBalance: MoneyWithSignSchema,
    /** Current balance converted to user's preferred currency with rate info */
    convertedCurrentBalance: ConvertedBalanceSchema.nullable(),
    /** Effective balance (current + available for investment accounts, current for others) */
    effectiveBalance: MoneyWithSignSchema,
    /** Effective balance converted to user's preferred currency with rate info */
    convertedEffectiveBalance: ConvertedBalanceSchema.nullable(),
    /** Period-over-period percentage change (e.g., 3.5 for +3.5%) */
    changePercent: z.number().nullable(),
    /** Institution name from linked bank (e.g., "Chase", "Bank of America") */
    institutionName: z.string().nullable(),
  }),
);

export type AccountSummary = z.infer<typeof AccountSummarySchema>;

/**
 * Dashboard summary response
 */
export const DashboardSummarySchema = registerSchema(
  'DashboardSummary',
  z.object({
    /** Current net worth */
    netWorth: MoneyWithSignSchema,
    /** Period-over-period percentage change for net worth */
    changePercent: z.number().nullable(),
    /** The time period used for comparison */
    comparisonPeriod: TimePeriodSchema,
    /** Chart data points for net worth over time */
    chartData: z.array(NetWorthChartPointSchema),
    /** Asset accounts (positive net worth contributors) */
    assets: z.array(AccountSummarySchema),
    /** Liability accounts (negative net worth contributors) */
    liabilities: z.array(AccountSummarySchema),
  }),
);

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
