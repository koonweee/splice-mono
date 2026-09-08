import { Checkbox } from '@mantine/core'

export function SettingsArchiveFilter({
  checked,
  disabled,
  onChange,
}: {
  disabled?: boolean
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Checkbox
      disabled={disabled}
      label="Archived only"
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
      style={{ flexShrink: 0 }}
    />
  )
}
