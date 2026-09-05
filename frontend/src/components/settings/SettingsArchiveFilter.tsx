import { Checkbox } from '@mantine/core'

export function SettingsArchiveFilter({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Checkbox
      label="Archived only"
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
      style={{ flexShrink: 0 }}
    />
  )
}
