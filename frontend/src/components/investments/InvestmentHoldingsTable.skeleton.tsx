import { Box, Group, Skeleton, Stack, Table } from '@mantine/core'
import { ResponsiveSlot } from '../ResponsiveSlot'
import { useDataListLayout } from '../../lib/responsive'
import { InvestmentTableFrame, holdingsColumns } from './InvestmentTableFrame'
import styles from './InvestmentHoldingsTable.module.css'

export function InvestmentHoldingsTableSkeleton({
  rows = 3,
}: {
  rows?: number
}) {
  const compact = useDataListLayout()
  return (
    <>
      <ResponsiveSlot
        compact={compact}
        variant="compact"
        breakpoint="data-list"
      >
        {Array.from({ length: rows }, (_, index) => (
          <Box key={index} className={styles.mobileRow} px="xs" py="sm">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Stack gap={4} style={{ flex: 1 }}>
                <Skeleton height={18} width="70%" />
                <Skeleton height={14} width="45%" />
                <Skeleton height={14} width="55%" />
              </Stack>
              <Skeleton height={18} width={85} />
            </Group>
          </Box>
        ))}
      </ResponsiveSlot>
      <ResponsiveSlot compact={compact} variant="wide" breakpoint="data-list">
        <InvestmentTableFrame columns={holdingsColumns}>
          {Array.from({ length: rows }, (_, index) => (
            <Table.Tr key={index}>
              {holdingsColumns.map((label) => (
                <Table.Td key={label}>
                  <Skeleton height={16} width="80%" />
                </Table.Td>
              ))}
            </Table.Tr>
          ))}
        </InvestmentTableFrame>
      </ResponsiveSlot>
    </>
  )
}
