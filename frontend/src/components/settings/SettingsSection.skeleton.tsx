import { ActionIcon, Select, Stack, TextInput } from '@mantine/core'
import { Filter, Plus, Sparkles } from 'lucide-react'
import { useCompactLayout } from '../../lib/responsive'
import { PageActions } from '../PageActions'
import { ResponsiveSlot } from '../ResponsiveSlot'
import { SettingsFiltersFrame } from './SettingsFiltersFrame'
import { SettingsToolbar } from './SettingsToolbar'
import { SettingsArchiveFilter } from './SettingsArchiveFilter'
import { AnalysisRulesSkeleton } from './AnalysisRulesSection.skeleton'
import { CategorizationRulesSkeleton } from './CategorizationRulesSection.skeleton'
import { CategoriesTableSkeleton } from './CustomCategoriesSection.skeleton'
import { RecurringTransactionsSkeleton } from './RecurringManualTransactionsSection.skeleton'

export const settingsSectionLabels = {
  categories: {
    title: 'Categories',
    description:
      'Organize your transactions with categories that make sense to you.',
    addLabel: 'Add category',
  },
  analysis: {
    title: 'Analysis rules',
    description: 'Choose which transactions count toward your analysis totals.',
    addLabel: 'Add rule',
  },
  categorization: {
    title: 'Categorization rules',
    description:
      'Automatically categorize new transactions when they match your rules.',
    addLabel: 'Add rule',
  },
  recurring: {
    title: 'Recurring transactions',
    description: 'Create monthly transactions automatically on their due date.',
    addLabel: 'Add recurring',
  },
} as const
export type SettingsSection = keyof typeof settingsSectionLabels

export function SettingsSectionSkeleton({
  section,
}: {
  section: SettingsSection
}) {
  return (
    <Stack gap="md" style={{ flex: '1 1 auto', minHeight: 0 }}>
      <SettingsToolbar
        {...settingsSectionLabels[section]}
        disabled
        onAdd={() => {}}
        secondary={
          section === 'categorization'
            ? [
                {
                  id: 'suggestions',
                  label: 'Rule recommendations',
                  icon: Sparkles,
                  disabled: true,
                  onClick: () => {},
                },
              ]
            : undefined
        }
      />
      <SettingsSectionFilters section={section} />
      {section === 'categories' ? (
        <CategoriesTableSkeleton />
      ) : section === 'analysis' ? (
        <AnalysisRulesSkeleton />
      ) : section === 'categorization' ? (
        <CategorizationRulesSkeleton />
      ) : (
        <RecurringTransactionsSkeleton />
      )}
    </Stack>
  )
}

export function SettingsSectionFilters({
  section,
  inline = false,
}: {
  section: SettingsSection
  inline?: boolean
}) {
  const compact = useCompactLayout()
  if (section === 'recurring') return null
  return (
    <SettingsFiltersFrame inline={inline} categories={section === 'categories'}>
      <TextInput
        disabled
        aria-label={`Search ${section === 'categories' ? 'categories' : `${section} rules`}`}
        placeholder={
          section === 'categories' ? 'Search categories...' : 'Search rules...'
        }
        size="md"
        style={{ flex: '1 1 240px', minWidth: 0 }}
      />
      <SettingsArchiveFilter disabled checked={false} onChange={() => {}} />
      {section === 'categories' && (
        <>
          <ResponsiveSlot compact={compact} variant="compact">
            <ActionIcon
              disabled
              aria-label="Filter categories"
              variant="default"
              size={48}
            >
              <Filter size={20} />
            </ActionIcon>
          </ResponsiveSlot>
          <ResponsiveSlot compact={compact} variant="wide">
            <Select
              disabled
              aria-label="Primary category"
              placeholder="Primary category"
              size="md"
              w={220}
              data={[]}
            />
          </ResponsiveSlot>
        </>
      )}
    </SettingsFiltersFrame>
  )
}
export function SettingsSectionActions({
  section,
}: {
  section: SettingsSection
}) {
  return (
    <PageActions
      primary={{
        id: 'add-section',
        label: settingsSectionLabels[section].addLabel,
        icon: Plus,
        disabled: true,
        onClick: () => {},
      }}
      secondary={
        section === 'categorization'
          ? [
              {
                id: 'suggestions',
                label: 'Rule recommendations',
                icon: Sparkles,
                disabled: true,
                onClick: () => {},
              },
            ]
          : undefined
      }
    />
  )
}
