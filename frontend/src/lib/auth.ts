import { useNavigate } from '@tanstack/react-router'
import {
  useUserControllerLogout,
  useUserControllerLogoutAll,
} from '../api/clients/spliceAPI'
import { resolveApiBaseUrl } from '../api/axios'

// Key used to track if user has logged in (for SSR auth check)
// The actual tokens are stored in HTTP-only cookies by the backend
const AUTH_FLAG_KEY = 'splice_authenticated'
const DEFAULT_LOGIN_REDIRECT = '/home'
const RELATIVE_URL_ORIGIN = 'http://splice.local'

export const authStorage = {
  /**
   * Mark user as authenticated (called after successful login)
   * This flag is used for client-side routing decisions.
   * The actual authentication is handled by HTTP-only cookies.
   */
  setAuthenticated: (): void => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTH_FLAG_KEY, 'true')
    }
  },

  /**
   * Clear authentication flag (called after logout)
   */
  clearAuthenticated: (): void => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(AUTH_FLAG_KEY)
    }
  },

  /**
   * Check if user appears to be authenticated.
   * This is used for client-side routing decisions.
   * The actual authentication is verified by the backend via HTTP-only cookies.
   */
  isAuthenticated: (): boolean => {
    // On server (SSR), we can't check cookies, so assume not authenticated
    // This prevents protected content from being rendered on the server
    if (typeof window === 'undefined') return false
    return localStorage.getItem(AUTH_FLAG_KEY) === 'true'
  },
}

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

export async function validateSession(): Promise<boolean> {
  try {
    const apiBaseUrl = resolveApiBaseUrl()
    const meUrl = apiBaseUrl ? new URL('/user/me', apiBaseUrl) : '/user/me'
    const response = await fetch(meUrl, {
      credentials: 'include',
    })

    if (!response.ok) {
      throw new Error('Session is not authenticated')
    }

    authStorage.setAuthenticated()
    return true
  } catch {
    authStorage.clearAuthenticated()
    return false
  }
}

// Keep tokenStorage as an alias for backwards compatibility during migration
export const tokenStorage = {
  hasTokens: authStorage.isAuthenticated,
  clearTokens: authStorage.clearAuthenticated,
  // These are no-ops now since tokens are in HTTP-only cookies
  setTokens: (_accessToken: string, _refreshToken: string): void => {
    authStorage.setAuthenticated()
  },
  getAccessToken: (): string | null => null,
  getRefreshToken: (): string | null => null,
  setAccessToken: (_token: string): void => {},
  removeAccessToken: (): void => {},
  setRefreshToken: (_token: string): void => {},
  removeRefreshToken: (): void => {},
}

/**
 * Logout hook that clears auth flag and navigates.
 * The backend clears the HTTP-only cookies.
 */
export function useLogout(options?: { redirectTo?: string }) {
  const navigate = useNavigate()
  const redirectTo = options?.redirectTo ?? '/'

  return useUserControllerLogout({
    mutation: {
      onSuccess: () => {
        authStorage.clearAuthenticated()
        navigate({ to: redirectTo })
      },
      onError: () => {
        // Even if the server request fails, clear auth flag locally
        authStorage.clearAuthenticated()
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
  const redirectTo = options?.redirectTo ?? '/'

  return useUserControllerLogoutAll({
    mutation: {
      onSuccess: () => {
        authStorage.clearAuthenticated()
        navigate({ to: redirectTo })
      },
      onError: () => {
        authStorage.clearAuthenticated()
        navigate({ to: redirectTo })
      },
    },
  })
}
