import type { AccountSummaryData } from './balance-utils'

/** Shared Home/card warning; unchanged balances do not imply broken access. */
export function accountConnectionWarning(
  account: AccountSummaryData,
): string | null {
  if (account.bankLinkStatus && account.bankLinkStatus !== 'OK') {
    return (
      (account.connectionHealth?.state === 'needs_attention'
        ? account.connectionHealth.message
        : undefined) ??
      'This connection needs attention. Open Accounts to fix it.'
    )
  }
  if (
    account.connectionHealth?.state === 'healthy' &&
    Date.now() - Date.parse(account.connectionHealth.checkedAt) <
      24 * 60 * 60 * 1000
  )
    return null
  if (account.connectionHealth && account.connectionHealth.state !== 'healthy')
    return account.connectionHealth.message
  if (
    account.syncedAt &&
    Date.now() - Date.parse(account.syncedAt) >= 7 * 24 * 60 * 60 * 1000
  )
    return `No new account data since ${new Date(account.syncedAt).toLocaleDateString()}. Check the connection in Accounts.`
  return null
}
