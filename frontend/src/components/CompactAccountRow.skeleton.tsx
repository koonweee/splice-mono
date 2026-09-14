import { Box, Group, Skeleton, Text } from '@mantine/core'
import { CompactAccountRowFrame } from './CompactAccountRowFrame'
import styles from './CompactAccountRow.module.css'

function RowTextPlaceholder({
  role,
  width,
}: {
  role: string
  width: number | string
}) {
  return (
    <Box pos="relative" w={width}>
      <Text data-typography={role}>{'\u00A0'}</Text>
      <Skeleton pos="absolute" top="25%" h="50%" w="100%" />
    </Box>
  )
}
export function CompactAccountRowSkeleton({
  overview = false,
}: {
  overview?: boolean
}) {
  return (
    <CompactAccountRowFrame
      details={
        <>
          <Group gap={6} wrap="nowrap">
            <RowTextPlaceholder role="rowTitleSmall" width="65%" />
          </Group>
          <RowTextPlaceholder role="caption" width="40%" />
        </>
      }
      balance={
        <>
          <RowTextPlaceholder role="amountSmall" width={80} />
          <Group
            justify="flex-end"
            className={
              overview
                ? styles.overviewChange
                : 'splice-touch-target splice-change-trigger'
            }
          >
            <RowTextPlaceholder role="caption" width={48} />
          </Group>
          {!overview && <Text data-typography="caption">{'\u00A0'}</Text>}
        </>
      }
    />
  )
}
