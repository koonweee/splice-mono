import { Box, Group, Text } from '@mantine/core'
import { MantineReactTable, useMantineReactTable } from 'mantine-react-table'
import { formatMoneyNumber, getDecimalPlaces } from '../lib/format'
import { useIsMobile } from '../lib/hooks'
import { MobileTableList } from './MobileTableList'
import type { MRT_ColumnDef } from 'mantine-react-table'
import type { BalanceAdjustment, Money } from '../api/models'

interface BalanceAdjustmentsTableProps {
  data: Array<BalanceAdjustment>
  mantinePaperProps?: Record<string, unknown>
  mantineTableContainerProps?: Record<string, unknown>
}

function formatMoney(money: Money): string {
  const decimals = getDecimalPlaces(money.currency)
  return formatMoneyNumber({
    value: money.amount / Math.pow(10, decimals),
    currency: money.currency,
  })
}

const columns: Array<MRT_ColumnDef<BalanceAdjustment>> = [
  {
    accessorKey: 'accountName',
    header: 'Account',
    Cell: ({ cell }) => cell.getValue<string>(),
  },
  {
    id: 'startBalance',
    header: 'Start Balance',
    enableSorting: false,
    accessorFn: (row) => row.startBalance,
    Cell: ({ cell }) => formatMoney(cell.getValue<Money>()),
  },
  {
    id: 'endBalance',
    header: 'End Balance',
    enableSorting: false,
    accessorFn: (row) => row.endBalance,
    Cell: ({ cell }) => formatMoney(cell.getValue<Money>()),
  },
  {
    accessorKey: 'deltaAmount',
    header: 'Adjustment',
    Cell: ({ row }) =>
      formatMoney({
        amount: Math.abs(row.original.deltaAmount),
        currency: row.original.currency,
      }),
  },
]

export function BalanceAdjustmentsTable({
  data,
  mantinePaperProps,
  mantineTableContainerProps,
}: BalanceAdjustmentsTableProps) {
  const isMobile = useIsMobile()
  const table = useMantineReactTable({
    columns,
    data,
    enablePagination: false,
    enableGlobalFilter: false,
    enableColumnFilters: false,
    enableColumnActions: false,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableHiding: false,
    enableTopToolbar: false,
    enableBottomToolbar: false,
    enableStickyHeader: true,
    initialState: { density: 'xs' },
    mantinePaperProps,
    mantineTableContainerProps,
  })

  if (isMobile) {
    return (
      <MobileTableList
        ariaLabel={`Balance adjustments list, ${data.length.toLocaleString()} total`}
        data={data}
        emptyMessage="No transactions found."
        getRowKey={(adjustment) => adjustment.accountId}
        renderRow={(adjustment) => (
          <Box px="sm" py="sm">
            <Group
              align="flex-start"
              justify="space-between"
              gap="md"
              wrap="nowrap"
            >
              <Box style={{ minWidth: 0 }}>
                <Text fw={700} truncate>
                  {adjustment.accountName}
                </Text>
                <Text c="dimmed" size="xs">
                  Start {formatMoney(adjustment.startBalance)}
                </Text>
                <Text c="dimmed" size="xs">
                  End {formatMoney(adjustment.endBalance)}
                </Text>
              </Box>
              <Text fw={700} ta="right" style={{ flex: '0 0 auto' }}>
                {formatMoney({
                  amount: Math.abs(adjustment.deltaAmount),
                  currency: adjustment.currency,
                })}
              </Text>
            </Group>
          </Box>
        )}
      />
    )
  }

  return <MantineReactTable table={table} />
}
