import { Badge, Tooltip } from '@mantine/core'
import dayjs from 'dayjs'
import {
  MantineReactTable,
  useMantineReactTable,
} from 'mantine-react-table'
import type { MRT_ColumnDef, MRT_SortingState } from 'mantine-react-table'
import type { Transaction } from '../api/models'
import { formatCategoryName, formatMoneyWithSign } from '@/lib/format'

type HideableColumn = 'accountName' | 'category'

interface TransactionsTableProps {
  data: Array<Transaction>
  totalRows: number
  isLoading: boolean
  isError: boolean
  isFetchingNextPage?: boolean
  hiddenColumns?: Array<HideableColumn>
  enableVirtualization?: boolean
  onScrollNearBottom?: () => void
  manualSorting?: boolean
  sorting?: MRT_SortingState
  onSortingChange?: (
    updater: MRT_SortingState | ((prev: MRT_SortingState) => MRT_SortingState),
  ) => void
  mantinePaperProps?: Record<string, unknown>
  mantineTableContainerProps?: Record<string, unknown>
}

function AmountCell({ row }: { row: { original: Transaction } }) {
  const { amount, convertedAmount } = row.original
  const displayAmount = convertedAmount ?? amount

  const hasDifferentCurrency =
    convertedAmount &&
    convertedAmount.money.currency !== amount.money.currency

  const formatted = formatMoneyWithSign({ value: displayAmount })

  if (hasDifferentCurrency) {
    const originalFormatted = formatMoneyWithSign({
      value: amount,
      appendCurrency: true,
    })
    return (
      <Tooltip label={`Original: ${originalFormatted}`} withArrow>
        <span>{formatted}</span>
      </Tooltip>
    )
  }

  return <>{formatted}</>
}

const allColumns: Array<MRT_ColumnDef<Transaction>> = [
  {
    accessorKey: 'date',
    header: 'Date',
    Cell: ({ cell }) => dayjs(cell.getValue<string>()).format('MMM D, YYYY'),
  },
  {
    accessorKey: 'merchantName',
    header: 'Merchant',
    Cell: ({ cell }) => cell.getValue<string | null>() ?? '--',
  },
  {
    accessorKey: 'amount',
    header: 'Amount',
    Cell: AmountCell,
  },
  {
    accessorKey: 'accountName',
    header: 'Account',
    enableSorting: false,
    Cell: ({ cell }) => cell.getValue<string | null>() ?? '--',
  },
  {
    id: 'category',
    header: 'Category',
    enableSorting: false,
    accessorFn: (row) =>
      row.category ? formatCategoryName(row.category) : '--',
  },
  {
    accessorKey: 'pending',
    header: 'Status',
    Cell: ({ cell }) =>
      cell.getValue<boolean>() ? (
        <Badge color="yellow" variant="light">
          Pending
        </Badge>
      ) : (
        <Badge color="green" variant="light">
          Posted
        </Badge>
      ),
  },
]

export function TransactionsTable({
  data,
  totalRows,
  isLoading,
  isError,
  isFetchingNextPage = false,
  hiddenColumns = [],
  enableVirtualization = false,
  onScrollNearBottom,
  manualSorting = false,
  sorting,
  onSortingChange,
  mantinePaperProps,
  mantineTableContainerProps,
}: TransactionsTableProps) {
  const columns = hiddenColumns.length > 0
    ? allColumns.filter(
        (col) =>
          !hiddenColumns.includes(
            (col.accessorKey ?? col.id) as HideableColumn,
          ),
      )
    : allColumns

  const table = useMantineReactTable({
    columns,
    data,
    rowCount: totalRows,
    enablePagination: false,
    manualSorting,
    ...(onSortingChange ? { onSortingChange } : {}),
    enableRowVirtualization: enableVirtualization,
    state: {
      ...(sorting ? { sorting } : {}),
      isLoading,
      showProgressBars: isFetchingNextPage,
      showAlertBanner: isError,
    },
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
    mantineTableContainerProps: {
      ...mantineTableContainerProps,
      ...(onScrollNearBottom
        ? {
            onScroll: (e: React.UIEvent<HTMLDivElement>) => {
              const { scrollHeight, scrollTop, clientHeight } =
                e.currentTarget
              if (scrollHeight - scrollTop - clientHeight < 400) {
                onScrollNearBottom()
              }
            },
          }
        : {}),
    },
    mantinePaperProps,
    mantineToolbarAlertBannerProps: isError
      ? { color: 'red', children: 'Error loading transactions' }
      : undefined,
  })

  return <MantineReactTable table={table} />
}
