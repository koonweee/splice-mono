import Axios, { AxiosError, AxiosRequestConfig } from 'axios'

const axiosInstance = Axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  // Include cookies in all requests for authentication
  withCredentials: true,
})

// State for managing token refresh
let isRefreshing = false
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

      try {
        // Make refresh request - cookies will be sent automatically
        // The backend will set new cookies in the response
        await axiosInstance.post('/user/refresh', {})

        processQueue(null)

        // Retry the original request - new cookies will be sent automatically
        return axiosInstance(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError as Error)
        window.location.href = '/?login=true'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
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
