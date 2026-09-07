import { DEFAULT_APPEARANCE } from '../src/lib/design-system/appearance'
import type { Account, MoneyWithSign, User } from '../src/api/models'
import type { AccountSummaryData } from '../src/lib/balance-utils'

export const FIXTURE_NOW = '2026-09-06T12:00:00.000Z'
export const fixtureUser: User = {
  id: 'workbench-user',
  email: 'demo@example.invalid',
  displayName: 'Alex Example',
  createdAt: FIXTURE_NOW,
  updatedAt: FIXTURE_NOW,
  settings: {
    currency: 'USD',
    timezone: 'America/Los_Angeles',
    appearance: DEFAULT_APPEARANCE,
    hideZeroBalanceAccounts: false,
    analysisSankeyEnabled: true,
  },
}
export const money = (
  amount: string,
  sign: 'positive' | 'negative' = 'positive',
  currency = 'USD',
): MoneyWithSign => ({ money: { amount, currency }, sign })

export const fixtureAccounts: Array<Account> = [
  {
    id: 'investment',
    name: 'Long-term investment portfolio with a deliberately long account name',
    type: 'investment',
    subType: 'brokerage',
    valuationMode: 'balance',
    currentBalance: money('12345678900'),
    availableBalance: money('12345678900'),
    userId: fixtureUser.id,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  },
  {
    id: 'cash',
    name: 'Everyday account',
    type: 'depository',
    subType: 'checking',
    valuationMode: 'balance',
    currentBalance: money('124050'),
    availableBalance: money('124050'),
    userId: fixtureUser.id,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  },
  {
    id: 'debt',
    name: 'Credit card',
    type: 'credit',
    subType: 'credit card',
    valuationMode: 'balance',
    currentBalance: money('23412', 'negative'),
    availableBalance: money('0'),
    userId: fixtureUser.id,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  },
  {
    id: 'zero',
    name: 'Closed savings',
    type: 'depository',
    subType: 'savings',
    valuationMode: 'balance',
    currentBalance: money('0'),
    availableBalance: money('0'),
    archivedAt: FIXTURE_NOW,
    userId: fixtureUser.id,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  },
]
export const fixtureSummaries: Array<AccountSummaryData> = fixtureAccounts.map(
  (account, index) => ({
    id: account.id,
    name: account.name ?? 'Unnamed account',
    type: account.type,
    subType: account.subType ?? undefined,
    valuationMode: account.valuationMode,
    effectiveBalance: account.currentBalance,
    institutionName: 'Example institution',
    changePercent: [12.34, -2.3, 0, undefined][index],
    changeAmount: index === 1 ? money('2850', 'negative') : money('12000'),
    archivedAt: account.archivedAt,
  }),
)
