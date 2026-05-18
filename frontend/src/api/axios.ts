import Axios from 'axios'
import type { AxiosError, AxiosRequestConfig } from 'axios'
import { resolveApiBaseUrl } from '../lib/api-base-url'
import {
  isConfirmedLoggedOutError,
  refreshSession,
} from '../lib/session-refresh'

export { resolveApiBaseUrl } from '../lib/api-base-url'

const axiosInstance = Axios.create({
  baseURL: resolveApiBaseUrl(),
  // Include cookies in all requests for authentication
  withCredentials: true,
})

// State for managing token refresh
let isRefreshing = false
let refreshPromise: Promise<void> | null = null
let failedQueue: Array<{
  resolve: () => void
  reject: (error: Error) => void
}> = []

const processQueue = (error: Error | null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error)
    } else {
      promise.resolve()
    }
  })
  failedQueue = []
}

export function buildLoginRedirectUrl(
  currentPath =
    typeof window === 'undefined'
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
      window.location.href = buildLoginRedirectUrl()
    }
  },
}

// Response interceptor - handle 401 and refresh token via cookies
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean
    }

    // Check if this is a 401 error and we haven't already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Don't try to refresh for auth endpoints
      const isAuthEndpoint =
        originalRequest.url?.includes('/user/refresh') ||
        originalRequest.url?.includes('/user/oauth/google/start') ||
        originalRequest.url?.includes('/user/oauth/google/callback')

      if (isAuthEndpoint) {
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // Queue this request to retry after refresh completes
        // Use the existing refresh promise to avoid race conditions
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: () => {
              resolve(axiosInstance(originalRequest))
            },
            reject: (err: Error) => reject(err),
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      // Create a single refresh promise that all queued requests will wait for
      refreshPromise = (async () => {
        try {
          await refreshSession()
          processQueue(null)
        } catch (refreshError) {
          processQueue(refreshError as Error)
          if (isConfirmedLoggedOutError(refreshError)) {
            authRedirect.toLogin()
          }
          throw refreshError
        } finally {
          isRefreshing = false
          refreshPromise = null
        }
      })()

      try {
        await refreshPromise
        // Retry the original request - new cookies will be sent automatically
        return axiosInstance(originalRequest)
      } catch (refreshError) {
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)

// Export the axios wrapper for Orval
export const axios = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance(config).then(({ data }) => data)
}

// Export instance for direct use if needed
export { axiosInstance }
