import dayjs from 'dayjs'
import { ActionIcon, Group } from '@mantine/core'
import { Filter, ListChecks, Plus } from 'lucide-react'
import { PageLayout } from '../PageLayout'
import { DateRangeControl } from '../DateRangeControl'
import { ResponsiveSlot } from '../ResponsiveSlot'
import { useCompactLayout } from '../../lib/responsive'
import { TransactionsSkeleton } from '../TransactionsTable.skeleton'
import styles from '../../routes/_authed/transactions.module.css'
import type { ComponentProps, ReactNode } from 'react'

export function TransactionsPageFrame(
  props: Pick<
    ComponentProps<typeof PageLayout>,
    'actions' | 'toolbar' | 'children'
  >,
) {
  return (
    <PageLayout
      title="Transactions"
      scroll="content"
      contentVariant="edge-to-edge"
      {...props}
    />
  )
}
export function TransactionsToolbarFrame({
  value,
  onChange,
  children,
}: Pick<ComponentProps<typeof DateRangeControl>, 'value' | 'onChange'> & {
  children: ReactNode
}) {
  return (
    <Group className={styles.filters} gap="xs" align="center">
      <DateRangeControl growOnMobile value={value} onChange={onChange} />
      {children}
    </Group>
  )
}
export function TransactionsPageSkeleton({
  startDate,
  endDate,
}: { startDate?: string; endDate?: string } = {}) {
  const compact = useCompactLayout()
  const value: ComponentProps<typeof DateRangeControl>['value'] = [
    startDate ? dayjs(startDate).toDate() : null,
    endDate ? dayjs(endDate).toDate() : null,
  ]
  return (
    <TransactionsPageFrame
      actions={{
        primary: {
          id: 'add',
          label: 'Add transaction',
          icon: Plus,
          onClick: () => {},
          disabled: true,
        },
        secondary: [
          {
            id: 'bulk',
            label: 'Bulk edit',
            icon: ListChecks,
            onClick: () => {},
            disabled: true,
          },
        ],
      }}
      toolbar={
        <div inert>
          <TransactionsToolbarFrame value={value} onChange={() => {}}>
            <ResponsiveSlot compact={compact} variant="compact">
              <ActionIcon
                disabled
                aria-label="Open transaction filters"
                variant="subtle"
                size={44}
              >
                <Filter size={20} />
              </ActionIcon>
            </ResponsiveSlot>
            <ResponsiveSlot compact={compact} variant="wide">
              <ActionIcon
                disabled
                aria-label="Open transaction filters"
                variant="default"
                size={42}
              >
                <Filter size={18} />
              </ActionIcon>
            </ResponsiveSlot>
          </TransactionsToolbarFrame>
        </div>
      }
    >
      <TransactionsSkeleton />
    </TransactionsPageFrame>
  )
}
