import { ActionIcon, Box, Group, Select, Stack, Text } from '@mantine/core'
import { X } from 'lucide-react'
import { getCategoryColorStyles } from '../../lib/category-colors'
import styles from './CategorySelect.module.css'
import type { SelectProps } from '@mantine/core'
import type { MouseEvent } from 'react'

export type CategorySelectOption = {
  value: string
  primary: string
  secondary: string
  color?: string
  disabled?: boolean
}

type CategorySelectProps = Omit<
  SelectProps,
  'clearable' | 'data' | 'renderOption' | 'searchable'
> & {
  data: Array<CategorySelectOption>
  clearable?: boolean
  searchable?: boolean
}

export function CategorySelect({
  data,
  clearable = true,
  clearButtonProps,
  disabled,
  searchable = true,
  nothingFoundMessage = 'No categories found',
  onChange,
  onClear,
  readOnly,
  rightSection,
  value,
  ...props
}: CategorySelectProps) {
  const optionByValue = new Map(data.map((option) => [option.value, option]))
  const hasValue = value !== null && value !== undefined && value !== ''
  const showClearButton = clearable && hasValue && !disabled && !readOnly

  function handleClear(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    onClear?.()
    onChange?.(null, null as never)
  }

  return (
    <Select
      clearable={false}
      clearButtonProps={{
        'aria-label': 'Clear category',
        ...clearButtonProps,
      }}
      data={data.map((option) => ({
        value: option.value,
        label: `${option.secondary} - ${option.primary}`,
        disabled: option.disabled,
      }))}
      nothingFoundMessage={nothingFoundMessage}
      onChange={onChange}
      renderOption={({ option }) => {
        const categoryOption = optionByValue.get(option.value)

        if (!categoryOption) {
          return option.label
        }

        return (
          <Group className={styles.option} gap="xs" wrap="nowrap">
            <Box
              aria-hidden="true"
              className={styles.swatch}
              style={getCategoryColorStyles(categoryOption.color ?? '')}
            />
            <Stack className={styles.optionText} gap={2}>
              <Text className={styles.label} size="sm">
                {categoryOption.secondary}
              </Text>
              <Text className={styles.meta} size="xs">
                {categoryOption.primary}
              </Text>
            </Stack>
          </Group>
        )
      }}
      rightSection={
        showClearButton ? (
          <ActionIcon
            aria-label="Clear category"
            onClick={handleClear}
            size="sm"
            variant="subtle"
          >
            <X size={16} />
          </ActionIcon>
        ) : (
          rightSection
        )
      }
      rightSectionPointerEvents={showClearButton ? 'all' : undefined}
      searchable={searchable}
      value={value}
      disabled={disabled}
      readOnly={readOnly}
      {...props}
    />
  )
}
