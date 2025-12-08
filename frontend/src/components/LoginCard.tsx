import {
  Alert,
  Button,
  Paper,
  PasswordInput,
  Stack,
  TextInput,
} from '@mantine/core'
import { useState } from 'react'
import { useLogin } from '../lib/auth'

export function LoginCard({ redirect }: { redirect?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const loginMutation = useLogin({ redirectTo: redirect ?? '/home' })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loginMutation.mutate({ data: { email, password } })
  }

  return (
    <Paper withBorder shadow="md" p={30} radius="md" w="100%">
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
  )
}

