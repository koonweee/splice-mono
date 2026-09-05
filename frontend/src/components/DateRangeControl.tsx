import {
  ActionIcon,
  Box,
  Button,
  Drawer,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { DatePicker } from '@mantine/dates'
import { useDisclosure, useMediaQuery } from '@mantine/hooks'
import dayjs from 'dayjs'
import { X } from 'lucide-react'
import { useId } from 'react'
import { formatDateRangeLabel } from '../lib/date-range'
import type { DatesRangeValue } from '@mantine/dates'

type DateRangeControlProps = {
  clearable?: boolean
  onChange: (range: DatesRangeValue) => void
  value: DatesRangeValue
  width?: number
}

function getMonthPresetOptions() {
  const today = dayjs()
  const previousMonths = [
    today.subtract(2, 'month'),
    today.subtract(1, 'month'),
  ]

  return [
    ...previousMonths.map((month) => ({
      label: month.format('MMM'),
      value: `${month.format('YYYY-MM')}`,
      range: [
        month.startOf('month').format('YYYY-MM-DD'),
        month.endOf('month').format('YYYY-MM-DD'),
      ] satisfies DatesRangeValue,
    })),
    {
      label: 'MTD',
      value: 'mtd',
      range: [
        today.startOf('month').format('YYYY-MM-DD'),
        today.format('YYYY-MM-DD'),
      ] satisfies DatesRangeValue,
    },
    {
      label: 'YTD',
      value: 'ytd',
      range: [
        today.startOf('year').format('YYYY-MM-DD'),
        today.format('YYYY-MM-DD'),
      ] satisfies DatesRangeValue,
    },
  ]
}

function DateRangePresets({
  onChange,
}: Pick<DateRangeControlProps, 'onChange'>) {
  return (
    <Group gap="xs" grow>
      {getMonthPresetOptions().map((preset) => (
        <Button
          key={preset.value}
          onClick={() => onChange(preset.range)}
          size="md"
          variant="light"
        >
          {preset.label}
        </Button>
      ))}
    </Group>
  )
}

export function DateRangeFields({
  onChange,
  onPresetSelect,
  value,
}: Pick<DateRangeControlProps, 'onChange' | 'value'> & {
  onPresetSelect?: () => void
}) {
  const pickerValue: [string | null, string | null] = [
    value[0] ? dayjs(value[0]).format('YYYY-MM-DD') : null,
    value[1] ? dayjs(value[1]).format('YYYY-MM-DD') : null,
  ]
  const today = dayjs().format('YYYY-MM-DD')

  function updateStartDate(startDate: string | null) {
    const endDate =
      startDate && pickerValue[1] && dayjs(startDate).isAfter(pickerValue[1])
        ? startDate
        : pickerValue[1]

    onChange([startDate, endDate])
  }

  function updateEndDate(endDate: string | null) {
    const startDate =
      endDate && pickerValue[0] && dayjs(endDate).isBefore(pickerValue[0])
        ? endDate
        : pickerValue[0]

    onChange([startDate, endDate])
  }

  return (
    <Stack gap="sm">
      <Group gap="sm" grow wrap="nowrap" align="flex-start">
        <TextInput
          label="Start"
          max={pickerValue[1] ?? today}
          miw={0}
          onChange={(event) =>
            updateStartDate(event.currentTarget.value || null)
          }
          size="md"
          type="date"
          value={pickerValue[0] ?? ''}
        />
        <TextInput
          label="End"
          max={today}
          min={pickerValue[0] ?? undefined}
          miw={0}
          onChange={(event) => updateEndDate(event.currentTarget.value || null)}
          size="md"
          type="date"
          value={pickerValue[1] ?? ''}
        />
      </Group>
      <DateRangePresets
        onChange={(range) => {
          onChange(range)
          onPresetSelect?.()
        }}
      />
    </Stack>
  )
}

export function DateRangeControl({
  clearable = true,
  onChange,
  value,
  width = 300,
}: DateRangeControlProps) {
  const isMobile = useMediaQuery('(max-width: 48em)')
  const [opened, { close, toggle }] = useDisclosure(false)
  const dropdownId = useId()
  const hasValue = value[0] !== null || value[1] !== null
  const pickerValue: [string | null, string | null] = [
    value[0] ? dayjs(value[0]).format('YYYY-MM-DD') : null,
    value[1] ? dayjs(value[1]).format('YYYY-MM-DD') : null,
  ]
  const today = dayjs().format('YYYY-MM-DD')

  const trigger = (
    <Box
      flex={isMobile ? 1 : undefined}
      maw={isMobile ? 'calc(100vw - 88px)' : undefined}
      miw={0}
      pos="relative"
      w={isMobile ? undefined : width}
    >
      <Button
        aria-label="Choose date range"
        aria-haspopup="dialog"
        aria-expanded={opened}
        aria-controls={opened && !isMobile ? dropdownId : undefined}
        fullWidth
        h="auto"
        justify="space-between"
        mih={isMobile ? 48 : undefined}
        miw={0}
        onClick={toggle}
        py="xs"
        rightSection={clearable && hasValue ? <Box w={24} /> : null}
        size="md"
        variant="default"
      >
        <Text component="span" size="sm" style={{ whiteSpace: 'normal' }}>
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
          top="50%"
          style={{ transform: 'translateY(-50%)' }}
          variant="subtle"
        >
          <X size={18} />
        </ActionIcon>
      )}
    </Box>
  )

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer
          opened={opened}
          onClose={close}
          position="bottom"
          size="min(300px, 80dvh)"
          title="Date range"
          padding="md"
        >
          <DateRangeFields
            onChange={onChange}
            onPresetSelect={close}
            value={value}
          />
        </Drawer>
      </>
    )
  }

  return (
    <Popover
      withRoles={false}
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
      <Popover.Target>{trigger}</Popover.Target>
      <Popover.Dropdown
        id={dropdownId}
        role="dialog"
        aria-label="Date range"
        p="md"
      >
        <Stack gap="sm">
          <DatePicker
            type="range"
            value={pickerValue}
            onChange={onChange}
            maxDate={today}
          />
          <DateRangePresets
            onChange={(range) => {
              onChange(range)
              close()
            }}
          />
        </Stack>
      </Popover.Dropdown>
    </Popover>
  )
}
