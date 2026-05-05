import { Button, Paper, Stack } from '@mantine/core'
import { Chrome } from 'lucide-react'
import { startGoogleLogin } from '../lib/auth'

export function LoginCard({ redirect }: { redirect?: string }) {
  const handleLogin = () => {
    startGoogleLogin(redirect)
  }

  return (
    <Paper withBorder shadow="md" p={30} radius="md" w="100%">
      <Stack>
        <Button
          type="button"
          fullWidth
          leftSection={<Chrome size={18} />}
          onClick={handleLogin}
        >
          Continue with Google
        </Button>
      </Stack>
    </Paper>
  )
}
