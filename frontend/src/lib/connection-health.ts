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
  if (account.connectionHealth?.state === 'unknown')
    return account.connectionHealth.message
  return null
}
