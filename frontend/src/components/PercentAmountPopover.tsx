import { Popover, Text } from '@mantine/core'
import { useState } from 'react'
import { useSupportsHover } from '../lib/responsive'

/** Shared hover/tap disclosure for percentage values and their exact amounts. */
export function PercentAmountPopover({
  percent,
  amount,
  label,
  color,
  textRole = 'caption',
  testId,
}: {
  percent: string
  amount?: string
  label: string
  color: string
  textRole?: 'caption' | 'metadata' | 'captionStrong'
  testId?: string
}) {
  const numericTextRole = {
    caption: 'numericCaption',
    captionStrong: 'numericCaptionStrong',
    metadata: 'numericMetadata',
  } as const
  const [opened, setOpened] = useState(false)
  const supportsHover = useSupportsHover()
  if (!amount) {
    return (
      <Text
        data-typography={numericTextRole[textRole]}
        c={color}
        data-testid={testId}
      >
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
          data-typography={numericTextRole[textRole]}
          component="span"
          role="button"
          className="splice-touch-target splice-change-trigger"
          tabIndex={0}
          c={color}
          data-testid={testId}
          aria-label={label}
          onBlur={() => setOpened(false)}
          onClick={(event) => {
            event.stopPropagation()
            setOpened(true)
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            event.stopPropagation()
            setOpened((current) => !current)
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onMouseEnter={supportsHover ? () => setOpened(true) : undefined}
          onMouseLeave={supportsHover ? () => setOpened(false) : undefined}
          onTouchStart={(event) => event.stopPropagation()}
          style={{
            borderRadius: 4,
            cursor: 'pointer',
            textDecoration: opened ? 'underline dotted' : undefined,
            textUnderlineOffset: 3,
          }}
        >
          {percent}
        </Text>
      </Popover.Target>
      <Popover.Dropdown px="xs" py={4}>
        <Text data-typography="numericCaptionStrong">{amount}</Text>
      </Popover.Dropdown>
    </Popover>
  )
}
