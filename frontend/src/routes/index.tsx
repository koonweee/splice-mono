import { Button, Container, Stack, Text, Title } from '@mantine/core'
import {
  Link,
  createFileRoute,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import { ArrowRight, LogIn } from 'lucide-react'
import { LoginCard } from '../components/LoginCard'
import { isConfirmedLoggedOutError } from '../lib/session-refresh'
import { useSession } from '../lib/session'

export const Route = createFileRoute('/')({
  validateSearch: (search): { login?: boolean; redirect?: string } => ({
    login: search.login === true || search.login === 'true',
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LandingPage,
})

export function LandingPage() {
  const { login: showLogin, redirect } = useSearch({ from: '/' })
  const navigate = useNavigate()
  const session = useSession()
  const isAuthenticated = Boolean(session.data)
  const isConfirmedLoggedOut = isConfirmedLoggedOutError(session.error)
  const hasTransientSessionError = Boolean(
    session.error && !isConfirmedLoggedOut,
  )

  const handleLoginClick = () => {
    navigate({ to: '/', search: { login: true } })
  }

  const handleRetryClick = () => {
    void session.refetch()
  }

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
        {isAuthenticated ? (
          <Button
            component={Link}
            to="/home"
            size="lg"
            rightSection={<ArrowRight size={18} />}
          >
            Enter Splice
          </Button>
        ) : session.isPending ? (
          <Button size="lg" loading>
            Checking session
          </Button>
        ) : hasTransientSessionError ? (
          <Button onClick={handleRetryClick} size="lg">
            Retry
          </Button>
        ) : showLogin || isConfirmedLoggedOut ? (
          <LoginCard redirect={redirect} />
        ) : (
          <Button
            onClick={handleLoginClick}
            size="lg"
            rightSection={<LogIn size={18} />}
          >
            Login
          </Button>
        )}
      </Stack>
    </Container>
  )
}
