import { createFileRoute, redirect } from '@tanstack/react-router'
import { LandingPage } from '../components/pages/LandingPage'
import { validateIndexSearch } from '../lib/route-search'
import type { SessionOutcome } from '../lib/session'

export function redirectAuthenticatedIndex(sessionOutcome: SessionOutcome) {
  if (sessionOutcome === 'authenticated') {
    throw redirect({ to: '/home' })
  }
}

export const Route = createFileRoute('/')({
  validateSearch: validateIndexSearch,
  beforeLoad: ({ context }) => {
    redirectAuthenticatedIndex(context.sessionOutcome)
  },
  component: LandingPage,
})
