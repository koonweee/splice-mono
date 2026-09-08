import { Divider, Skeleton, Text } from '@mantine/core'
import styles from './AccountSection.module.css'
import {
  AccountGroupHeader,
  AccountSectionHeading,
  AccountSectionPanel,
} from './AccountSectionFrame'
import { CompactAccountRowSkeleton } from './CompactAccountRow.skeleton'

export function AccountSectionSkeleton({
  title,
  groups = [],
}: {
  title: string
  groups?: Array<string>
}) {
  return (
    <>
      <AccountSectionHeading title={title} />
      <AccountSectionPanel>
        {groups.length ? (
          groups.map((label, index) => (
            <div key={label}>
              {index > 0 && <Divider className={styles.groupDivider} />}
              <AccountGroupHeader
                label={label}
                total={
                  <Text
                    component="span"
                    data-typography="numericCaptionStrong"
                    className="splice-touch-target splice-change-trigger"
                    pos="relative"
                    w={44}
                  >
                    {'\u00A0'}
                    <Skeleton
                      h={10}
                      w={40}
                      pos="absolute"
                      top="calc(50% - 5px)"
                      right={0}
                    />
                  </Text>
                }
              />
              <CompactAccountRowSkeleton overview />
            </div>
          ))
        ) : (
          <>
            <CompactAccountRowSkeleton overview />
            <Divider className={styles.accountDivider} />
            <CompactAccountRowSkeleton overview />
          </>
        )}
      </AccountSectionPanel>
    </>
  )
}
