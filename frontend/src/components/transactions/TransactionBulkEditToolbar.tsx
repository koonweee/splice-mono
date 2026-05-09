import {
  ActionIcon,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Text,
} from '@mantine/core'
import { Save } from 'lucide-react'
import { CategorySelect } from '../categories/CategorySelect'
import styles from './TransactionBulkEditToolbar.module.css'
import type { CategorySelectOption } from '../categories/CategorySelect'

type TransactionBulkEditToolbarVariant = 'floating' | 'inline' | 'summary'

type TransactionBulkEditToolbarProps = {
  categoryOptions: Array<CategorySelectOption>
  isSaving: boolean
  loadedCount: number
  selectedCount: number
  selectLoadedChecked: boolean
  selectLoadedIndeterminate: boolean
  value: string | null
  onChange: (value: string | null) => void
  onSave: () => void
  onToggleLoaded: () => void
  showSelectLoaded?: boolean
  variant?: TransactionBulkEditToolbarVariant
}

export function TransactionBulkEditToolbar({
  categoryOptions,
  isSaving,
  loadedCount,
  selectedCount,
  selectLoadedChecked,
  selectLoadedIndeterminate,
  value,
  onChange,
  onSave,
  onToggleLoaded,
  showSelectLoaded = true,
  variant = 'floating',
}: TransactionBulkEditToolbarProps) {
  const checkbox = showSelectLoaded ? (
    <Checkbox
      checked={selectLoadedChecked}
      disabled={loadedCount === 0}
      indeterminate={selectLoadedIndeterminate}
      label={`${selectedCount} selected`}
      onChange={onToggleLoaded}
      size="md"
    />
  ) : (
    <Text className={styles.selectedCount} fw={600} size="sm">
      {selectedCount} selected
    </Text>
  )
  const categorySelect = (
    <CategorySelect
      aria-label="Bulk category"
      className={styles.categorySelect}
      data={categoryOptions}
      onChange={onChange}
      placeholder="Category"
      searchable
      size="md"
      value={value}
    />
  )
  const saveDisabled = selectedCount === 0 || value === null

  if (variant === 'inline') {
    return (
      <Stack className={styles.inlineToolbar} gap="xs">
        <Group gap="xs">{checkbox}</Group>
        <Group className={styles.inlineEditRow} gap="xs" wrap="nowrap">
          {categorySelect}
          <ActionIcon
            aria-label="Save"
            className={styles.inlineSaveButton}
            disabled={saveDisabled}
            loading={isSaving}
            onClick={onSave}
            size={48}
            variant="default"
          >
            <Save size={20} />
          </ActionIcon>
        </Group>
      </Stack>
    )
  }

  if (variant === 'summary') {
    return (
      <Group className={styles.summaryEdit} gap="xs" wrap="nowrap">
        {categorySelect}
        <ActionIcon
          aria-label="Save"
          className={styles.summarySaveButton}
          disabled={saveDisabled}
          loading={isSaving}
          onClick={onSave}
          size={42}
          variant="default"
        >
          <Save size={18} />
        </ActionIcon>
      </Group>
    )
  }

  return (
    <div className={styles.toolbarWrap}>
      <Paper className={styles.toolbar} p="sm" radius="md" withBorder>
        <Group align="center" className={styles.toolbarContent} gap="md">
          {checkbox}
          {categorySelect}
          <Button
            className={styles.saveButton}
            leftSection={<Save size={16} />}
            loading={isSaving}
            onClick={onSave}
            disabled={saveDisabled}
          >
            Save
          </Button>
        </Group>
      </Paper>
    </div>
  )
}
