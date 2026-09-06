import {
  Box,
  Button,
  Checkbox,
  Grid,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  VisuallyHidden,
} from '@mantine/core'
import accountStyles from '../AccountModal.module.css'
import toolbarStyles from '../settings/SettingsToolbar.module.css'
import styles from './LoadingSkeleton.module.css'
import type { AccountSummaryData } from '../../lib/balance-utils'
import type { ReactNode } from 'react'

/** One announcement per boundary; shapes never expose fake values or controls. */
export function LoadingSkeleton({
  children,
  label = 'Loading results…',
}: {
  children: ReactNode
  label?: string
}) {
  return (
    <Box
      role="status"
      aria-label={label.replace(/…$/, '')}
      aria-busy="true"
      className={styles.root}
    >
      <VisuallyHidden>{label}</VisuallyHidden>
      <div aria-hidden="true">{children}</div>
    </Box>
  )
}

export function RowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Stack gap={0}>
      {Array.from({ length: rows }, (_, index) => (
        <Group key={index} wrap="nowrap" py="md" px="sm" className={styles.row}>
          <Skeleton circle h={32} w={32} />
          <Stack gap={8} flex={1}>
            <Skeleton h={14} w="48%" />
            <Skeleton h={10} w="32%" />
          </Stack>
          <Skeleton h={16} w={80} />
        </Group>
      ))}
    </Stack>
  )
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Paper withBorder radius="sm">
      <Group p="sm" className={styles.tableHeader}>
        <Skeleton h={16} w="30%" />
        <Skeleton h={16} w="18%" ml="auto" />
      </Group>
      <RowSkeleton rows={rows} />
    </Paper>
  )
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return <Skeleton h={height} radius="sm" />
}

export function FormSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <Stack gap="md">
      {Array.from({ length: fields }, (_, index) => (
        <Stack key={index} gap={8}>
          <Skeleton h={14} w="30%" />
          <Skeleton h={42} />
        </Stack>
      ))}
      <Group justify="flex-end">
        <Skeleton h={42} w={100} />
      </Group>
    </Stack>
  )
}

type SettingsSection =
  | 'categories'
  | 'analysis'
  | 'categorization'
  | 'recurring'
const sectionLabels = {
  categories: [
    'Categories',
    'Organize your transactions with categories that make sense to you.',
    'Add category',
  ],
  analysis: [
    'Analysis rules',
    'Choose which transactions count toward your analysis totals.',
    'Add rule',
  ],
  categorization: [
    'Categorization rules',
    'Automatically categorize new transactions when they match your rules.',
    'Add rule',
  ],
  recurring: [
    'Recurring transactions',
    'Create monthly transactions automatically on their due date.',
    'Add recurring',
  ],
} as const

export function SettingsSkeleton({
  filters = true,
  section,
}: {
  filters?: boolean
  section?: SettingsSection
}) {
  const labels = section ? sectionLabels[section] : undefined
  return (
    <Stack gap="md">
      <Group align="flex-start" justify="space-between" gap="md" wrap="wrap">
        <Box className={toolbarStyles.heading}>
          {labels ? (
            <>
              <Text fw={700} size="lg">
                {labels[0]}
              </Text>
              <Text c="dimmed" size="sm">
                {labels[1]}
              </Text>
            </>
          ) : (
            <Stack gap={8}>
              <Skeleton h={22} w="35%" />
              <Skeleton h={14} w="65%" />
            </Stack>
          )}
        </Box>
        <Group
          className={`${toolbarStyles.actions} ${styles.settingsActions}`}
          gap="xs"
          wrap="wrap"
        >
          <Skeleton h={42} w={section === 'categories' ? 167 : 127} />
          {section === 'categorization' && <Skeleton h={42} w={147} />}
        </Group>
      </Group>
      {filters && (
        <Group gap="xs" wrap="wrap">
          <Skeleton
            className={styles.settingsInput}
            style={{ flex: '1 1 240px', minWidth: 0 }}
          />
          <Checkbox disabled label="Archived only" style={{ flexShrink: 0 }} />
          {section === 'categories' && (
            <>
              <Skeleton
                className={styles.desktopCategoryFilter}
                h={42}
                w={220}
              />
              <Skeleton
                className={styles.compactCategoryFilter}
                h={48}
                w={48}
              />
            </>
          )}
        </Group>
      )}
      {section === 'categories' ? (
        <CategoriesTableSkeleton />
      ) : (
        <TableSkeleton rows={4} />
      )}
    </Stack>
  )
}

export function AccountsSkeleton() {
  return (
    <Stack gap="lg">
      {[0, 1].map((index) => (
        <Paper withBorder radius="md" p="md" key={index}>
          <Skeleton h={22} w={180} mb="md" />
          <RowSkeleton rows={2} />
        </Paper>
      ))}
    </Stack>
  )
}

