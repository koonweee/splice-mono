import {
  Alert,
  Button,
  Container,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
  Title,
} from '@mantine/core'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useLogin } from '../lib/auth'

export const Route = createFileRoute('/login')({
  validateSearch: (search): { redirect?: string } => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: LoginPage,
})

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { redirect } = Route.useSearch()

  const loginMutation = useLogin({ redirectTo: redirect ?? '/home' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loginMutation.mutate({ data: { email, password } })
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" mb="lg">
        Login
      </Title>

      <Paper withBorder shadow="md" p={30} radius="md">
        <form onSubmit={handleSubmit}>
          <Stack>
            <TextInput
              label="Email"
              placeholder="you@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              required
            />

            <PasswordInput
              label="Password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              required
            />

            <Button type="submit" fullWidth loading={loginMutation.isPending}>
              Login
            </Button>

            {loginMutation.isError && (
              <Alert color="red" title="Error">
                Login failed
              </Alert>
            )}
          </Stack>
        </form>
      </Paper>
    </Container>
  )
}
