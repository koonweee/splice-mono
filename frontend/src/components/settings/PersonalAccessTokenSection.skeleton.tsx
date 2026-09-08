import {
  Box,
  Button,
  Group,
  Paper,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import styles from './PersonalAccessTokenSection.module.css'
import type { ReactNode } from 'react'

export function PersonalAccessTokenFrame({
  children,
}: {
  children: ReactNode
}) {
  return (
    <Paper withBorder p="lg" radius="md" data-testid="pat-section">
      <Stack gap="lg">
        <Stack gap={4}>
          <Title data-typography="sectionHeading" order={3}>
            Personal access tokens
          </Title>
          <Text data-typography="metadata" c="dimmed">
            Create tokens for REST API automation. The token is shown only once.
          </Text>
        </Stack>
        {children}
      </Stack>
    </Paper>
  )
}
export function TokenCardFrame({
  details,
  action,
  children,
  testId,
}: {
  details: ReactNode
  action: ReactNode
  children?: ReactNode
  testId?: string
}) {
  return (
    <Paper withBorder p="sm" radius="md" data-testid={testId}>
      <Stack gap={8}>
        <div className={styles.tokenSummary}>
          <Stack gap={2}>{details}</Stack>
          <div className={styles.tokenAction}>{action}</div>
        </div>
        {children}
      </Stack>
    </Paper>
  )
}
function TokenTextPlaceholder({
  role,
  width,
}: {
  role: string
  width: number
}) {
  return (
    <Box pos="relative" w={width}>
      <Text data-typography={role}>{'\u00A0'}</Text>
      <Skeleton pos="absolute" h="60%" top="20%" w="100%" />
    </Box>
  )
}
export function TokenCardsSkeleton() {
  return (
    <Stack gap="sm">
      {[0, 1].map((index) => (
        <TokenCardFrame
          key={index}
          details={
            <>
              <TokenTextPlaceholder role="rowTitle" width={130} />
              <TokenTextPlaceholder role="metadata" width={120} />
              <TokenTextPlaceholder role="metadata" width={160} />
            </>
          }
          action={
            <Button disabled variant="light" color="red" size="xs">
              Revoke <Skeleton h={10} w={80} ml={4} />
            </Button>
          }
        />
      ))}
    </Stack>
  )
}
export function AccessTokensSkeleton() {
  return (
    <PersonalAccessTokenFrame>
      <Stack gap="sm">
        <TextInput
          readOnly
          label="Token name"
          description="Leading and trailing spaces are trimmed. Up to 100 characters."
          size="md"
        />
        <Group gap="sm" wrap="wrap" align="flex-end">
          <Button disabled>Create token</Button>
          <Text data-typography="caption" c="dimmed">
            Token names are limited to 100 characters.
          </Text>
        </Group>
      </Stack>
      <Stack gap="sm">
        <Title data-typography="sectionHeading" order={4}>
          Active tokens
        </Title>
        <TokenCardsSkeleton />
      </Stack>
    </PersonalAccessTokenFrame>
  )
}
