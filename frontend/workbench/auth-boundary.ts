import { notifications } from '@mantine/notifications'

export function startGoogleLogin() {
  notifications.show({
    title: 'Workbench login',
    message:
      'Authentication is simulated here. No login page or external connection was opened.',
  })
}

export function simulateLogout() {
  notifications.show({
    title: 'Workbench logout',
    message: 'Logout was invoked in this preview. Your app session is unchanged.',
  })
}
