import {
  useMutation,
  useQuery,
  type QueryClient,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query'
import { axios } from './axios'
import type { MoneyWithSign } from './models'

export interface ManualInvestmentHoldingInput {
  symbol: string
  displayName?: string | null
  quantity: number
}

export interface ManualInvestmentHolding extends ManualInvestmentHoldingInput {
  id: string
  instrumentId: string
}

export interface ManualInvestmentSnapshot {
  id: string
  accountId: string
  userId: string
  snapshotDate: string
  cashBalance: MoneyWithSign
  holdings: Array<ManualInvestmentHolding>
  createdAt: string
  updatedAt: string
}

export interface ReplaceManualInvestmentSnapshotDto {
  cashBalance: MoneyWithSign
  holdings: Array<ManualInvestmentHoldingInput>
}

export const manualInvestmentQueryKeys = {
  all: (accountId: string) =>
    ['/account', accountId, 'manual-investment-snapshots'] as const,
  detail: (accountId: string, date: string) =>
    ['/account', accountId, 'manual-investment-snapshots', date] as const,
}

export const listManualInvestmentSnapshots = (
  accountId: string,
  signal?: AbortSignal,
) =>
  axios<Array<ManualInvestmentSnapshot>>({
    url: `/account/${accountId}/manual-investment-snapshots`,
    method: 'GET',
    signal,
  })

export function useManualInvestmentSnapshots(
  accountId: string | undefined,
  enabled = true,
  options?: Partial<
    UseQueryOptions<Array<ManualInvestmentSnapshot>, unknown>
  >,
): UseQueryResult<Array<ManualInvestmentSnapshot>, unknown> {
  return useQuery({
    queryKey: manualInvestmentQueryKeys.all(accountId ?? 'missing'),
    queryFn: ({ signal }) => {
      if (!accountId) {
        return Promise.resolve([])
      }
      return listManualInvestmentSnapshots(accountId, signal)
    },
    enabled: enabled && !!accountId,
    ...options,
  })
}

export const replaceManualInvestmentSnapshot = (
  accountId: string,
  date: string,
  data: ReplaceManualInvestmentSnapshotDto,
) =>
  axios<ManualInvestmentSnapshot>({
    url: `/account/${accountId}/manual-investment-snapshots/${date}`,
    method: 'PUT',
    data,
  })

export function useReplaceManualInvestmentSnapshot(
  options?: {
    mutation?: UseMutationOptions<
      ManualInvestmentSnapshot,
      unknown,
      {
        accountId: string
        date: string
        data: ReplaceManualInvestmentSnapshotDto
      }
    >
  },
  queryClient?: QueryClient,
): UseMutationResult<
  ManualInvestmentSnapshot,
  unknown,
  {
    accountId: string
    date: string
    data: ReplaceManualInvestmentSnapshotDto
  }
> {
  return useMutation(
    {
      mutationFn: ({ accountId, date, data }) =>
        replaceManualInvestmentSnapshot(accountId, date, data),
      ...options?.mutation,
    },
    queryClient,
  )
}

export const deleteManualInvestmentSnapshot = (accountId: string, date: string) =>
  axios<void>({
    url: `/account/${accountId}/manual-investment-snapshots/${date}`,
    method: 'DELETE',
  })

export function useDeleteManualInvestmentSnapshot(
  options?: {
    mutation?: UseMutationOptions<
      void,
      unknown,
      {
        accountId: string
        date: string
      }
    >
  },
  queryClient?: QueryClient,
): UseMutationResult<
  void,
  unknown,
  {
    accountId: string
    date: string
  }
> {
  return useMutation(
    {
      mutationFn: ({ accountId, date }) =>
        deleteManualInvestmentSnapshot(accountId, date),
      ...options?.mutation,
    },
    queryClient,
  )
}
