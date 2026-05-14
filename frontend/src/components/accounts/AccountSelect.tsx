import { ActionIcon, Select } from '@mantine/core'
import { X } from 'lucide-react'
import type { SelectProps } from '@mantine/core'
import type { MouseEvent } from 'react'

export type AccountSelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type AccountSelectProps = Omit<SelectProps, 'clearable' | 'data'> & {
  data: Array<AccountSelectOption>
  clearable?: boolean
}

export function AccountSelect({
  clearable = true,
  clearButtonProps,
  disabled,
  onChange,
  onClear,
  readOnly,
  rightSection,
  value,
  ...props
}: AccountSelectProps) {
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
        'aria-label': 'Clear account',
        ...clearButtonProps,
      }}
      disabled={disabled}
      onChange={onChange}
      readOnly={readOnly}
      rightSection={
        showClearButton ? (
          <ActionIcon
            aria-label="Clear account"
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
      value={value}
      {...props}
    />
  )
}
