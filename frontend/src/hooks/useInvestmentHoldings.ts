import { useInvestmentControllerFindLatestHoldingsForAccount } from '../api/clients/spliceAPI'

export function useInvestmentHoldings(accountId?: string, enabled = true) {
  const query = useInvestmentControllerFindLatestHoldingsForAccount(
    accountId ?? '',
    {
      query: {
        enabled: enabled && !!accountId,
      },
    },
  )

  return {
    ...query,
    holdings: query.data?.holdings ?? [],
    snapshotDate: query.data?.snapshotDate ?? null,
  }
}
