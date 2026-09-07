import { ActionIcon, Button, Group, Menu, Tooltip } from '@mantine/core'
import { MoreHorizontal } from 'lucide-react'
import { useCompactLayout } from '../lib/responsive'
import { ResponsiveSlot } from './ResponsiveSlot'
import type { ComponentType } from 'react'

export type PageAction = {
  id: string
  label: string
  icon: ComponentType<{ size?: number }>
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  onPrepare?: () => void
}
export type PageActionSet = {
  primary?: PageAction
  secondary?: Array<PageAction>
}

/** Promote a lone overflow action; otherwise keep extra actions in More. */
export function PageActions({ primary, secondary = [] }: PageActionSet) {
  const compact = useCompactLayout()
  const actions = [...(primary ? [primary] : []), ...secondary]
  if (!actions.length) return null
  const render = (mobile: boolean) => {
    const limit = mobile ? 1 : 2
    const visibleCount = actions.length === limit + 1 ? actions.length : limit
    const visible = actions.slice(0, visibleCount)
    const overflow = actions.slice(visibleCount)
    return (
      <Group gap={4} wrap="nowrap" aria-label="Page actions">
        {visible.map((action) => {
          const Icon = action.icon
          const props = {
            onClick: action.onClick,
            disabled: action.disabled,
            loading: action.loading,
            onPointerEnter: action.onPrepare,
            onFocus: action.onPrepare,
            onTouchStart: action.onPrepare,
          }
          return mobile ? (
            <Tooltip key={action.id} label={action.label}>
              <ActionIcon
                {...props}
                aria-label={action.label}
                size={44}
                variant="subtle"
              >
                <Icon size={20} />
              </ActionIcon>
            </Tooltip>
          ) : (
            <Button
              key={action.id}
              {...props}
              variant="subtle"
              leftSection={<Icon size={18} />}
            >
              {action.label}
            </Button>
          )
        })}
        {overflow.length > 0 && (
          <Menu withinPortal position="bottom-end">
            <Menu.Target>
              <ActionIcon
                aria-label="More page actions"
                size={44}
                variant="subtle"
              >
                <MoreHorizontal size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {overflow.map((action) => {
                const Icon = action.icon
                return (
                  <Menu.Item
                    key={action.id}
                    leftSection={<Icon size={18} />}
                    disabled={action.disabled || action.loading}
                    onClick={action.onClick}
                    onMouseEnter={action.onPrepare}
                    onFocus={action.onPrepare}
                  >
                    {action.label}
                    {action.loading ? '…' : ''}
                  </Menu.Item>
                )
              })}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    )
  }
  return (
    <>
      <ResponsiveSlot compact={compact} variant="compact">
        {render(true)}
      </ResponsiveSlot>
      <ResponsiveSlot compact={compact} variant="wide">
        {render(false)}
      </ResponsiveSlot>
    </>
  )
}
