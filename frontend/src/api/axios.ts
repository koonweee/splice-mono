import Axios, { AxiosError, AxiosRequestConfig } from 'axios'

const AUTH_FLAG_KEY = 'splice_authenticated'

const axiosInstance = Axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
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

const clearAuthAndRedirect = () => {
  // Clear the auth flag so routing doesn't get stuck in a loop
  if (typeof window !== 'undefined') {
    localStorage.removeItem(AUTH_FLAG_KEY)
    window.location.href = '/?login=true'
  }
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
        originalRequest.url?.includes('/user/login') ||
        originalRequest.url?.includes('/user/register') ||
        originalRequest.url?.includes('/user/refresh')

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
          // Make refresh request - cookies will be sent automatically
          // The backend will set new cookies in the response
          await axiosInstance.post('/user/refresh', {})
          processQueue(null)
        } catch (refreshError) {
          processQueue(refreshError as Error)
          clearAuthAndRedirect()
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
