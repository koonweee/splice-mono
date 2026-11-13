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
  it('does not invent warnings from old import or health-check timestamps', () => {
    expect(
      accountConnectionWarning({ ...base, bankLinkStatus: 'OK' }),
    ).toBeNull()
    expect(
      accountConnectionWarning({
        ...base,
        bankLinkStatus: 'OK',
        connectionHealth: {
          state: 'healthy',
          reason: null,
          message: 'Accessible',
          checkedAt: '2026-01-01T00:00:00Z',
          lastImportedAt: '2026-01-01T00:00:00Z',
          providerUpdates: [
            {
              product: 'investments',
              lastSuccessfulUpdateAt: '2026-01-01T00:00:00Z',
              lastFailedUpdateAt: '2026-01-05T00:00:00Z',
            },
          ],
        },
      }),
    ).toBeNull()
    expect(accountConnectionWarning(base)).toBeNull()
  })
  it('reports an actual failed connection check', () => {
    expect(
      accountConnectionWarning({
        ...base,
        bankLinkStatus: 'OK',
        connectionHealth: {
          state: 'unknown',
          reason: 'check_failed',
          message: 'Connection check unavailable. Try again later.',
          checkedAt: new Date().toISOString(),
          lastImportedAt: null,
          providerUpdates: [],
        },
      }),
    ).toBe('Connection check unavailable. Try again later.')
  })
})
