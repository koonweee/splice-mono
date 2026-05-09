import { Button, Checkbox, Group, Paper, Select, Text } from '@mantine/core'
import { Save } from 'lucide-react'
import styles from './TransactionBulkEditToolbar.module.css'

type CategoryOption = {
  value: string
  label: string
  group?: string
}

type TransactionBulkEditToolbarProps = {
  categoryOptions: Array<CategoryOption>
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
}: TransactionBulkEditToolbarProps) {
  return (
    <div className={styles.toolbarWrap}>
      <Paper className={styles.toolbar} p="sm" radius="md" withBorder>
        <Group align="center" className={styles.toolbarContent} gap="md">
          <Text className={styles.selectedCount} fw={600} size="sm">
            {selectedCount} selected
          </Text>
          {showSelectLoaded && (
            <Checkbox
              checked={selectLoadedChecked}
              disabled={loadedCount === 0}
              indeterminate={selectLoadedIndeterminate}
              label="Select loaded"
              onChange={onToggleLoaded}
              size="md"
            />
          )}
          <Select
            aria-label="Bulk category"
            className={styles.categorySelect}
            data={categoryOptions}
            onChange={onChange}
            placeholder="Category"
            searchable
            size="md"
            value={value}
          />
          <Button
            className={styles.saveButton}
            leftSection={<Save size={16} />}
            loading={isSaving}
            onClick={onSave}
            disabled={selectedCount === 0 || value === null}
          >
            Save
          </Button>
        </Group>
      </Paper>
    </div>
  )
}
