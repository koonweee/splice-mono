import { useInvestmentControllerFindActivityForAccount } from '../api/clients/spliceAPI'

export function useInvestmentActivity(accountId?: string, enabled = true) {
  const query = useInvestmentControllerFindActivityForAccount(
    accountId ?? '',
    { pageSize: 10 },
    {
      query: {
        enabled: enabled && !!accountId,
      },
    },
  )

  return {
    ...query,
    activity: query.data?.data ?? [],
    total: query.data?.total ?? 0,
  }
}
