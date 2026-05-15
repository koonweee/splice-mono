import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  useUserControllerLogout,
  useUserControllerLogoutAll,
} from '../api/clients/spliceAPI'
import {
  revokeAllPushSubscriptions,
  revokeCurrentDevicePushSubscription,
} from './notifications/browser-push'
import { clearAppBadge } from './pwa/app-badge'
import { resolveApiBaseUrl } from './api-base-url'
import { sessionQueryKey } from './session'

const DEFAULT_LOGIN_REDIRECT = '/home'
const RELATIVE_URL_ORIGIN = 'http://splice.local'

export function getSafeRelativeRedirect(
  redirectTo?: string,
  fallback = DEFAULT_LOGIN_REDIRECT,
): string {
  const candidate = redirectTo?.trim()

  if (
    !candidate ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\')
  ) {
    return fallback
  }

  try {
    const parsedUrl = new URL(candidate, RELATIVE_URL_ORIGIN)

    if (parsedUrl.origin !== RELATIVE_URL_ORIGIN) {
      return fallback
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`
  } catch {
    return fallback
  }
}

export function buildGoogleOAuthStartUrl(redirectTo?: string): string {
  const apiBaseUrl = resolveApiBaseUrl()
  const startPath = '/user/oauth/google/start'
  const safeRedirect = getSafeRelativeRedirect(redirectTo)

  if (!apiBaseUrl) {
    const params = new URLSearchParams({ redirect: safeRedirect })
    return `${startPath}?${params.toString()}`
  }

  const startUrl = new URL(startPath, apiBaseUrl)
  startUrl.searchParams.set('redirect', safeRedirect)

  return startUrl.toString()
}

export function startGoogleLogin(redirectTo?: string): void {
  if (typeof window === 'undefined') return

  window.location.assign(buildGoogleOAuthStartUrl(redirectTo))
}

export function clearSessionCache(
  queryClient: Pick<
    ReturnType<typeof useQueryClient>,
    'removeQueries' | 'invalidateQueries'
  >,
): void {
  queryClient.removeQueries({ queryKey: sessionQueryKey })
}

/**
 * Logout hook that clears cached session state and navigates.
 * The backend clears the HTTP-only cookies.
 */
export function useLogout(options?: { redirectTo?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const redirectTo = options?.redirectTo ?? '/'

  return useUserControllerLogout({
    mutation: {
      onMutate: async () => {
        await revokeCurrentDevicePushSubscription()
        await clearAppBadge()
      },
      onSuccess: () => {
        clearSessionCache(queryClient)
        navigate({ to: redirectTo })
      },
      onError: () => {
        clearSessionCache(queryClient)
        navigate({ to: redirectTo })
      },
    },
  })
}

/**
 * Logout from all devices hook.
 * The backend clears the HTTP-only cookies.
 */
export function useLogoutAll(options?: { redirectTo?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const redirectTo = options?.redirectTo ?? '/'

  return useUserControllerLogoutAll({
    mutation: {
      onMutate: async () => {
        await revokeAllPushSubscriptions()
        await clearAppBadge()
      },
      onSuccess: () => {
        clearSessionCache(queryClient)
        navigate({ to: redirectTo })
      },
      onError: () => {
        clearSessionCache(queryClient)
        navigate({ to: redirectTo })
      },
    },
  })
}
