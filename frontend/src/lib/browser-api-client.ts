import Axios from 'axios'
import {
  assertAuthGeneration,
  clearPrivateCaches,
  getAuthGeneration,
} from './auth-generation'
import { resolveApiBaseUrl } from './api-base-url'
import { isConfirmedLoggedOutError, refreshSession } from './session-refresh'
import type {
  AxiosError,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from 'axios'

export { resolveApiBaseUrl } from './api-base-url'

const axiosInstance = Axios.create({
  baseURL: resolveApiBaseUrl(),
  // Include cookies in all requests for authentication
  withCredentials: true,
})

type AuthenticatedRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean
  _authGeneration?: number
}
let refreshInFlight: { generation: number; promise: Promise<void> } | undefined

// Preserve the original identity on every dispatch, including interceptor replays.
axiosInstance.interceptors.request.use(
  (config: AuthenticatedRequestConfig) => {
    config._authGeneration ??= getAuthGeneration()
    assertAuthGeneration(config._authGeneration)
    return config
  },
  (error: unknown) => {
    throw error
  },
  { synchronous: true },
)

function refreshForGeneration(generation: number): Promise<void> {
  assertAuthGeneration(generation)
  if (refreshInFlight?.generation === generation) return refreshInFlight.promise
  const promise = refreshSession().then(() => assertAuthGeneration(generation))
  const state = { generation, promise }
  refreshInFlight = state
  void promise
    .finally(() => {
      if (refreshInFlight === state) refreshInFlight = undefined
    })
    .catch(() => {
      /* callers handle refresh errors */
    })
  return promise
}

export function buildLoginRedirectUrl(
  currentPath = typeof window === 'undefined'
    ? '/'
    : `${window.location.pathname}${window.location.search}${window.location.hash}`,
): string {
  const params = new URLSearchParams({ login: 'true' })

  if (currentPath && currentPath !== '/') {
    params.set('redirect', currentPath)
  }

  return `/?${params.toString()}`
}

export const authRedirect = {
  toLogin: () => {
    if (typeof window !== 'undefined') {
      clearPrivateCaches()
      window.location.href = buildLoginRedirectUrl()
    }
  },
}

// Retry each request at most once, only within the identity that dispatched it.
axiosInstance.interceptors.response.use(
  (response) => {
    const generation = (response.config as AuthenticatedRequestConfig)
      ._authGeneration
    if (generation !== undefined) assertAuthGeneration(generation)
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | AuthenticatedRequestConfig
      | undefined
    if (!originalRequest) return Promise.reject(error)
    const generation = originalRequest._authGeneration ?? getAuthGeneration()
    assertAuthGeneration(generation)
    if (error.response?.status !== 401 || originalRequest._retry)
      return Promise.reject(error)
    const isAuthEndpoint = [
      '/user/refresh',
      '/user/oauth/google/start',
      '/user/oauth/google/callback',
    ].some((path) => originalRequest.url?.includes(path))
    if (isAuthEndpoint) return Promise.reject(error)
    originalRequest._retry = true
    try {
      await refreshForGeneration(generation)
      assertAuthGeneration(generation)
      return axiosInstance(originalRequest)
    } catch (refreshError) {
      assertAuthGeneration(generation)
      if (isConfirmedLoggedOutError(refreshError)) authRedirect.toLogin()
      return Promise.reject(refreshError)
    }
  },
)

// Export the axios wrapper for Orval
export const axios = <T>(config: AxiosRequestConfig): Promise<T> => {
  const generation = getAuthGeneration()
  const request: AxiosRequestConfig & { _authGeneration: number } = {
    ...config,
    _authGeneration: generation,
  }
  return axiosInstance(request).then(({ data }) => {
    assertAuthGeneration(generation)
    return data
  })
}

// Export instance for direct use if needed
export { axiosInstance }
