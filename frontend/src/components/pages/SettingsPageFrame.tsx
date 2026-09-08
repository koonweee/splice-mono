import { Box, Paper, Stack, Tabs } from '@mantine/core'
import { PageLayout } from '../PageLayout'
import { PageNavigation } from '../PageNavigation'
import {
  SettingsSectionActions,
  SettingsSectionFilters,
} from '../settings/SettingsSection.skeleton'
import styles from './SettingsPage.module.css'
import type { SettingsSection } from '../settings/SettingsSection.skeleton'
import type { ReactNode, Ref } from 'react'
import type { SettingsTab } from '../../lib/route-search'

export const settingsTabs: Array<{ value: SettingsTab; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'access', label: 'Access' },
  { value: 'categories', label: 'Categories' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'categorization', label: 'Categorization' },
  { value: 'recurring', label: 'Recurring' },
]
export function SettingsPageFrame({
  tab,
  onChange,
  onPrepare,
  tabListRef,
  children,
}: {
  tab: SettingsTab
  onChange: (value: string | null) => void
  onPrepare?: (value: SettingsTab) => void
  tabListRef?: Ref<HTMLDivElement>
  children: ReactNode
}) {
  const section = (
    ['categories', 'analysis', 'categorization', 'recurring'] as const
  ).find((candidate): candidate is SettingsSection => candidate === tab)
  return (
    <Box className={styles.settingsPage}>
      <Tabs
        className={styles.settingsTabs}
        classNames={{ panel: styles.settingsPanel }}
        value={tab}
        onChange={onChange}
        keepMounted={false}
      >
        <PageLayout
          title="Settings"
          scroll="content"
          actionFallback={
            section ? <SettingsSectionActions section={section} /> : undefined
          }
          toolbarFallback={
            section ? (
              <SettingsSectionFilters section={section} inline />
            ) : undefined
          }
          navigation={
            <PageNavigation
              label="Settings section"
              value={tab}
              onChange={onChange}
              items={settingsTabs}
            >
              <div className={styles.settingsTabScroller}>
                <Tabs.List ref={tabListRef} className={styles.settingsTabList}>
                  {settingsTabs.map((item) => (
                    <Tabs.Tab
                      key={item.value}
                      value={item.value}
                      onPointerEnter={() => onPrepare?.(item.value)}
                      onFocus={() => onPrepare?.(item.value)}
                      onTouchStart={() => onPrepare?.(item.value)}
                    >
                      {item.label}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </div>
            </PageNavigation>
          }
        >
          {children}
        </PageLayout>
      </Tabs>
    </Box>
  )
}
export function GeneralSettingsFrame({
  appearance,
  currency,
  timezone,
  preferences,
  actions,
  children,
}: {
  appearance: ReactNode
  currency: ReactNode
  timezone: ReactNode
  preferences: ReactNode
  actions: ReactNode
  children?: ReactNode
}) {
  return (
    <Paper bg="transparent" maw={720} data-testid="settings-card">
      <Stack gap="sm">
        <div className={styles.generalSection}>{appearance}</div>
        <div className={styles.generalSection}>{currency}</div>
        <div className={styles.generalSection}>{timezone}</div>
        <Stack gap="sm" className={styles.generalSection}>
          {preferences}
        </Stack>
        {actions}
        {children}
      </Stack>
    </Paper>
  )
}
export function NotificationSettingsFrame({
  device,
  transactions,
  children,
}: {
  device: ReactNode
  transactions: ReactNode
  children?: ReactNode
}) {
  return (
    <Stack gap="lg" maw={720}>
      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">{device}</Stack>
      </Paper>
      <Paper withBorder p="lg" radius="md">
        <Stack gap="sm">{transactions}</Stack>
      </Paper>
      {children}
    </Stack>
  )
}
