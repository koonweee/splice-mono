import { Skeleton, Stack } from '@mantine/core'
import { AccountRowFrame } from './AccountRowFrame'

export function AccountRowSkeleton() {
  return (
    <AccountRowFrame>
      <Stack gap={4} flex={1}>
        <Skeleton h={22} w="80%" />
        <Skeleton h={20} w="40%" />
        <Skeleton h={20} w={64} mt={4} />
      </Stack>
      <Skeleton h={20} w={20} />
    </AccountRowFrame>
  )
}