export function AnalysisSkeleton() {
  return (
    <Stack gap="lg">
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" wrap="wrap" gap="md" mb="sm">
          <Group gap="lg">
            {['Inflows', 'Outflows'].map((label) => (
              <Group gap={6} key={label}>
                <Skeleton circle h={16} w={16} />
                <Text size="sm" c="dimmed" fw={500}>
                  {label}
                </Text>
                <Skeleton h={25} w={64} />
              </Group>
            ))}
          </Group>
          <Group gap={6}>
            <Text size="sm" c="dimmed" fw={500}>
              Net
            </Text>
            <Skeleton h={25} w={64} />
          </Group>
        </Group>
        <Skeleton h={8} radius="xl" />
      </Paper>
      <Grid>
        {[0, 1].map((index) => (
          <Grid.Col span={{ base: 12, md: 6 }} key={index}>
            <Paper withBorder p="lg" radius="md">
              <Group justify="space-between" mb="md">
                <Skeleton h={25} w="35%" />
                <Skeleton h={25} w={64} />
              </Group>
              <Grid gutter="lg" align="center">
                <Grid.Col span={{ base: 12, sm: 4 }}>
                  <Group justify="center">
                    <Skeleton circle h={160} w={160} />
                  </Group>
                </Grid.Col>
                <Grid.Col span={{ base: 12, sm: 8 }}>
                  <Stack gap={4}>
                    {[0, 1, 2].map((row) => (
                      <Group key={row} py={6} px="xs" wrap="nowrap">
                        <Skeleton circle h={10} w={10} />
                        <Skeleton h={22} flex={1} />
                        <Skeleton h={22} w={56} />
                      </Group>
                    ))}
                  </Stack>
                </Grid.Col>
              </Grid>
            </Paper>
          </Grid.Col>
        ))}
      </Grid>
    </Stack>
  )
}

export function AccountDetailsSkeleton({
  account,
  section,
}: {
  account?: AccountSummaryData
  section?: string
}) {
  const investment =
    account?.type === 'investment' || account?.type === 'brokerage'
  const selected = section ?? (investment ? 'holdings' : 'overview')
  const convertedBalance =
    account?.valuationMode !== 'holdings' &&
    account?.convertedEffectiveBalance &&
    account.effectiveBalance.money.currency !==
      account.convertedEffectiveBalance.money.currency
  const labels = [
    'Overview',
    ...(investment
      ? [
          'Holdings',
          ...(account.valuationMode !== 'holdings' ? ['Activity'] : []),
        ]
      : []),
    'History',
  ]
  return (
    <Stack gap="md" className={accountStyles.detailsBody}>
      <Group
        justify="space-between"
        wrap="nowrap"
        className={accountStyles.balanceRow}
        data-converted={Boolean(convertedBalance)}
      >
        <Text c="dimmed">Current balance</Text>
        <Group justify="flex-end" className={accountStyles.balanceValue}>
          <Skeleton h={20} w={120} />
        </Group>
      </Group>
      <div>
        <Group
          gap={0}
          h={44}
          style={{
            borderBottom: '2px solid var(--mantine-color-default-border)',
          }}
        >
          {labels.map((label) => (
            <Text key={label} size="sm" ta="center" flex={1}>
              {label}
            </Text>
          ))}
        </Group>
        <Box pt="md">
          {selected === 'overview' ? (
            <Stack gap="md">
              {account?.institutionName && (
                <Group justify="space-between">
                  <Text c="dimmed" size="sm">
                    Institution
                  </Text>
                  <Skeleton h={14} w={120} />
                </Group>
              )}
              {account?.syncedAt && (
                <Group justify="space-between">
                  <Text c="dimmed" size="sm">
                    Last synced
                  </Text>
                  <Skeleton h={14} w={120} />
                </Group>
              )}
              <Group justify="space-between">
                <Text size="sm" fw={500}>
                  Notes
                </Text>
                <Button disabled size="compact-md" variant="subtle">
                  <Skeleton h={14} w={82} />
                </Button>
              </Group>
            </Stack>
          ) : selected === 'history' ? (
            <>
              <Text fw={500} mb="sm">
                Balance history
              </Text>
              <ChartSkeleton height={200} />
            </>
          ) : (
            <>
              <Group justify="space-between" mb="sm" mih={44}>
                <Skeleton h={14} w={150} />
                <Skeleton h={34} w={72} />
              </Group>
              <Box className={accountStyles.holdingsRegion}>
                <TableSkeleton rows={1} />
              </Box>
            </>
          )}
        </Box>
      </div>
    </Stack>
  )
}

export function AccessTokensSkeleton() {
  return (
    <Paper withBorder p="lg" radius="md">
      <Stack gap="lg">
        <Stack gap={4}>
          <Skeleton h={29} w="45%" />
          <Skeleton h={21} w="80%" />
        </Stack>
        <Stack gap="sm">
          <Stack gap={4}>
            <Skeleton h={20} w={100} />
            <Skeleton h={17} w="65%" />
            <Skeleton h={42} />
          </Stack>
          <Group>
            <Skeleton h={42} w={130} />
            <Skeleton h={18} w={200} />
          </Group>
        </Stack>
        <Stack gap="sm">
          <Skeleton h={25} w={130} />
          <RowSkeleton rows={2} />
        </Stack>
      </Stack>
    </Paper>
  )
}

export function CategoriesTableSkeleton() {
  return (
    <Stack gap="xs">
      <Box className={styles.compactCategorySelection}>
        <Checkbox disabled label="Select all visible categories" />
      </Box>
      <TableSkeleton rows={4} />
    </Stack>
  )
}
