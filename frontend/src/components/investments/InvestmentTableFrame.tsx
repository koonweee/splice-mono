import { ScrollArea, Table } from '@mantine/core'
import styles from './InvestmentHoldingsTable.module.css'
import type { ReactNode } from 'react'

export const holdingsColumns = [
  'Security',
  'Ticker',
  'Quantity',
  'Price',
  'Value',
]
export const activityColumns = [
  'Date',
  'Security',
  'Type',
  'Quantity',
  'Price',
  'Fees',
  'Cash impact',
]
export function InvestmentTableFrame({
  columns,
  children,
  highlightOnHover = false,
}: {
  columns: Array<string>
  children: ReactNode
  highlightOnHover?: boolean
}) {
  const widths =
    columns === holdingsColumns
      ? [34, 10, 16, 19, 21]
      : [17, 19, 12, 11, 13, 11, 17]
  return (
    <ScrollArea type="auto">
      <Table
        className={styles.table}
        striped
        highlightOnHover={highlightOnHover}
        verticalSpacing="xs"
        style={{ tableLayout: 'fixed', minWidth: 700 }}
      >
        <Table.Thead>
          <Table.Tr>
            {columns.map((label, index) => (
              <Table.Th
                key={label}
                style={{ width: `${widths[index]}%` }}
                ta={
                  index >= (columns === holdingsColumns ? 2 : 3)
                    ? 'right'
                    : undefined
                }
              >
                {label}
              </Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{children}</Table.Tbody>
      </Table>
    </ScrollArea>
  )
}
