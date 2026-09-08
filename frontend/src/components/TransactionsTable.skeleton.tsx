import { Box, Group, Paper, Skeleton, Stack, Table, Text } from '@mantine/core'
import { useCompactLayout } from '../lib/responsive'
import { ResponsiveSlot } from './ResponsiveSlot'
import {
  transactionColumns,
  transactionTablePaperProps,
} from './transactions/transaction-columns'
import { TransactionsMobileListSkeleton } from './transactions/TransactionsMobileList.skeleton'
import tableChrome from './MantineTableChrome.module.css'

type Props = {
  rows?: number
  hiddenColumns?: Array<'accountName' | 'category'>
}
export function TransactionsTableSkeleton({
  rows = 6,
  hiddenColumns = [],
}: Props) {
  const columns = Object.entries(transactionColumns).filter(
    ([key]) => !hiddenColumns.includes(key as 'accountName' | 'category'),
  )
  return (
    <Paper {...transactionTablePaperProps} style={{ overflow: 'hidden' }}>
      <Box style={{ overflowX: 'auto' }}>
        <Table
          className={tableChrome.table}
          verticalSpacing="xs"
          style={{
            background: 'var(--mantine-color-body)',
            tableLayout: 'fixed',
            minWidth: columns.reduce((sum, [, column]) => sum + column.size, 0),
          }}
        >
          <Table.Thead>
            <Table.Tr>
              {columns.map(([key, column]) => (
                <Table.Th
                  key={key}
                  h={42}
                  ta={key === 'amount' ? 'right' : undefined}
                  style={{
                    width: `${(column.size / columns.reduce((sum, [, c]) => sum + c.size, 0)) * 100}%`,
                  }}
                >
                  {column.header}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {Array.from({ length: rows }, (_, index) => (
              <Table.Tr key={index}>
                {columns.map(([key]) => (
                  <Table.Td key={key} p={10} h={49}>
                    {key === 'description' ? (
                      <Group gap="xs" wrap="nowrap">
                        <Skeleton
                          width={28}
                          height={28}
                          radius="sm"
                          style={{ flexShrink: 0 }}
                        />
                        <Stack gap={1} style={{ flex: 1 }}>
                          <Text component="div" data-typography="bodySmall">
                            <Skeleton width="75%">&nbsp;</Skeleton>
                          </Text>
                          <Text component="div" data-typography="caption">
                            <Skeleton width="50%">&nbsp;</Skeleton>
                          </Text>
                        </Stack>
                      </Group>
                    ) : (
                      <Skeleton
                        height={key === 'category' ? 18 : 16}
                        width={key === 'category' ? '55%' : '75%'}
                        ml={key === 'amount' ? 'auto' : undefined}
                      />
                    )}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
    </Paper>
  )
}
export function TransactionsSkeleton({
  variant = 'page',
  compact: compactOverride,
  breakpoint = 'compact',
  ...props
}: Props & {
  variant?: 'page' | 'drilldown' | 'default'
  compact?: boolean
  breakpoint?: 'compact' | 'data-list' | 'touch'
}) {
  const defaultCompact = useCompactLayout()
  const compact = compactOverride ?? defaultCompact
  return (
    <>
      <ResponsiveSlot
        compact={compact}
        variant="compact"
        breakpoint={breakpoint}
      >
        <TransactionsMobileListSkeleton rows={props.rows} variant={variant} />
      </ResponsiveSlot>
      <ResponsiveSlot compact={compact} variant="wide" breakpoint={breakpoint}>
        <TransactionsTableSkeleton {...props} />
      </ResponsiveSlot>
    </>
  )
}
