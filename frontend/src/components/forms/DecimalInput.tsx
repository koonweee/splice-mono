import { TextInput } from '@mantine/core'
import type { TextInputProps } from '@mantine/core'

/** Keep decimal drafts as text, including intermediate signs and trailing zeros. */
export function DecimalInput({
  value,
  onChange,
  ...props
}: Omit<TextInputProps, 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <TextInput
      {...props}
      inputMode="decimal"
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  )
}
