import {
  ActionIcon,
  Box,
  Button,
  Popover,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core'
import { DatePicker } from '@mantine/dates'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import dayjs from 'dayjs'
import { X } from 'lucide-react'
import type { DatesRangeValue } from '@mantine/dates'

type DateRangeControlProps = {
  clearable?: boolean
  onChange: (range: DatesRangeValue) => void
  value: DatesRangeValue
  width?: number
}

const monthPresetOptions = [
  { label: 'Last', value: 'last' },
  { label: 'This', value: 'this' },
]

const mobileSegmentedControlStyles = {
  root: {
    minHeight: 48,
  },
  label: {
    alignItems: 'center',
    display: 'flex',
    fontSize: 16,
    justifyContent: 'center',
    minHeight: 44,
  },
}

function formatDateRangeLabel(value: DatesRangeValue) {
  const [start, end] = value

  if (start && end) {
    return `${dayjs(start).format('MMMM D, YYYY')} - ${dayjs(end).format('MMMM D, YYYY')}`
  }

  if (start) {
    return `${dayjs(start).format('MMMM D, YYYY')} -`
  }

  return 'Date range'
}

function getMonthPresetValue(value: DatesRangeValue) {
  const [start, end] = value
  if (!start || !end) {
    return ''
  }

  const normalizedStart = dayjs(start).format('YYYY-MM-DD')
  const normalizedEnd = dayjs(end).format('YYYY-MM-DD')
  const thisMonthStart = dayjs().startOf('month').format('YYYY-MM-DD')
  const today = dayjs().format('YYYY-MM-DD')
  const lastMonthStart = dayjs()
    .subtract(1, 'month')
    .startOf('month')
    .format('YYYY-MM-DD')
  const lastMonthEnd = dayjs()
    .subtract(1, 'month')
    .endOf('month')
    .format('YYYY-MM-DD')

  if (normalizedStart === thisMonthStart && normalizedEnd === today) {
    return 'this'
  }

  if (normalizedStart === lastMonthStart && normalizedEnd === lastMonthEnd) {
    return 'last'
  }

  return ''
}

export function DateRangeControl({
  clearable = true,
  onChange,
  value,
  width = 300,
}: DateRangeControlProps) {
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [opened, { close, toggle }] = useDisclosure(false)
  const hasValue = value[0] !== null || value[1] !== null
  const pickerValue: [string | null, string | null] = [
    value[0] ? dayjs(value[0]).format('YYYY-MM-DD') : null,
    value[1] ? dayjs(value[1]).format('YYYY-MM-DD') : null,
  ]

  const selectMonthPreset = (preset: string) => {
    if (preset === 'this') {
      onChange([
        dayjs().startOf('month').format('YYYY-MM-DD'),
        dayjs().format('YYYY-MM-DD'),
      ])
      close()
    } else if (preset === 'last') {
      onChange([
        dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
        dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
      ])
      close()
    }
  }

  return (
    <Popover
      opened={opened}
      onChange={(nextOpened) => {
        if (!nextOpened) {
          close()
        }
      }}
      position="bottom-start"
      shadow="md"
      withinPortal={false}
    >
      <Popover.Target>
        <Box
          flex={isMobile ? 1 : undefined}
          maw={isMobile ? 'calc(100vw - 88px)' : undefined}
          miw={0}
          pos="relative"
          w={isMobile ? undefined : width}
        >
          <Button
            aria-label="Choose date range"
            fullWidth
            justify="space-between"
            mih={isMobile ? 48 : undefined}
            miw={0}
            onClick={toggle}
            rightSection={clearable && hasValue ? <Box w={24} /> : null}
            size="md"
            variant="default"
          >
            <Text component="span" truncate>
              {formatDateRangeLabel(value)}
            </Text>
          </Button>
          {clearable && hasValue && (
            <ActionIcon
              aria-label="Clear date range"
              onClick={(event) => {
                event.stopPropagation()
                onChange([null, null])
              }}
              pos="absolute"
              right={4}
              size={isMobile ? 40 : 34}
              top={4}
              variant="subtle"
            >
              <X size={18} />
            </ActionIcon>
          )}
        </Box>
      </Popover.Target>
      <Popover.Dropdown p="md">
        <Stack gap="sm">
          <DatePicker
            type="range"
            value={pickerValue}
            onChange={onChange}
            maxDate={dayjs().format('YYYY-MM-DD')}
          />
          <SegmentedControl
            value={getMonthPresetValue(value)}
            onChange={selectMonthPreset}
            fullWidth
            size={isMobile ? 'md' : 'sm'}
            data={monthPresetOptions}
            styles={isMobile ? mobileSegmentedControlStyles : undefined}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
