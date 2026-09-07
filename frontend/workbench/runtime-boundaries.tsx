/** Workbench-only session/presentation state. Production hooks resolve here through Vite. */
import { createContext, useContext, useState } from 'react'
import { queryOptions, useQuery } from '@tanstack/react-query'
import {
  ConfirmedLoggedOutError,
  TransientAuthError,
} from '../src/lib/session-refresh'
import { DEFAULT_APPEARANCE } from '../src/lib/design-system/appearance'
import { axios } from './fixture-api'
import { FIXTURE_NOW } from './fixtures'
import type { ReactNode } from 'react'
import type { User } from '../src/api/models'

export const sessionQueryKey = ['/user/me'] as const
export const sessionQueryOptions = () =>
  queryOptions({
    queryKey: sessionQueryKey,
    queryFn: () => axios<User>({ url: '/user/me' }),
    staleTime: Infinity,
    retry: false,
  })
export const useCurrentUser = () => useQuery(sessionQueryOptions())
export function useSession() {
  const state = new URLSearchParams(location.search).get('state')
  const unavailable = state === 'anonymous' || state === 'unavailable'
  const query = useQuery({
    ...sessionQueryOptions(),
    enabled: !unavailable,
    select: (user) => ({ user }),
  })
  return unavailable
    ? {
        ...query,
        data: undefined,
        isPending: false,
        error:
          state === 'anonymous'
            ? new ConfirmedLoggedOutError()
            : new TransientAuthError(),
      }
    : query
}
const PresentationContext = createContext({
  maskBalances: false,
  setMaskBalances: (_value: boolean | ((value: boolean) => boolean)) => {},
  today: FIXTURE_NOW.slice(0, 10),
})
export const usePresentationPreferences = () => useContext(PresentationContext)
export function FixturePresentation({
  masked,
  children,
}: {
  masked: boolean
  children: ReactNode
}) {
  const [maskBalances, setMaskBalances] = useState(masked)
  return (
    <PresentationContext.Provider
      value={{ maskBalances, setMaskBalances, today: FIXTURE_NOW.slice(0, 10) }}
    >
      {children}
    </PresentationContext.Provider>
  )
}
export const fixturePresentation = {
  appearance: DEFAULT_APPEARANCE,
  maskBalances: false,
  today: FIXTURE_NOW.slice(0, 10),
}
