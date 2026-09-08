import { Checkbox, Paper, Skeleton, Stack, Table } from '@mantine/core'
import { useCompactLayout } from '../../lib/responsive'
import { ResponsiveSlot } from '../ResponsiveSlot'
import listStyles from '../MobileTableList.module.css'
import tableChrome from '../MantineTableChrome.module.css'
import type { CSSProperties, ReactNode } from 'react'

export const settingsTablePaperProps = {
  withBorder: true,
  radius: 'md',
  bg: 'transparent',
} as const
export const settingsTableProps = { className: tableChrome.table }

export type SettingsColumn = {
  header: string
  size?: number
  minSize?: number
  grow?: boolean
}

/** Fixed columns are sized from the same descriptor during loading and data render. */
export function settingsRuleTableProps(columns: ReadonlyArray<SettingsColumn>) {
  return {
    ...settingsTableProps,
    style: {
      tableLayout: 'fixed',
      minWidth: columns.reduce(
        (sum, column) =>
          sum + Math.max(column.size ?? 180, column.minSize ?? 40),
        0,
      ),
    } satisfies CSSProperties,
  }
}

export type SettingsTableLayout = {
  native?: boolean
  grid?: boolean
  fill?: boolean
  rowHeight?: number
  headerHeight?: number
  minWidth?: number
}

export const settingsTableFillStyle = {
  display: 'flex',
  flex: '1 1 0',
  flexDirection: 'column',
  height: '100%',
  maxHeight: '100%',
  minHeight: 0,
  minWidth: 0,
  overflow: 'hidden',
} satisfies CSSProperties
export const settingsTableContainerFillStyle = {
  flex: '1 1 0',
  height: '100%',
  maxHeight: '100%',
  minHeight: 0,
  overflow: 'auto',
} satisfies CSSProperties

function cellStyle(
  column: SettingsColumn,
  layout: SettingsTableLayout,
  header = false,
): CSSProperties {
  if (layout.native)
    return header && column.header === 'Actions' ? { textAlign: 'right' } : {}
  const width = Math.max(column.size ?? 180, column.minSize ?? 40)
  return {
    width,
    minWidth: column.minSize ?? width,
    ...(layout.grid
      ? {
          display: 'flex',
          flex: column.grow ? `${width} 0 auto` : '0 0 auto',
          alignItems: 'center',
        }
      : {}),
    ...(header && layout.headerHeight
      ? { height: layout.headerHeight, paddingTop: 0, paddingBottom: 0 }
      : {}),
    ...(!header && layout.rowHeight
      ? { height: layout.rowHeight, paddingTop: 0, paddingBottom: 0 }
      : {}),
    ...(layout.grid && column.header === 'Actions'
      ? {
          position: 'sticky',
          right: 0,
          justifyContent: 'flex-end',
          background: 'var(--mantine-color-body)',
          borderLeft: '1px solid var(--splice-border)',
        }
      : {}),
  }
}

/** Settings lists share row hierarchy and responsive chrome, not domain data. */
export function SettingsTableFrame({
  columns,
  children,
  bordered = true,
  layout = {},
}: {
  columns: ReadonlyArray<SettingsColumn>
  children: ReactNode
  bordered?: boolean
  layout?: SettingsTableLayout
}) {
  return (
    <Paper
      withBorder={bordered}
      bg={layout.native && bordered ? undefined : 'transparent'}
      p={0}
      radius="md"
      style={layout.fill ? settingsTableFillStyle : { overflow: 'hidden' }}
    >
      <div
        style={
          layout.fill ? settingsTableContainerFillStyle : { overflowX: 'auto' }
        }
      >
        <Table
          {...settingsTableProps}
          verticalSpacing={layout.native ? 'sm' : 'xs'}
          horizontalSpacing="xs"
          style={{
            tableLayout: layout.native || layout.grid ? undefined : 'fixed',
            minWidth:
              layout.minWidth ??
              columns.reduce(
                (sum, c) => sum + Math.max(c.size ?? 180, c.minSize ?? 40),
                0,
              ),
            ...(layout.grid ? { display: 'grid' } : {}),
          }}
        >
          <Table.Thead>
            <Table.Tr
              style={
                layout.grid ? { display: 'flex', width: '100%' } : undefined
              }
            >
              {columns.map((column) => (
                <Table.Th
                  key={column.header}
                  style={cellStyle(column, layout, true)}
                >
                  {column.header === 'Select' ? (
                    <Checkbox disabled aria-label="Select all categories" />
                  ) : (
                    column.header
                  )}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{children}</Table.Tbody>
        </Table>
      </div>
    </Paper>
  )
}

export function SettingsListPlaceholder({
  columns,
  bordered = true,
  mobileHeader,
  mobileRow,
  layout = {},
  renderCell,
  rows = 4,
}: {
  columns: ReadonlyArray<SettingsColumn>
  bordered?: boolean
  mobileHeader?: ReactNode
  mobileRow: ReactNode
  layout?: SettingsTableLayout
  renderCell?: (column: SettingsColumn) => ReactNode
  rows?: number
}) {
  const compact = useCompactLayout()
  return (
    <>
      <ResponsiveSlot compact={compact} variant="compact">
        <Stack gap="xs">
          {mobileHeader}
          <div className={listStyles.list}>
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className={listStyles.row}>
                {mobileRow}
              </div>
            ))}
          </div>
        </Stack>
      </ResponsiveSlot>
      <ResponsiveSlot compact={compact} variant="wide" fill={layout.fill}>
        <SettingsTableFrame
          columns={columns}
          bordered={bordered}
          layout={layout}
        >
          {Array.from({ length: rows }, (_, index) => (
            <Table.Tr
              key={index}
              style={
                layout.grid ? { display: 'flex', width: '100%' } : undefined
              }
            >
              {columns.map((column) => (
                <Table.Td key={column.header} style={cellStyle(column, layout)}>
                  {renderCell ? (
                    renderCell(column)
                  ) : (
                    <Skeleton
                      h={20}
                      w={column.header === 'Actions' ? 44 : '70%'}
                    />
                  )}
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </SettingsTableFrame>
      </ResponsiveSlot>
    </>
  )
}
