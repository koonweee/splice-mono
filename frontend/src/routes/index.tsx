import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '../components/pages/LandingPage'
import { validateIndexSearch } from '../lib/route-search'

export const Route = createFileRoute('/')({
  validateSearch: validateIndexSearch,
  component: LandingPage,
})
