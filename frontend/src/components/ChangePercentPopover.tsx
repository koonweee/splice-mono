import { Popover, Text } from '@mantine/core'
import { useState } from 'react'
import {
  HIDDEN_BALANCE_PLACEHOLDER,
  formatMoneyWithSign,
  formatPercent,
} from '../lib/format'
import { MoneyWithSignSign } from '../api/models'
import type { MoneyWithSign } from '../api/models'

function formatChangeAmount(changeAmount: MoneyWithSign): string {
  const formattedAmount = formatMoneyWithSign({ value: changeAmount })
  return changeAmount.sign === MoneyWithSignSign.positive
    ? `+${formattedAmount}`
    : formattedAmount
}

export function ChangePercentPopover({
  changeAmount,
  changePercent,
  color,
  hidden = false,
  size = 'xs',
  testId,
}: {
  changeAmount?: MoneyWithSign
  changePercent?: number
  color: string
  hidden?: boolean
  size?: 'xs' | 'sm'
  testId?: string
}) {
  const [opened, setOpened] = useState(false)
  const percent = formatPercent(changePercent)

  if (!percent) return null

  const amount = hidden
    ? HIDDEN_BALANCE_PLACEHOLDER
    : changeAmount
      ? formatChangeAmount(changeAmount)
      : undefined

  if (!amount) {
    return (
      <Text size={size} c={color} data-testid={testId}>
        {percent}
      </Text>
    )
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="top"
      withArrow
      shadow="md"
      offset={6}
      withinPortal
    >
      <Popover.Target>
        <Text
          component="span"
          role="button"
          tabIndex={0}
          size={size}
          c={color}
          data-testid={testId}
          aria-label={`Show absolute change ${amount}`}
          onBlur={() => setOpened(false)}
          onClick={(event) => {
            event.stopPropagation()
            setOpened((current) => !current)
          }}
          onFocus={() => setOpened(true)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            setOpened((current) => !current)
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseEnter={() => setOpened(true)}
          onMouseLeave={() => setOpened(false)}
          onTouchStart={(event) => event.stopPropagation()}
          style={{
            borderRadius: 4,
            cursor: 'pointer',
            display: 'block',
            textDecoration: opened ? 'underline dotted' : undefined,
            textUnderlineOffset: 3,
          }}
        >
          {percent}
        </Text>
      </Popover.Target>
      <Popover.Dropdown px="xs" py={4}>
        <Text size="xs" fw={600}>
          {amount}
        </Text>
      </Popover.Dropdown>
    </Popover>
  )
}
