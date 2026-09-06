import {
  Box,
  Button,
  FileInput,
  Group,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core'
import { IconUpload } from '@tabler/icons-react'
import { ACCOUNT_PROVIDERS } from '../accounts/account-providers'
import { BackfillInstructions } from '../accounts/BackfillInstructions'
import { FormActions } from '../forms/FormActions'

export function AddAccountSkeleton() {
  return (
    <Stack gap="md">
      {ACCOUNT_PROVIDERS.map((provider) => (
        <Box
          key={provider.id}
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-md)',
            padding: 'var(--mantine-spacing-md)',
          }}
        >
          <Group>
            <Skeleton h={24} w={24} />
            <Box pos="relative">
              <Text fw={500} style={{ visibility: 'hidden' }}>
                {provider.name}
              </Text>
              <Skeleton h={14} w="100%" pos="absolute" top="20%" />
            </Box>
          </Group>
        </Box>
      ))}
    </Stack>
  )
}

/** Render the real static copy, label metrics and form footer; only inactive
 * controls are skeletonized. Its layout follows the CSV form on narrow screens. */
export function BackfillSkeleton() {
  return (
    <form aria-hidden="true" inert onSubmit={(event) => event.preventDefault()}>
      <Stack>
        <BackfillInstructions />
        <Skeleton>
          <Button fullWidth variant="light" disabled>
            Download template
          </Button>
        </Skeleton>
        <Box pos="relative">
          <FileInput
            label="Upload filled CSV"
            placeholder="Select CSV file"
            leftSection={<IconUpload size={14} />}
            size="md"
            disabled
          />
          <Skeleton h={42} pos="absolute" bottom={0} w="100%" />
        </Box>
        <FormActions onCancel={() => {}} cancelDisabled>
          <Button disabled>
            <Skeleton component="span">Import</Skeleton>
          </Button>
        </FormActions>
      </Stack>
    </form>
  )
}
