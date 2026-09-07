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
import { Link } from '@tanstack/react-router'
import {
  CreditCard,
  Home,
  LogOut,
  PieChart,
  Settings,
  TrendingUp,
} from 'lucide-react'
import styles from './AppShellLayout.module.css'
import type { ReactNode } from 'react'
import type { PrimaryDestination } from '../lib/navigation-preload'

/** Shared visual shell; session, query preparation and logout ownership stay with its caller. */
export function AppShellLayout({
  pathname,
  onLogout,
  logoutPending = false,
  onPrepareDestination,
  children,
  headerActions,
}: {
  pathname: string
  onLogout: () => void
  logoutPending?: boolean
  onPrepareDestination?: (to: PrimaryDestination) => void
  headerActions?: ReactNode
  children: ReactNode
}) {
  const [opened, { toggle }] = useDisclosure()
  const navItems = [
    { to: '/home', label: 'Home', icon: Home },
    { to: '/transactions', label: 'Transactions', icon: TrendingUp },
    { to: '/analysis', label: 'Analysis', icon: PieChart },
    { to: '/accounts', label: 'Accounts', icon: CreditCard },
    { to: '/settings', label: 'Settings', icon: Settings },
  ] as const

  return (
    <AppShell
      header={{
        height: 'calc(max(60px, 3.75rem) + var(--splice-safe-area-top, 0px))',
      }}
      navbar={{
        width: 260,
        breakpoint: 'sm',
        collapsed: { mobile: !opened, desktop: !opened },
      }}
      padding="md"
    >
      <AppShell.Header className={styles.header}>
        <Group
          h="100%"
          className={styles.headerContent}
          justify="space-between"
          wrap="nowrap"
          gap={8}
        >
          <Group wrap="nowrap" gap={8}>
            <Burger
              aria-label={opened ? 'Close navigation' : 'Open navigation'}
              aria-expanded={opened}
              aria-controls="main-navigation"
              opened={opened}
              onClick={toggle}
              size="sm"
              className={styles.navigationToggle}
            />
            <Text fw={700} size="lg">
              Splice
            </Text>
          </Group>
          <Group gap={8} wrap="nowrap" className={styles.headerActions}>
            {headerActions}
            <Tooltip label="Logout">
              <ActionIcon
                aria-label="Log out"
                variant="subtle"
                color="gray"
                c="dimmed"
                onClick={onLogout}
                loading={logoutPending}
              >
                <LogOut size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        p="md"
        className={styles.navbar}
        id="main-navigation"
        inert={!opened}
        aria-hidden={!opened}
      >
        <Stack gap="xs">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              component={Link}
              to={item.to}
              label={item.label}
              leftSection={<item.icon size={18} />}
              active={pathname === item.to}
              onPointerEnter={() => onPrepareDestination?.(item.to)}
              onFocus={() => onPrepareDestination?.(item.to)}
              onTouchStart={() => onPrepareDestination?.(item.to)}
              onClick={() => {
                onPrepareDestination?.(item.to)
                toggle()
              }}
            />
          ))}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main className={styles.main}>{children}</AppShell.Main>
    </AppShell>
  )
}
