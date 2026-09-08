import { Group, Skeleton } from '@mantine/core'
import { SettingsCompactRowFrame } from './SettingsCompactRowFrame'
import styles from './SettingsCompactRow.module.css'
import { SettingsListPlaceholder } from './SettingsTableFrame'

export const recurringManualTransactionsSectionColumns = [
  { header: 'Merchant' },
  { header: 'Amount' },
  { header: 'Schedule' },
  { header: 'Next' },
  { header: 'Status' },
  { header: 'Actions' },
] as const

export const recurringTableLayout = { native: true, minWidth: 720 } as const

export function RecurringTransactionsSkeleton() {
  return (
    <SettingsListPlaceholder
      layout={recurringTableLayout}
      mobileRow={
        <SettingsCompactRowFrame
          heading={
            <>
              <div className={styles.title}>
                <Skeleton h={22} w="60%" />
                <Group justify="space-between" gap={6}>
                  <Skeleton h={20} w={100} />
                  <Skeleton h={20} w={80} />
                </Group>
              </div>
              <Skeleton h={28} w={28} />
            </>
          }
        >
          <div className={styles.metadata}>
            <Skeleton h={20} w={55} />
            <Skeleton h={20} w={140} />
          </div>
          <Skeleton h={20} w={140} />
        </SettingsCompactRowFrame>
      }
      columns={recurringManualTransactionsSectionColumns}
      bordered
    />
  )
}
