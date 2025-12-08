import { Button, Container, Stack, Text, Title } from '@mantine/core'
import {
  createFileRoute,
  Link,
  useNavigate,
  useSearch,
} from '@tanstack/react-router'
import { ArrowRight, LogIn } from 'lucide-react'
import { LoginCard } from '../components/LoginCard'
import { authStorage } from '../lib/auth'

export const Route = createFileRoute('/')({
  validateSearch: (search): { login?: boolean; redirect?: string } => ({
    login: search.login === true || search.login === 'true',
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LandingPage,
})

function LandingPage() {
  const isAuthenticated = authStorage.isAuthenticated()
  const { login: showLogin, redirect } = useSearch({ from: '/' })
  const navigate = useNavigate()

  const handleLoginClick = () => {
    navigate({ to: '/', search: { login: true } })
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
        {showLogin && !isAuthenticated ? (
          <LoginCard redirect={redirect} />
        ) : isAuthenticated ? (
          <Button
            component={Link}
            to="/home"
            size="lg"
            rightSection={<ArrowRight size={18} />}
          >
            Enter Splice
          </Button>
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
