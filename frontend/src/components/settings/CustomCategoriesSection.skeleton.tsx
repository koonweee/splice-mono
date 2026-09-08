import { Checkbox, Group, Skeleton } from '@mantine/core'
import { SettingsCompactRowFrame } from './SettingsCompactRowFrame'
import styles from './SettingsCompactRow.module.css'
import { SettingsListPlaceholder } from './SettingsTableFrame'

export const customCategoriesSectionColumns = [
  { header: 'Select', size: 56 },
  { header: 'Category', size: 320, minSize: 180, grow: true },
  { header: 'Used', size: 88 },
  { header: 'Status', size: 130 },
  { header: 'Actions', size: 92 },
] as const

export const categoriesTableLayout = {
  grid: true,
  fill: true,
  rowHeight: 66,
  headerHeight: 52,
  minWidth: 546,
} as const

export function CategoriesTableSkeleton() {
  return (
    <SettingsListPlaceholder
      layout={categoriesTableLayout}
      renderCell={(column) =>
        column.header === 'Select' ? (
          <Checkbox disabled aria-label="Select category" />
        ) : column.header === 'Category' ? (
          <Group gap={8} wrap="nowrap" w="100%">
            <Skeleton circle h={14} w={14} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Skeleton h={20} w="65%" />
              <Skeleton h={16} w="45%" mt={2} />
            </div>
          </Group>
        ) : (
          <Skeleton h={20} w={column.header === 'Actions' ? 44 : '70%'} />
        )
      }
      mobileRow={
        <SettingsCompactRowFrame
          heading={
            <>
              <Checkbox disabled aria-label="Select category" />
              <Skeleton h={22} className={styles.title} />
              <Skeleton h={28} w={28} />
            </>
          }
        >
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <Skeleton h={12} w={12} mt={4} />
            <Skeleton h={20} w="65%" />
          </Group>
          <div className={styles.metadata}>
            <Skeleton h={20} w={55} />
            <Skeleton h={16} w={50} />
          </div>
        </SettingsCompactRowFrame>
      }
      columns={customCategoriesSectionColumns}
      mobileHeader={<Checkbox disabled label="Select all visible categories" />}
    />
  )
}
