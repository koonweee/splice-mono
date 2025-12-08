import { Button, Container, Stack, Text, Title } from '@mantine/core'
import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertCircle, Home } from 'lucide-react'

export const Route = createFileRoute('/_authed/$')({
  component: NotFoundPage,
})

function NotFoundPage() {
  return (
    <Container size="sm" py="xl">
      <Stack align="center" gap="lg">
        <AlertCircle size={64} color="var(--mantine-color-gray-5)" />
        <Title order={1} ta="center">
          Page Not Found
        </Title>
        <Text c="dimmed" ta="center" size="lg">
          The page you're looking for doesn't exist or has been moved.
        </Text>
        <Button
          component={Link}
          to="/home"
          leftSection={<Home size={18} />}
          size="md"
        >
          Go to Home
        </Button>
      </Stack>
    </Container>
  )
}
