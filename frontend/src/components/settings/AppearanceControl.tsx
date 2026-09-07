import {
  Button,
  ColorInput,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useEffect, useId, useState } from 'react'
import {
  ACCENT_SWATCHES,
  DEFAULT_APPEARANCE,
} from '../../lib/design-system/appearance'
import styles from './AppearanceControl.module.css'
import type { AppearancePreference } from '../../lib/design-system/appearance'

export function AppearanceControl({
  value,
  onChange,
  disabled,
  onValidityChange,
  resetVersion,
}: {
  value: AppearancePreference
  onChange: (value: AppearancePreference) => void
  disabled?: boolean
  resetVersion?: number
  onValidityChange?: (valid: boolean) => void
}) {
  const radioName = useId()
  const [custom, setCustom] = useState(
    value.accent ?? DEFAULT_APPEARANCE.accent ?? '',
  )
  useEffect(() => {
    setCustom(value.accent ?? DEFAULT_APPEARANCE.accent ?? '')
    onValidityChange?.(true)
  }, [value.accent, onValidityChange, resetVersion])
  const valid = /^#[0-9a-f]{6}$/i.test(custom)
  return (
    <Stack gap="sm">
      <SegmentedControl
        aria-label="Appearance mode"
        fullWidth
        disabled={disabled}
        value={value.mode}
        data={[
          { label: 'Light', value: 'light' },
          { label: 'Dark', value: 'dark' },
          { label: 'OLED', value: 'oled' },
        ]}
        onChange={(mode) => {
          if (mode === 'light' || mode === 'dark' || mode === 'oled')
            onChange({ ...value, mode })
        }}
      />
      <div role="radiogroup" aria-label="Accent">
        <Text size="sm" fw={500}>
          Accent
        </Text>
        <Group gap={6} mt={4}>
          {ACCENT_SWATCHES.map((swatch) => (
            <Tooltip key={swatch.label} label={swatch.label}>
              <label className={styles.swatch}>
                <input
                  type="radio"
                  name={radioName}
                  aria-label={swatch.label}
                  value={swatch.value ?? 'neutral'}
                  checked={value.accent === swatch.value}
                  disabled={disabled}
                  onChange={() => onChange({ ...value, accent: swatch.value })}
                />
                <span
                  aria-hidden
                  style={{
                    backgroundColor:
                      swatch.value ?? 'var(--mantine-color-dimmed)',
                  }}
                />
              </label>
            </Tooltip>
          ))}
        </Group>
      </div>
      <Group align="end" wrap="wrap">
        <ColorInput
          label="Custom accent"
          format="hex"
          withPicker
          eyeDropperButtonProps={{ 'aria-label': 'Pick color from screen' }}
          disabled={disabled}
          value={custom}
          error={
            !valid
              ? `Use a six-digit hex color, such as ${DEFAULT_APPEARANCE.accent}.`
              : undefined
          }
          onChange={(next) => {
            setCustom(next)
            const isValid = /^#[0-9a-f]{6}$/i.test(next)
            onValidityChange?.(isValid)
            if (isValid) onChange({ ...value, accent: next.toLowerCase() })
          }}
        />
        <Button
          variant="subtle"
          disabled={disabled}
          onClick={() => {
            setCustom(DEFAULT_APPEARANCE.accent ?? '')
            onValidityChange?.(true)
            onChange({ ...DEFAULT_APPEARANCE })
          }}
        >
          Reset appearance
        </Button>
      </Group>
    </Stack>
  )
}
