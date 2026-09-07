import { calculateChangePercent } from '../src/lib/balance-utils'
import { signedMinorUnits } from '../src/lib/money'
import { FIXTURE_NOW, fixtureAccounts, fixtureUser, money } from './fixtures'
import type {
  AnalysisRuleView,
  CategorizationRuleView,
  Category,
  DashboardPeriod,
  DashboardSeriesResponse,
  DashboardSummaryResponse,
  PersonalAccessToken,
  RecurringManualTransactionSchedule,
  Transaction,
  TransactionAnalysisResponse,
} from '../src/api/models'

export const fixtureCategories: Array<Category> = [
  {
    id: 'food',
    primary: 'FOOD_AND_DRINK',
    detailed: 'Groceries',
    description: 'Everyday food',
    color: '#e599f7',
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  },
  {
    id: 'travel',
    primary: 'TRAVEL',
    detailed: 'Travel and accommodation with a deliberately long name',
    description: 'Trips',
    color: '#74c0fc',
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  },
  {
    id: 'income',
    primary: 'INCOME',
    detailed: 'Salary',
    description: 'Employment income',
    color: '#8ce99a',
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  },
]
const base: Transaction = {
  id: 'transaction-fixture',
  source: 'manual',
  amount: money('4835', 'negative'),
  accountId: 'cash',
  accountName: 'Everyday account',
  merchantName: 'Example grocery store',
  providerTransactionName: null,
  originalDescription: 'Weekly groceries',
  pending: false,
  pendingTransactionId: null,
  accountOwner: null,
  externalTransactionId: null,
  logoUrl: null,
  website: null,
  merchantEntityId: null,
  paymentChannel: null,
  transactionCode: null,
  counterparties: null,
  location: null,
  paymentMeta: null,
  activityDate: '2026-09-04',
  reportingDateOverride: null,
  providerDate: '2026-09-04',
  providerDatetime: null,
  authorizedDate: null,
  authorizedDatetime: null,
  categoryId: 'food',
  category: fixtureCategories[0],
  categoryUpdatedAt: FIXTURE_NOW,
  categoryAssignmentSource: null,
  categoryAssignmentRuleId: null,
  providerCategoryHint: null,
  createdAt: FIXTURE_NOW,
  updatedAt: FIXTURE_NOW,
  userId: fixtureUser.id,
}
export const fixtureTransactions: Array<Transaction> = [
  base,
  {
    ...base,
    id: 'salary',
    amount: money('550000'),
    merchantName: 'Example employer',
    categoryId: 'income',
    category: fixtureCategories[2],
  },
  {
    ...base,
    id: 'travel-transaction',
    amount: money('105025', 'negative'),
    merchantName:
      'An international accommodation merchant with a long display name',
    categoryId: 'travel',
    category: fixtureCategories[1],
    pending: true,
    source: 'provider',
  },
  {
    ...base,
    id: 'uncategorized',
    amount: money('0'),
    merchantName: null,
    categoryId: null,
    category: null,
    originalDescription: 'Zero value fixture transaction',
  },
]
export const fixtureAnalysis: TransactionAnalysisResponse = {
  startDate: '2026-09-01',
  endDate: '2026-09-06',
  currency: 'USD',
  inflows: [
    {
      primaryCategory: 'INCOME',
      totalAmount: '550000',
      currency: 'USD',
      transactionCount: 1,
      color: '#8ce99a',
    },
  ],
  outflows: [
    {
      primaryCategory: 'FOOD_AND_DRINK',
      totalAmount: '4835',
      currency: 'USD',
      transactionCount: 1,
      color: '#e599f7',
    },
    {
      primaryCategory: 'TRAVEL',
      totalAmount: '105025',
      currency: 'USD',
      transactionCount: 1,
      color: '#74c0fc',
    },
  ],
  totalInflow: '550000',
  totalOutflow: '109860',
  netFlow: '440140',
  uncategorizedInflow: '0',
  uncategorizedOutflow: '0',
}
export const fixtureAnalysisRules: Array<AnalysisRuleView> = [
  {
    id: 'analysis-rule',
    name: 'Exclude travel from everyday spending',
    type: 'exclude',
    excludeScope: {
      mode: 'selected',
      categories: [fixtureCategories[1]],
      includeUncategorized: false,
    },
    inflowScope: { mode: 'all' },
    outflowScope: { mode: 'all' },
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  },
]
export const fixtureCategorizationRules: Array<CategorizationRuleView> = [
  {
    id: 'category-rule',
    name: 'Example grocery rule',
    priority: 10,
    targetCategoryId: 'food',
    targetCategory: fixtureCategories[0],
    conditions: [
      { field: 'merchantName', operator: 'contains', value: 'grocery' },
    ],
    revision: 1,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  },
]
export const fixtureSchedules: Array<RecurringManualTransactionSchedule> = [
  {
    id: 'schedule',
    accountId: 'cash',
    accountName: 'Everyday account',
    amount: money('7500', 'negative'),
    merchantName: 'Example monthly subscription',
    categoryId: 'food',
    category: fixtureCategories[0],
    frequency: 'monthly',
    dayOfMonth: 15,
    startDate: '2026-08-15',
    endDate: null,
    nextOccurrenceDate: '2026-09-15',
    lastGeneratedOccurrenceDate: '2026-08-15',
    pausedAt: null,
    archivedAt: null,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
    userId: fixtureUser.id,
  },
]
export const fixtureTokens: Array<PersonalAccessToken> = [
  {
    id: 'token-fixture',
    name: 'Example read-only integration',
    tokenPreview: 'fixture…0000',
    lastUsedAt: FIXTURE_NOW,
    expiresAt: null,
    revokedAt: null,
    createdAt: FIXTURE_NOW,
  },
]

