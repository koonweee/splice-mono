import { AsyncLocalStorage } from 'node:async_hooks'
import { ConfirmedLoggedOutError, TransientAuthError } from '../session-refresh'
import type { AxiosRequestConfig } from 'axios'

const SESSION_COOKIES = new Set(['splice_access_token', 'splice_refresh_token'])
const requestClients = new AsyncLocalStorage<ServerApiClient>()

export interface ServerApiClient {
  request: <T>(config: AxiosRequestConfig) => Promise<T>
}

export function createServerApiClient({
  cookieHeader = '',
  baseUrl,
  fetcher = fetch,
  signal,
  onSetCookie,
}: {
  cookieHeader?: string
  baseUrl: string
  fetcher?: typeof fetch
  signal?: AbortSignal
  onSetCookie: (cookies: Array<string>) => void
}): ServerApiClient {
  const origin = new URL(baseUrl)
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password
  ) {
    throw new Error('Invalid internal API origin')
  }
  const cookies = new Map<string, string>()
  for (const part of cookieHeader.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (SESSION_COOKIES.has(name)) cookies.set(name, value.join('='))
  }
  let refreshPromise: Promise<void> | undefined

  async function send(config: AxiosRequestConfig) {
    const url = new URL(config.url ?? '/', origin)
    if (url.origin !== origin.origin)
      throw new Error('Untrusted internal API target')
    for (const [key, value] of Object.entries(config.params ?? {})) {
      if (value !== undefined && value !== null)
        url.searchParams.set(key, String(value))
    }
    const headers = new Headers({ Accept: 'application/json' })
    if (cookies.size)
      headers.set(
        'Cookie',
        [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      )
    if (config.data !== undefined)
      headers.set('Content-Type', 'application/json')
    let response: Response
    try {
      response = await fetcher(url, {
        method: config.method ?? 'GET',
        headers,
        body:
          config.data === undefined ? undefined : JSON.stringify(config.data),
        signal:
          signal && config.signal
            ? AbortSignal.any([signal, config.signal as AbortSignal])
            : (signal ?? (config.signal as AbortSignal | undefined)),
        cache: 'no-store',
        redirect: 'error',
      })
    } catch {
      throw new TransientAuthError('The service is temporarily unavailable')
    }
    const setCookies = response.headers.getSetCookie()
    if (setCookies.length) {
      // Preserve each original header and its security/domain/expiry attributes.
      onSetCookie(setCookies)
      for (const cookie of setCookies) {
        const [pair] = cookie.split(';')
        const [name, ...value] = pair.split('=')
        if (SESSION_COOKIES.has(name)) {
          if (!value.join('=')) cookies.delete(name)
          else cookies.set(name, value.join('='))
        }
      }
    }
    return response
  }

  async function refresh() {
    refreshPromise ??= (async () => {
      const response = await send({
        url: '/user/refresh',
        method: 'POST',
        data: {},
      })
      // Deliberately discard the token response; only HTTP-only cookies survive.
      if ([400, 401, 403].includes(response.status))
        throw new ConfirmedLoggedOutError()
      if (!response.ok) throw new TransientAuthError()
    })()
    return refreshPromise
  }

  return {
    async request<T>(config: AxiosRequestConfig): Promise<T> {
      if (!cookies.size) throw new ConfirmedLoggedOutError()
      let response = await send(config)
      if (
        [401, 403].includes(response.status) &&
        config.url !== '/user/refresh'
      ) {
        await refresh()
        response = await send(config)
      }
      if ([401, 403].includes(response.status))
        throw new ConfirmedLoggedOutError()
      if (!response.ok)
        throw new TransientAuthError(`Request failed (${response.status})`)
      return response.status === 204
        ? (undefined as T)
        : (response.json() as Promise<T>)
    },
  }
}

export function withServerApiClient<T>(
  client: ServerApiClient,
  callback: () => T,
): T {
  return requestClients.run(client, callback)
}

export function getServerApiClient(): ServerApiClient {
  const client = requestClients.getStore()
  if (!client) throw new Error('Server API request outside request middleware')
  return client
}
