import { Select, Tabs } from '@mantine/core'
import { useCompactLayout } from '../lib/responsive'
import { ResponsiveSlot } from './ResponsiveSlot'
import type { ReactNode } from 'react'

export function PageNavigation({
  value,
  onChange,
  items,
  children,
  label = 'Page section',
}: {
  value: string
  onChange: (value: string) => void
  items: Array<{ value: string; label: string }>
  children?: ReactNode
  label?: string
}) {
  const compact = useCompactLayout()
  return (
    <>
      <ResponsiveSlot compact={compact} variant="compact">
        <Select
          aria-label={label}
          data={items}
          value={value}
          onChange={(next) => {
            if (next) onChange(next)
          }}
          allowDeselect={false}
        />
      </ResponsiveSlot>
      <ResponsiveSlot compact={compact} variant="wide">
        {children ?? (
          <Tabs
            value={value}
            onChange={(next) => {
              if (next) onChange(next)
            }}
          >
            <Tabs.List>
              {items.map((item) => (
                <Tabs.Tab key={item.value} value={item.value}>
                  {item.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
        )}
      </ResponsiveSlot>
    </>
  )
}