export function fixtureDashboard(
  period: DashboardPeriod,
  empty: boolean,
): { summary: DashboardSummaryResponse; series: DashboardSeriesResponse } {
  const days: Record<DashboardPeriod, number> = {
    day: 1,
    week: 7,
    month: 30,
    year: 365,
    threeYears: 1095,
    fiveYears: 1825,
    tenYears: 3650,
    all: 6000,
  }
  const endDate = '2026-09-06'
  const startDate = new Date(Date.parse(endDate) - days[period] * 86400000)
    .toISOString()
    .slice(0, 10)
  const common = {
    period,
    startDate,
    endDate,
    reportingCurrency: 'USD',
    generatedAt: FIXTURE_NOW,
  }
  const accounts = (empty ? [] : fixtureAccounts).map((account) => ({
    id: account.id,
    name: account.name ?? 'Unnamed',
    customName: account.customName ?? null,
    type: account.type,
    subType: account.subType,
    valuationMode: account.valuationMode,
    institutionName: 'Example institution',
    archivedAt: account.archivedAt ?? null,
    syncedAt: null,
    effectiveBalance: account.currentBalance,
    changePercent: account.archivedAt
      ? undefined
      : calculateChangePercent(
          signedMinorUnits(account.currentBalance),
          signedMinorUnits(account.currentBalance) - 10000n,
        ),
    changeAmount: money(account.archivedAt ? '0' : '10000'),
  }))
  const current = accounts.reduce(
    (total, account) => total + signedMinorUnits(account.effectiveBalance),
    0n,
  )
  const change = accounts.reduce(
    (total, account) => total + signedMinorUnits(account.changeAmount),
    0n,
  )
  const netWorth = money(String(current))
  const progress =
    period === 'day' ? [0, 1] : [0, 0.25, 0.2, 0.32, 0.38, 0.7, 0.6, 1]
  return {
    summary: {
      ...common,
      netWorth,
      changeAmount: money(String(change)),
      changePercent: calculateChangePercent(current, current - change),
      assets: accounts.filter((a) => a.type !== 'credit'),
      liabilities: accounts.filter((a) => a.type === 'credit'),
    },
    series: {
      ...common,
      points: empty
        ? []
        : progress.map((fraction, index) => ({
            date: new Date(
              Date.parse(startDate) +
                ((Date.parse(common.endDate) - Date.parse(startDate)) * index) /
                  (progress.length - 1),
            )
              .toISOString()
              .slice(0, 10),
            netWorth: money(
              String(
                current -
                  change +
                  BigInt(Math.round(Number(change) * fraction)),
              ),
            ),
          })),
    },
  }
}
