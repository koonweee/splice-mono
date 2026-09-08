import { Button, FileInput, Stack } from '@mantine/core'
import { IconUpload } from '@tabler/icons-react'
import { FormActions } from '../forms/FormActions'
import { BackfillInstructions } from './BackfillInstructions'

/** Render the real static copy, label metrics and form footer; only inactive
 * controls are skeletonized. Its layout follows the CSV form on narrow screens. */
export function BackfillSkeleton() {
  return (
    <form aria-hidden="true" inert onSubmit={(event) => event.preventDefault()}>
      <Stack>
        <BackfillInstructions />
        <Button fullWidth variant="light" disabled>
          Download template
        </Button>

        <FileInput
          label="Upload filled CSV"
          placeholder="Select CSV file"
          leftSection={<IconUpload size={14} />}
          size="md"
          disabled
        />

        <FormActions onCancel={() => {}} cancelDisabled>
          <Button disabled>Import</Button>
        </FormActions>
      </Stack>
    </form>
  )
}
