import { Box, Group, Skeleton } from '@mantine/core'
import { useRouterState } from '@tanstack/react-router'
import { PageHeader } from '../PageHeader'
import { HomeSkeleton } from './HomeSkeleton'
import {
  AccountsSkeleton,
  AnalysisSkeleton,
  LoadingSkeleton,
  SettingsSkeleton,
  TableSkeleton,
} from './LoadingSkeleton'

/** Mirrors the destination shell while its route chunk arrives. */
export function RoutePendingSkeleton() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const page = pathname.split('/')[1] || 'home'
  const title =
    (
      {
        home: 'Home',
        transactions: 'Transactions',
        analysis: 'Analysis',
        accounts: 'Accounts',
        settings: 'Settings',
      } as Record<string, string>
    )[page] ?? 'Splice'
  return (
    <Box>
      <PageHeader
        title={title}
        actions={
          page !== 'settings' ? (
            <Group aria-hidden>
              <Skeleton h={42} w={page === 'home' ? 150 : 180} />
            </Group>
          ) : undefined
        }
      />
      <LoadingSkeleton label={`Loading ${title.toLowerCase()}…`}>
        {page === 'home' ? (
          <HomeSkeleton />
        ) : page === 'analysis' ? (
          <AnalysisSkeleton />
        ) : page === 'accounts' ? (
          <AccountsSkeleton />
        ) : page === 'settings' ? (
          <SettingsSkeleton />
        ) : (
          <TableSkeleton />
        )}
      </LoadingSkeleton>
    </Box>
  )
}
