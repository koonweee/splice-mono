import { Skeleton } from '@mantine/core'
import { settingsRowActionColumnWidth } from './settings-row-action-layout'
import { SettingsCompactRowFrame } from './SettingsCompactRowFrame'
import styles from './SettingsCompactRow.module.css'
import { SettingsListPlaceholder } from './SettingsTableFrame'

export const analysisRulesSectionColumns = [
  { header: 'Name', size: 180, minSize: 180 },
  { header: 'Type', size: 120 },
  { header: 'Behavior', size: 260, minSize: 260 },
  { header: 'Status', size: 110 },
  { header: 'Actions', size: settingsRowActionColumnWidth(2) },
] as const

export function AnalysisRulesSkeleton() {
  return (
    <SettingsListPlaceholder
      mobileRow={
        <SettingsCompactRowFrame
          heading={
            <>
              <Skeleton h={22} className={styles.title} />
              <Skeleton h={20} w={55} />
              <Skeleton h={28} w={28} />
            </>
          }
        >
          <Skeleton h={20} w="75%" />
          <div className={styles.metadata}>
            <Skeleton h={20} w={90} />
          </div>
        </SettingsCompactRowFrame>
      }
      columns={analysisRulesSectionColumns}
    />
  )
}
