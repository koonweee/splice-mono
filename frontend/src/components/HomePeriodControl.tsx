import { Button, Group, Menu } from '@mantine/core'
import { Check, ChevronDown } from 'lucide-react'
import { TIME_PERIOD_LABELS, TimePeriod } from '../lib/types'

const shortcuts = [
  { value: TimePeriod.day, label: 'D' },
  { value: TimePeriod.week, label: 'W' },
  { value: TimePeriod.month, label: 'M' },
  { value: TimePeriod.year, label: 'Y' },
]
const more = [TimePeriod.threeYears, TimePeriod.tenYears, TimePeriod.all]

export function HomePeriodControl({
  period,
  onChange,
}: {
  period: TimePeriod
  onChange: (period: TimePeriod) => void
}) {
  const extended = !shortcuts.some((item) => item.value === period)
  return (
    <Group
      justify="center"
      gap={4}
      h={50}
      role="group"
      aria-label="Comparison period"
    >
      {shortcuts.map(({ value, label }) => (
        <Button
          key={value}
          variant={period === value ? 'light' : 'subtle'}
          color={period === value ? undefined : 'gray'}
          radius="xl"
          size="sm"
          miw={52}
          h={34}
          px="sm"
          aria-label={TIME_PERIOD_LABELS[value]}
          aria-pressed={period === value}
          onClick={() => onChange(value)}
        >
          {label}
        </Button>
      ))}
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <Button
            variant={extended ? 'light' : 'subtle'}
            color={extended ? undefined : 'gray'}
            radius="xl"
            size="sm"
            miw={52}
            h={34}
            px="sm"
            aria-label={
              extended
                ? `More periods, selected ${TIME_PERIOD_LABELS[period]}`
                : 'More periods'
            }
          >
            {extended && TIME_PERIOD_LABELS[period]}
            <ChevronDown size={16} />
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {more.map((value) => (
            <Menu.Item
              key={value}
              onClick={() => onChange(value)}
              rightSection={period === value ? <Check size={14} /> : undefined}
            >
              {TIME_PERIOD_LABELS[value]}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
