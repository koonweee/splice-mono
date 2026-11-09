import { describe, expect, it } from 'vitest'
import { accountConnectionWarning } from './connection-health'
import type { AccountSummaryData } from './balance-utils'

const base: AccountSummaryData = {
  id: 'account',
  name: 'SG IBKR',
  type: 'investment',
  valuationMode: 'balance',
  effectiveBalance: {
    sign: 'positive',
    money: { currency: 'USD', amount: '100' },
  },
  syncedAt: '2026-01-01T00:00:00Z',
}
describe('account connection warning', () => {
  it('prioritizes repairable access failures over an age-only warning', () => {
    expect(
      accountConnectionWarning({
        ...base,
        bankLinkStatus: 'ERROR',
        connectionHealth: {
          state: 'needs_attention',
          reason: 'accounts_missing',
          message: 'Reconnect to restore access',
          checkedAt: new Date().toISOString(),
          lastImportedAt: null,
          providerUpdates: [],
        },
      }),
    ).toBe('Reconnect to restore access')
  })
  it('accepts unchanged account activity when the provider confirms health', () => {
    expect(
      accountConnectionWarning({
        ...base,
        bankLinkStatus: 'OK',
        connectionHealth: {
          state: 'healthy',
          reason: null,
          message: 'Accessible',
          checkedAt: new Date().toISOString(),
          lastImportedAt: null,
          providerUpdates: [],
        },
      }),
    ).toBeNull()
  })
})
