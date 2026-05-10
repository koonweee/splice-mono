import { MantineReactTable, useMantineReactTable } from 'mantine-react-table'
import { formatMoneyNumber, getDecimalPlaces } from '../lib/format'
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

  return <MantineReactTable table={table} />
}
