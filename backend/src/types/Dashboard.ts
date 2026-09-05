import { z } from 'zod';
import { registerSchema } from '../common/zod-api-response';
import { AccountTypeSchema, AccountValuationModeSchema } from './Account';
import { MoneyWithSignSchema } from './MoneyWithSign';

export const DashboardPeriodSchema = registerSchema(
  'DashboardPeriod',
  z.enum([
    'day',
    'week',
    'month',
    'year',
    'threeYears',
    'fiveYears',
    'tenYears',
  ]),
);
export type DashboardPeriod = z.infer<typeof DashboardPeriodSchema>;
export const DASHBOARD_PERIOD_DAYS: Record<DashboardPeriod, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
  threeYears: 1095,
  fiveYears: 1825,
  tenYears: 3650,
};
const calendarDate = z.string().date();
export const DashboardQuerySchema = registerSchema(
  'DashboardQuery',
  z.object({ period: DashboardPeriodSchema, endDate: calendarDate }).strict(),
);
export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;
const range = z.object({
  period: DashboardPeriodSchema,
  startDate: calendarDate,
  endDate: calendarDate,
  reportingCurrency: z.string(),
  generatedAt: z.string().datetime(),
});
export const DashboardAccountSummarySchema = registerSchema(
  'DashboardAccountSummary',
  z.object({
    id: z.string(),
    name: z.string(),
    customName: z.string().nullable(),
    type: AccountTypeSchema,
    subType: z.string().nullable(),
    valuationMode: AccountValuationModeSchema,
    institutionName: z.string().nullable(),
    archivedAt: z.string().datetime().nullable(),
    syncedAt: z.string().datetime().nullable(),
    effectiveBalance: MoneyWithSignSchema,
    convertedEffectiveBalance: MoneyWithSignSchema.optional(),
    changeAmount: MoneyWithSignSchema.optional(),
    changePercent: z.number().optional(),
  }),
);
export type DashboardAccountSummary = z.infer<
  typeof DashboardAccountSummarySchema
>;
export const DashboardSummaryResponseSchema = registerSchema(
  'DashboardSummaryResponse',
  range.extend({
    netWorth: MoneyWithSignSchema,
    changeAmount: MoneyWithSignSchema,
    changePercent: z.number().optional(),
    assets: z.array(DashboardAccountSummarySchema),
    liabilities: z.array(DashboardAccountSummarySchema),
  }),
);
export type DashboardSummaryResponse = z.infer<
  typeof DashboardSummaryResponseSchema
>;
export const DashboardSeriesResponseSchema = registerSchema(
  'DashboardSeriesResponse',
  range.extend({
    points: z
      .array(z.object({ date: calendarDate, netWorth: MoneyWithSignSchema }))
      .max(122),
  }),
);
export type DashboardSeriesResponse = z.infer<
  typeof DashboardSeriesResponseSchema
>;
