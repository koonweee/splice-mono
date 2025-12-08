import { createFileRoute, Link } from '@tanstack/react-router'
import { Container, Title, Button, Stack, Text } from '@mantine/core'

export const Route = createFileRoute('/')({ component: LandingPage })

function LandingPage() {
  return (
    <Container
      size="xs"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stack align="center" gap="lg">
        <Title order={1} size="3rem">
          Splice
        </Title>
        <Text c="dimmed" size="lg">
          Your personal finance dashboard
        </Text>
        <Button component={Link} to="/login" size="lg">
          Login
        </Button>
      </Stack>
    </Container>
  )
}
