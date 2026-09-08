import { ActionIcon, Group, Menu, Tooltip } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { MoreHorizontal } from 'lucide-react'
import { useRef, useState } from 'react'
import { mediaQueries } from '../../lib/media-queries'
import { ResponsiveSlot } from '../ResponsiveSlot'
import tableChrome from '../MantineTableChrome.module.css'
import { settingsRowActionLayout } from './settings-row-action-layout'
import type { ComponentType } from 'react'

export type SettingsRowAction = {
  id: string
  label: string
  icon: ComponentType<{ size?: number }>
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  color?: string
  onPrepare?: () => void
}

/** One source of action behavior for desktop buttons and touch menus. */
export function SettingsRowActions({
  label,
  actions,
}: {
  label: string
  actions: Array<SettingsRowAction>
}) {
  const menuTrigger = useRef<HTMLButtonElement>(null)
  const [returnMenuFocus, setReturnMenuFocus] = useState(true)
  const touch = useMediaQuery(mediaQueries['--touch-controls'])
  if (!actions.length) return null
  const button = (action: SettingsRowAction) => {
    const Icon = action.icon
    return (
      <Tooltip key={action.id} label={action.label}>
        <ActionIcon
          variant="subtle"
          size={settingsRowActionLayout.size}
          aria-label={action.label}
          onClick={action.onClick}
          disabled={action.disabled}
          loading={action.loading}
          color={action.color}
          onPointerEnter={action.onPrepare}
          onFocus={action.onPrepare}
          onTouchStart={action.onPrepare}
        >
          <Icon size={20} />
        </ActionIcon>
      </Tooltip>
    )
  }
  return (
    <Group
      gap={settingsRowActionLayout.gap}
      wrap="nowrap"
      className={tableChrome.actions}
    >
      <ResponsiveSlot compact={touch} variant="wide" breakpoint="touch">
        {actions.map(button)}
      </ResponsiveSlot>
      <ResponsiveSlot compact={touch} variant="compact" breakpoint="touch">
        {actions.length === 1 ? (
          button(actions[0])
        ) : (
          <Menu
            withinPortal
            returnFocus={returnMenuFocus}
            onOpen={() => setReturnMenuFocus(true)}
            withInitialFocusPlaceholder={false}
            position="bottom-end"
          >
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                aria-label={label}
                ref={menuTrigger}
                loading={actions.some((action) => action.loading)}
              >
                <MoreHorizontal size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown
              onClickCapture={(event) => {
                if (
                  event.target instanceof Element &&
                  event.target.closest('[role="menuitem"]:not(:disabled)')
                ) {
                  // Give a newly opened editor a stable return target without the
                  // closing menu reclaiming focus from its form.
                  setReturnMenuFocus(false)
                  menuTrigger.current?.focus()
                }
              }}
            >
              {actions.map((action) => {
                const Icon = action.icon
                return (
                  <Menu.Item
                    key={action.id}
                    data-autofocus={
                      actions.find((item) => !item.disabled && !item.loading)
                        ?.id === action.id || undefined
                    }
                    leftSection={<Icon size={20} />}
                    onClick={action.onClick}
                    disabled={action.disabled || action.loading}
                    color={action.color}
                    onMouseEnter={action.onPrepare}
                    onFocus={action.onPrepare}
                  >
                    {action.label}
                  </Menu.Item>
                )
              })}
            </Menu.Dropdown>
          </Menu>
        )}
      </ResponsiveSlot>
    </Group>
  )
}
