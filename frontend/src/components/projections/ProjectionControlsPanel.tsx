import {
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
} from '@mantine/core'
import { formatMoneyNumber } from '../../lib/format'
import type {
  ProjectionControlSpec,
  ProjectionScenario,
} from '../../lib/projections/types'

function getControlValue(
  scenario: ProjectionScenario,
  control: ProjectionControlSpec,
): string | number | boolean {
  if (control.parameterPath === 'horizonYears') {
    return scenario.horizonYears
  }
  if (control.parameterPath === 'parameters.expectedAnnualReturn') {
    return scenario.parameters.expectedAnnualReturn
  }
  if (control.parameterPath === 'parameters.inflationRate') {
    return scenario.parameters.inflationRate
  }
  if (control.parameterPath === 'parameters.taxDragRate') {
    return scenario.parameters.taxDragRate
  }
  if (control.parameterPath === 'parameters.volatility') {
    return scenario.parameters.volatility
  }

  const contributionMatch = control.parameterPath.match(
    /^parameters\.annualContributions\.([^.]+)\.(amount|inflationAdjust)$/,
  )
  if (contributionMatch) {
    const [, id, field] = contributionMatch
    const contribution = scenario.parameters.annualContributions.find(
      (item) => item.id === id,
    )
    return field === 'amount'
      ? (contribution?.amount ?? 0)
      : Boolean(contribution?.inflationAdjust)
  }

  return ''
}

export function ProjectionControlsPanel({
  controls,
  disabled,
  onChange,
  scenario,
}: {
  controls: Array<ProjectionControlSpec>
  disabled: boolean
  onChange: (
    parameterPath: string,
    value: string | number | boolean,
  ) => void
  scenario: ProjectionScenario
}) {
  if (controls.length === 0) return null

  return (
    <Paper withBorder p="md" h="100%">
      <Text fw={700} mb="md">
        Assumptions & scenario controls
      </Text>
      <Stack gap="md">
        {controls.map((control) => {
          const value = getControlValue(scenario, control)

          if (control.kind === 'currencyAmount') {
            return (
              <NumberInput
                key={control.id}
                disabled={disabled}
                label={control.label}
                min={control.min}
                max={control.max}
                step={control.step}
                prefix={control.currency === 'USD' ? '$' : undefined}
                value={Number(value)}
                onChange={(nextValue) =>
                  onChange(control.parameterPath, Number(nextValue || 0))
                }
                description={`${formatMoneyNumber({
                  value: Number(value),
                  currency: control.currency,
                  decimals: 0,
                })}/yr`}
              />
            )
          }

          if (control.kind === 'percentageSlider') {
            return (
              <div key={control.id}>
                <Group justify="space-between" mb={4}>
                  <Text size="sm">{control.label}</Text>
                  <Text size="sm" c="teal" fw={600}>
                    {(Number(value) * 100).toFixed(1)}%
                  </Text>
                </Group>
                <Slider
                  disabled={disabled}
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={Number(value)}
                  onChangeEnd={(nextValue) =>
                    onChange(control.parameterPath, nextValue)
                  }
                  label={(nextValue) => `${(nextValue * 100).toFixed(1)}%`}
                />
              </div>
            )
          }

          if (control.kind === 'segmentedSelect') {
            return (
              <div key={control.id}>
                <Text size="sm" mb={6}>
                  {control.label}
                </Text>
                <SegmentedControl
                  disabled={disabled}
                  fullWidth
                  data={control.options.map((option) => ({
                    label: option.label,
                    value: String(option.value),
                  }))}
                  value={String(value)}
                  onChange={(nextValue) => {
                    const option = control.options.find(
                      (item) => String(item.value) === nextValue,
                    )
                    onChange(control.parameterPath, option?.value ?? nextValue)
                  }}
                />
              </div>
            )
          }

          return (
            <Switch
              key={control.id}
              checked={Boolean(value)}
              disabled={disabled}
              label={control.label}
              onChange={(event) =>
                onChange(control.parameterPath, event.currentTarget.checked)
              }
            />
          )
        })}
      </Stack>
    </Paper>
  )
}
