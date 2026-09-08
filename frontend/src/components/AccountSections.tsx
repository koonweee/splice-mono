import { Tabs } from '@mantine/core'

export function AccountSections({
  investment,
  holdingsValued,
  disabled = false,
}: {
  investment: boolean
  holdingsValued: boolean
  disabled?: boolean
}) {
  return (
    <Tabs.List aria-label="Account sections">
      <Tabs.Tab disabled={disabled} value="history">
        History
      </Tabs.Tab>
      <Tabs.Tab disabled={disabled} value="details">
        Details
      </Tabs.Tab>
      {investment && (
        <Tabs.Tab disabled={disabled} value="holdings">
          Holdings
        </Tabs.Tab>
      )}
      {investment && !holdingsValued && (
        <Tabs.Tab disabled={disabled} value="activity">
          Activity
        </Tabs.Tab>
      )}
    </Tabs.List>
  )
}
