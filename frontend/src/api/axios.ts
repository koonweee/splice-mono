import { createIsomorphicFn } from '@tanstack/react-start'
import type { AxiosRequestConfig } from 'axios'
import { axios as browserRequest } from '../lib/browser-api-client'

export {
  axiosInstance,
  authRedirect,
  buildLoginRedirectUrl,
} from '../lib/browser-api-client'
export { resolveApiBaseUrl } from '../lib/api-base-url'

const request = createIsomorphicFn()
  .server(async (config: AxiosRequestConfig): Promise<unknown> => {
    const { getServerApiClient } =
      await import('../lib/server/api-client.server')
    return getServerApiClient().request(config)
  })
  .client(
    (config: AxiosRequestConfig): Promise<unknown> => browserRequest(config),
  )

/** The generated client shares its contract, never request credentials. */
export const axios = <T>(config: AxiosRequestConfig): Promise<T> =>
  request(config) as Promise<T>
