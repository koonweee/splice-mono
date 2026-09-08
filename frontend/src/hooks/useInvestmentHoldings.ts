import { pageReadPolicy } from '../lib/page-refresh'
import { useInvestmentControllerFindLatestHoldingsForAccount } from '../api/clients/spliceAPI'

export function useInvestmentHoldings(accountId?: string, enabled = true) {
  const query = useInvestmentControllerFindLatestHoldingsForAccount(
    accountId ?? '',
    {
      query: {
        ...pageReadPolicy,
        enabled: enabled && !!accountId,
      },
    },
  )

  return {
    ...query,
    holdings: query.data?.holdings ?? [],
    snapshotDate: query.data?.snapshotDate ?? null,
    accountCurrency: query.data?.accountCurrency ?? null,
    accountValue: query.data?.accountValue ?? null,
  }
}
