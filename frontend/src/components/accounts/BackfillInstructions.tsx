import { Text } from '@mantine/core'

/** Static guidance is available before the CSV editor module loads. */
export function BackfillInstructions() {
  return (
    <>
      <Text data-typography="bodySmall">
        Download the template CSV, which contains your current accounts. Fill in
        the balances for each date you want to record.
      </Text>
      <Text data-typography="metadata" component="div" c="dimmed">
        Format rules:
        <ul>
          <li>Dates in header: YYYY-MM-DD</li>
          <li>Positive values for assets, negative for liabilities</li>
          <li>Leave cells empty to skip</li>
        </ul>
      </Text>
    </>
  )
}

export const BACKFILL_TITLE = 'Manual backfill via CSV'
