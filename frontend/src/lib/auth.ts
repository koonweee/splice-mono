import { useNavigate } from '@tanstack/react-router'
import {
  useUserControllerLogin,
  useUserControllerLogout,
  useUserControllerLogoutAll,
} from '../api/clients/spliceAPI'

// Key used to track if user has logged in (for SSR auth check)
// The actual tokens are stored in HTTP-only cookies by the backend
const AUTH_FLAG_KEY = 'splice_authenticated'

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
 * Login hook that sets auth flag and navigates on success.
 * Tokens are automatically stored in HTTP-only cookies by the backend.
 */
export function useLogin(options?: { redirectTo?: string }) {
  const navigate = useNavigate()
  const redirectTo = options?.redirectTo ?? '/'

  return useUserControllerLogin({
    mutation: {
      onSuccess: () => {
        authStorage.setAuthenticated()
        navigate({ to: redirectTo })
      },
    },
  })
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
