import {
  ActionIcon,
  AppShell,
  Burger,
  Group,
  NavLink,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
} from '@tanstack/react-router'
import {
  CreditCard,
  Home,
  LogOut,
  MessageSquare,
  PieChart,
  Settings,
  TrendingUp,
} from 'lucide-react'
import { useLogout } from '../lib/auth'
import styles from './_authed.module.css'

export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ location, context }) => {
    // Skip auth check during SSR - cookies will authenticate API requests
    // The client will handle redirects after hydration if needed
    if (typeof window === 'undefined') {
      return
    }

    if (!context.auth.isAuthenticated()) {
      throw redirect({
        to: '/',
        search: { login: true, redirect: location.href },
      })
    }
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  const [opened, { toggle }] = useDisclosure()
  const location = useLocation()
  const logoutMutation = useLogout()

  const navItems = [
    { to: '/home', label: 'Home', icon: Home },
    { to: '/accounts', label: 'Accounts', icon: CreditCard },
    { to: '/transactions', label: 'Transactions', icon: TrendingUp },
    { to: '/analysis', label: 'Analysis', icon: PieChart },
    { to: '/ask', label: 'Ask', icon: MessageSquare },
    { to: '/settings', label: 'Settings', icon: Settings },
  ]

  const handleLogout = () => {
    logoutMutation.mutate({ data: {} })
  }

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !opened, desktop: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} size="sm" />
            <Text fw={700} size="lg">
              Splice
            </Text>
          </Group>
          <Tooltip label="Logout">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={handleLogout}
              loading={logoutMutation.isPending}
            >
              <LogOut size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Stack gap="xs">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={18} />}
              active={location.pathname === item.to}
              onClick={() => toggle()}
              styles={{
                root: { borderRadius: 'var(--mantine-radius-md)' },
                label: location.pathname === item.to ? { fontWeight: 600 } : {},
              }}
            />
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main className={styles.main}>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
