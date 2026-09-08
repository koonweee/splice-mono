import { Skeleton, Stack } from '@mantine/core'
import {
  InstitutionAccountsFrame,
  InstitutionHeadingFrame,
} from './InstitutionSectionFrame'
import { AccountRowSkeleton } from './AccountRow.skeleton'

export function AccountsSkeleton() {
  return (
    <Stack gap="lg">
      {[0, 1].map((index) => (
        <section key={index}>
          <InstitutionHeadingFrame label="Institution">
            <Skeleton h={22} w={180} />
          </InstitutionHeadingFrame>
          <InstitutionAccountsFrame>
            <AccountRowSkeleton />
            <AccountRowSkeleton />
          </InstitutionAccountsFrame>
        </section>
      ))}
    </Stack>
  )
}
