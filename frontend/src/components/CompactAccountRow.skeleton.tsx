import { Box, Group, Skeleton, Text } from '@mantine/core'
import { CompactAccountRowFrame } from './CompactAccountRowFrame'

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
          {!overview && (
            <>
              <RowTextPlaceholder role="caption" width={48} />
              <Text data-typography="caption">{'\u00A0'}</Text>
            </>
          )}
        </>
      }
    />
  )
}
